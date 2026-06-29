// Postgres for invite codes, revocable sessions, and login rate-limiting.
// Schema is created on first use.
import { Pool } from "pg";
import { randomBytes, createHmac } from "crypto";

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return pool;
}

async function init(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      code        TEXT PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at     TIMESTAMPTZ,
      used_by     TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      jti         TEXT PRIMARY KEY,
      email       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    );
    -- The mail password lives here (AES-256-GCM encrypted), not in the cookie, so
    -- a stolen cookie + SESSION_SECRET no longer reveals the user's permanent
    -- password — only an opaque, revocable jti. Added via ALTER for existing DBs.
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS account_id   TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS enc_password TEXT;
    CREATE TABLE IF NOT EXISTS auth_attempts (
      ip_hash     TEXT NOT NULL,
      kind        TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS auth_attempts_lookup
      ON auth_attempts (ip_hash, kind, attempted_at);
  `);
}

function db(): Promise<void> {
  if (!ready) ready = init();
  return ready;
}

// ---------- invite codes ----------

// Atomically consume an unused invite code. Returns true if it was valid+unused.
export async function consumeInviteCode(code: string, usedBy: string): Promise<boolean> {
  await db();
  const r = await getPool().query(
    `UPDATE invite_codes SET used_at = now(), used_by = $2
     WHERE code = $1 AND used_at IS NULL RETURNING code`,
    [code.trim(), usedBy]
  );
  return r.rowCount === 1;
}

export async function createInviteCodes(codes: string[]): Promise<void> {
  await db();
  await getPool().query(
    `INSERT INTO invite_codes (code) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`,
    [codes]
  );
}

// Generate `count` cryptographically-random invite codes (96-bit) and store them.
export async function generateInviteCodes(count = 1): Promise<string[]> {
  const codes = Array.from({ length: count }, () => randomBytes(12).toString("hex"));
  await createInviteCodes(codes);
  return codes;
}

// Undo a consume (used when account provisioning fails after the code was taken).
export async function releaseInviteCode(code: string): Promise<void> {
  await db();
  await getPool().query(
    `UPDATE invite_codes SET used_at = NULL, used_by = NULL WHERE code = $1`,
    [code.trim()]
  );
}

// ---------- sessions (revocable) ----------

const SESSION_DAYS = 7;

export interface SessionRow {
  email: string;
  accountId: string;
  encPassword: string;
}

// Create a server-side session row holding the (encrypted) mail credentials;
// returns the opaque session id to embed in the cookie. Lets us revoke sessions
// (logout / compromise) and keeps the password off the client entirely.
export async function newSession(
  email: string,
  accountId: string,
  encPassword: string
): Promise<string> {
  await db();
  const jti = randomBytes(24).toString("hex");
  await getPool().query(
    `INSERT INTO sessions (jti, email, account_id, enc_password, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [jti, email, accountId, encPassword, String(SESSION_DAYS)]
  );
  return jti;
}

// Returns the session's stored credentials if the id is valid and unexpired,
// else null. enc_password is still AES-256-GCM ciphertext here — the caller
// decrypts it. Pre-migration rows (no enc_password) return null and force a
// re-login, which is the intended graceful upgrade path.
export async function getSessionRow(jti: string): Promise<SessionRow | null> {
  await db();
  const r = await getPool().query(
    `SELECT email, account_id, enc_password FROM sessions
     WHERE jti = $1 AND expires_at > now()`,
    [jti]
  );
  if (r.rowCount !== 1) return null;
  const row = r.rows[0];
  if (!row.enc_password || !row.account_id) return null;
  return { email: row.email as string, accountId: row.account_id as string, encPassword: row.enc_password as string };
}

export async function revokeSession(jti: string): Promise<void> {
  await db();
  await getPool().query(`DELETE FROM sessions WHERE jti = $1`, [jti]);
}

// ---------- rate limiting (hashed IP) ----------

// Keyed hash of the client IP so we never store raw addresses. SESSION_SECRET is
// the HMAC key, so hashes can't be reversed/rainbow-tabled without it.
export function hashIp(ip: string): string {
  const key = process.env.SESSION_SECRET || "";
  return createHmac("sha256", key).update(ip).digest("hex");
}

// True if this IP has made >= `max` attempts of `kind` within `windowSecs`.
export async function isRateLimited(
  ipHash: string,
  kind: string,
  max: number,
  windowSecs: number
): Promise<boolean> {
  await db();
  const r = await getPool().query(
    `SELECT count(*)::int AS n FROM auth_attempts
     WHERE ip_hash = $1 AND kind = $2
       AND attempted_at > now() - ($3 || ' seconds')::interval`,
    [ipHash, kind, String(windowSecs)]
  );
  return (r.rows[0].n as number) >= max;
}

export async function recordAttempt(ipHash: string, kind: string): Promise<void> {
  await db();
  const p = getPool();
  await p.query(`INSERT INTO auth_attempts (ip_hash, kind) VALUES ($1, $2)`, [ipHash, kind]);
  // Opportunistic cleanup of old rows so the table stays small.
  await p.query(`DELETE FROM auth_attempts WHERE attempted_at < now() - interval '1 day'`);
}

// Clear an IP's attempts of a kind (e.g. after a successful login).
export async function clearAttempts(ipHash: string, kind: string): Promise<void> {
  await db();
  await getPool().query(`DELETE FROM auth_attempts WHERE ip_hash = $1 AND kind = $2`, [ipHash, kind]);
}

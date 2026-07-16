// Postgres for users, passkey credentials, invite codes, revocable sessions,
// and login rate-limiting. Schema is created on first use.
//
// Zero-access design notes:
//   - users.wrapped_key_* hold the user's PGP private key encrypted with keys
//     the server never sees (passkey PRF output / recovery-code derivation).
//   - users.recovery_auth_hash is SHA-256 of a *derived* auth key, split from
//     the same recovery code by HKDF with a different info string, so this
//     verifier is useless for decrypting the wrapped private key.
//   - invite codes are stored as SHA-256 hashes: a leaked DB doesn't hand out
//     usable signup codes.
import { Pool } from "pg";
import { randomBytes, createHmac, createHash, timingSafeEqual } from "crypto";

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
      code_hash   TEXT PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at     TIMESTAMPTZ,
      used_by     TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id                   BIGSERIAL PRIMARY KEY,
      username             TEXT NOT NULL UNIQUE,
      email                TEXT NOT NULL UNIQUE,
      account_id           TEXT NOT NULL,
      enc_mail_password    TEXT NOT NULL,
      pgp_public_key       TEXT NOT NULL,
      wrapped_key_recovery TEXT NOT NULL,
      recovery_auth_hash   TEXT NOT NULL,
      totp_secret_enc      TEXT NOT NULL,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id              TEXT PRIMARY KEY,
      user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key      TEXT NOT NULL,
      counter         BIGINT NOT NULL DEFAULT 0,
      transports      TEXT,
      prf_capable     BOOLEAN NOT NULL DEFAULT false,
      wrapped_key_prf TEXT,
      nickname        TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at    TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS webauthn_credentials_user
      ON webauthn_credentials (user_id);
    CREATE TABLE IF NOT EXISTS sessions (
      jti         TEXT PRIMARY KEY,
      user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    );
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

// ---------- invite codes (stored hashed) ----------

function hashInvite(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

// Atomically consume an unused invite code. Returns true if it was valid+unused.
export async function consumeInviteCode(code: string, usedBy: string): Promise<boolean> {
  await db();
  const r = await getPool().query(
    `UPDATE invite_codes SET used_at = now(), used_by = $2
     WHERE code_hash = $1 AND used_at IS NULL RETURNING code_hash`,
    [hashInvite(code), usedBy]
  );
  return r.rowCount === 1;
}

// Non-consuming validity check, for early feedback at the start of signup.
export async function inviteCodeUsable(code: string): Promise<boolean> {
  await db();
  const r = await getPool().query(
    `SELECT 1 FROM invite_codes WHERE code_hash = $1 AND used_at IS NULL`,
    [hashInvite(code)]
  );
  return r.rowCount === 1;
}

export async function createInviteCodes(codes: string[]): Promise<void> {
  await db();
  await getPool().query(
    `INSERT INTO invite_codes (code_hash) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`,
    [codes.map(hashInvite)]
  );
}

// Generate `count` cryptographically-random invite codes (96-bit), store their
// hashes, and return the plaintext codes (the only time they exist in the clear).
export async function generateInviteCodes(count = 1): Promise<string[]> {
  const codes = Array.from({ length: count }, () => randomBytes(12).toString("hex"));
  await createInviteCodes(codes);
  return codes;
}

// Undo a consume (used when account provisioning fails after the code was taken).
export async function releaseInviteCode(code: string): Promise<void> {
  await db();
  await getPool().query(
    `UPDATE invite_codes SET used_at = NULL, used_by = NULL WHERE code_hash = $1`,
    [hashInvite(code)]
  );
}

// ---------- users ----------

export interface UserRow {
  id: string;
  username: string;
  email: string;
  accountId: string;
  encMailPassword: string;
  pgpPublicKey: string;
  wrappedKeyRecovery: string;
  recoveryAuthHash: string;
  totpSecretEnc: string;
}

function toUser(r: Record<string, unknown>): UserRow {
  return {
    id: String(r.id),
    username: r.username as string,
    email: r.email as string,
    accountId: r.account_id as string,
    encMailPassword: r.enc_mail_password as string,
    pgpPublicKey: r.pgp_public_key as string,
    wrappedKeyRecovery: r.wrapped_key_recovery as string,
    recoveryAuthHash: r.recovery_auth_hash as string,
    totpSecretEnc: r.totp_secret_enc as string,
  };
}

export async function createUser(u: Omit<UserRow, "id">): Promise<string> {
  await db();
  const r = await getPool().query(
    `INSERT INTO users (username, email, account_id, enc_mail_password, pgp_public_key,
                        wrapped_key_recovery, recovery_auth_hash, totp_secret_enc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [u.username, u.email, u.accountId, u.encMailPassword, u.pgpPublicKey,
     u.wrappedKeyRecovery, u.recoveryAuthHash, u.totpSecretEnc]
  );
  return String(r.rows[0].id);
}

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  await db();
  const r = await getPool().query(`SELECT * FROM users WHERE username = $1`, [username]);
  return r.rowCount === 1 ? toUser(r.rows[0]) : null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  await db();
  const r = await getPool().query(`SELECT * FROM users WHERE id = $1`, [id]);
  return r.rowCount === 1 ? toUser(r.rows[0]) : null;
}

export async function usernameExists(username: string): Promise<boolean> {
  await db();
  const r = await getPool().query(`SELECT 1 FROM users WHERE username = $1`, [username]);
  return r.rowCount === 1;
}

// Constant-time comparison of the recovery auth key hash.
export function recoveryHashMatches(stored: string, candidateHash: string): boolean {
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(candidateHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- passkey credentials ----------

export interface CredentialRow {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  prfCapable: boolean;
  wrappedKeyPrf: string | null;
}

function toCredential(r: Record<string, unknown>): CredentialRow {
  return {
    id: r.id as string,
    userId: String(r.user_id),
    publicKey: r.public_key as string,
    counter: Number(r.counter),
    transports: r.transports ? (JSON.parse(r.transports as string) as string[]) : [],
    prfCapable: !!r.prf_capable,
    wrappedKeyPrf: (r.wrapped_key_prf as string) ?? null,
  };
}

export async function addCredential(c: CredentialRow & { nickname?: string }): Promise<void> {
  await db();
  await getPool().query(
    `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports,
                                       prf_capable, wrapped_key_prf, nickname)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [c.id, c.userId, c.publicKey, c.counter, JSON.stringify(c.transports),
     c.prfCapable, c.wrappedKeyPrf, c.nickname ?? null]
  );
}

export async function getCredential(id: string): Promise<CredentialRow | null> {
  await db();
  const r = await getPool().query(`SELECT * FROM webauthn_credentials WHERE id = $1`, [id]);
  return r.rowCount === 1 ? toCredential(r.rows[0]) : null;
}

export async function getCredentialsForUser(userId: string): Promise<CredentialRow[]> {
  await db();
  const r = await getPool().query(
    `SELECT * FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  return r.rows.map(toCredential);
}

// Attach a PRF-wrapped copy of the mail key to a credential after the fact.
// Used when an authenticator only reveals PRF output on `get()` (common), so
// the wrap couldn't be made during registration.
export async function setCredentialPrfWrap(
  id: string,
  userId: string,
  wrappedKeyPrf: string
): Promise<void> {
  await db();
  await getPool().query(
    `UPDATE webauthn_credentials SET wrapped_key_prf = $3, prf_capable = true
     WHERE id = $1 AND user_id = $2`,
    [id, userId, wrappedKeyPrf]
  );
}

export async function touchCredential(id: string, counter: number): Promise<void> {
  await db();
  await getPool().query(
    `UPDATE webauthn_credentials SET counter = $2, last_used_at = now() WHERE id = $1`,
    [id, counter]
  );
}

// ---------- sessions (revocable) ----------

const SESSION_DAYS = 7;

export interface SessionRow {
  userId: string;
  email: string;
}

// Create a server-side session row; returns the opaque session id to embed in
// the cookie. Lets us revoke sessions (logout / compromise). Mail credentials
// live on the users row (encrypted) — they only unlock ciphertext anyway.
export async function newSession(userId: string, email: string): Promise<string> {
  await db();
  const jti = randomBytes(24).toString("hex");
  await getPool().query(
    `INSERT INTO sessions (jti, user_id, email, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [jti, userId, email, String(SESSION_DAYS)]
  );
  return jti;
}

export async function getSessionRow(jti: string): Promise<SessionRow | null> {
  await db();
  const r = await getPool().query(
    `SELECT user_id, email FROM sessions WHERE jti = $1 AND expires_at > now()`,
    [jti]
  );
  if (r.rowCount !== 1 || !r.rows[0].user_id) return null;
  return { userId: String(r.rows[0].user_id), email: r.rows[0].email as string };
}

export async function revokeSession(jti: string): Promise<void> {
  await db();
  await getPool().query(`DELETE FROM sessions WHERE jti = $1`, [jti]);
}

// ---------- rate limiting (hashed key) ----------

// Keyed hash of the client IP (or another limiter key such as a username) so we
// never store raw addresses. SESSION_SECRET is the HMAC key, so hashes can't be
// reversed/rainbow-tabled without it.
export function hashIp(ip: string): string {
  const key = process.env.SESSION_SECRET || "";
  return createHmac("sha256", key).update(ip).digest("hex");
}

// True if this key has made >= `max` attempts of `kind` within `windowSecs`.
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

// Clear a key's attempts of a kind (e.g. after a successful login).
export async function clearAttempts(ipHash: string, kind: string): Promise<void> {
  await db();
  await getPool().query(`DELETE FROM auth_attempts WHERE ip_hash = $1 AND kind = $2`, [ipHash, kind]);
}

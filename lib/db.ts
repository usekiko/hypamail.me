// Postgres for invite codes. The schema is created on first use.
import { Pool } from "pg";

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
    )
  `);
}

function db(): Promise<void> {
  if (!ready) ready = init();
  return ready;
}

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

// Undo a consume (used when account provisioning fails after the code was taken).
export async function releaseInviteCode(code: string): Promise<void> {
  await db();
  await getPool().query(
    `UPDATE invite_codes SET used_at = NULL, used_by = NULL WHERE code = $1`,
    [code.trim()]
  );
}

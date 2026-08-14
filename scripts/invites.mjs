#!/usr/bin/env node
// Generate invite codes. Prints the plaintext codes ONCE; only their SHA-256
// hashes are stored in Postgres.
//
//   DATABASE_URL=postgres://... node scripts/invites.mjs [count] [uses-per-code]
//
// Reads .env.local / .env automatically when DATABASE_URL isn't set.
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        const m = line.match(/^DATABASE_URL=(.+)$/);
        if (m) {
          process.env.DATABASE_URL = m[1].trim();
          return;
        }
      }
    } catch {}
  }
}

loadEnv();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const count = Math.max(1, Math.min(100, parseInt(process.argv[2] || "1", 10) || 1));
// Second arg: how many signups each code allows. Omit for one-shot codes.
const maxUses = Math.max(1, parseInt(process.argv[3] || "1", 10) || 1);
const codes = Array.from({ length: count }, () => randomBytes(12).toString("hex"));
const hashes = codes.map((c) => createHash("sha256").update(c).digest("hex"));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`
  CREATE TABLE IF NOT EXISTS invite_codes (
    code_hash   TEXT PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at     TIMESTAMPTZ,
    used_by     TEXT,
    max_uses    INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
    use_count   INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0)
  );
`);
await pool.query(
  `INSERT INTO invite_codes (code_hash, max_uses)
   SELECT unnest($1::text[]), $2 ON CONFLICT DO NOTHING`,
  [hashes, maxUses]
);
await pool.end();

const usesNote = maxUses === 1 ? "single-use" : `${maxUses} uses each`;
console.log(
  `Created ${count} invite code(s), ${usesNote} — save them now, only hashes are stored:\n`
);
for (const c of codes) console.log("  " + c);

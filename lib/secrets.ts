// Server-side secret encryption (AES-256-GCM) for values that must live in the
// DB but shouldn't be readable from a DB dump alone: the internal Stalwart mail
// password and each user's TOTP secret. NOTE: these are *server* secrets — the
// mail password only grants access to PGP ciphertext, and the TOTP secret is an
// auth gate, not key material. User mail keys are wrapped client-side and never
// touch this module.
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";

// Key for encrypting stored server-side secrets. Derived from a dedicated
// CREDENTIAL_SECRET when set (lets you keep it off the DB host for full
// separation), otherwise a distinct subkey of SESSION_SECRET so it is never the
// same bytes as the session-cookie key.
function credKey(): Buffer {
  const secret = process.env.CREDENTIAL_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("CREDENTIAL_SECRET/SESSION_SECRET not set");
  return createHash("sha256").update(secret + ":creds").digest();
}

// AES-256-GCM. Output is base64(iv ‖ authTag ‖ ciphertext).
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", credKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

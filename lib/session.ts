// Revocable, server-backed session. The cookie carries ONLY an opaque session id
// (jti), JWE-encrypted (AES-256-GCM) and httpOnly+secure. The actual mail
// credentials live server-side in the `sessions` table, with the password
// encrypted at rest (separate key). So:
//   - the password never reaches the client, and
//   - a stolen cookie + leaked SESSION_SECRET still does NOT reveal the user's
//     permanent password — only a jti, which logout/expiry revokes.
// The server decrypts the stored password per-request to make JMAP calls on the
// user's behalf (standard webmail pattern, minus the password-in-cookie risk).
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { newSession, getSessionRow, revokeSession } from "./db";

const COOKIE = "hm_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not set");
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

// Key for encrypting the stored mail password. Derived from a dedicated
// CREDENTIAL_SECRET when set (lets you keep it off the DB host for full
// separation), otherwise a distinct subkey of SESSION_SECRET so it is never the
// same bytes as the cookie key above.
function credKey(): Buffer {
  const secret = process.env.CREDENTIAL_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("CREDENTIAL_SECRET/SESSION_SECRET not set");
  return createHash("sha256").update(secret + ":creds").digest();
}

// AES-256-GCM. Output is base64(iv ‖ authTag ‖ ciphertext).
function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", credKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export interface Session {
  email: string;
  password: string;
  accountId: string;
}

export async function createSession(data: Session): Promise<void> {
  const jti = await newSession(data.email, data.accountId, encryptSecret(data.password));
  const jwt = await new EncryptJWT({ jti })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .encrypt(key());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const c = (await cookies()).get(COOKIE);
  if (!c) return null;
  try {
    const { payload } = await jwtDecrypt(c.value, key());
    const jti = payload.jti as string | undefined;
    if (!jti) return null;
    // Load credentials server-side; rejects sessions revoked/expired (or
    // pre-migration cookies that predate server-stored creds → re-login).
    const row = await getSessionRow(jti);
    if (!row) return null;
    return {
      email: row.email,
      password: decryptSecret(row.encPassword),
      accountId: row.accountId,
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const c = (await cookies()).get(COOKIE);
  if (c) {
    try {
      const { payload } = await jwtDecrypt(c.value, key());
      if (payload.jti) await revokeSession(payload.jti as string);
    } catch {
      // bad/expired cookie — nothing to revoke
    }
  }
  (await cookies()).delete(COOKIE);
}

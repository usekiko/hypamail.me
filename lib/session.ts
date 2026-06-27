// Encrypted session cookie. Holds the user's mail credentials so the server can
// make per-request JMAP calls on their behalf (standard webmail pattern). The
// cookie is AES-256-GCM encrypted (JWE) with a key derived from SESSION_SECRET,
// httpOnly + secure, so the credentials never reach the client.
//
// Sessions are *revocable*: the cookie carries an opaque server-side id (jti)
// that must exist + be unexpired in the `sessions` table. Logout deletes the
// row, so a stolen cookie stops working immediately instead of living 7 days.
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { newSession, getSessionRow, revokeSession } from "./db";

const COOKIE = "hm_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not set");
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

export interface Session {
  email: string;
  password: string;
  accountId: string;
}

export async function createSession(data: Session): Promise<void> {
  const jti = await newSession(data.email);
  const jwt = await new EncryptJWT({ ...data, jti })
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
    // Reject sessions that were revoked or expired server-side.
    if (!jti || !(await getSessionRow(jti))) return null;
    return {
      email: payload.email as string,
      password: payload.password as string,
      accountId: payload.accountId as string,
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

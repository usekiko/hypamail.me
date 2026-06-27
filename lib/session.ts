// Encrypted session cookie. Holds the user's mail credentials so the server can
// make per-request JMAP calls on their behalf (standard webmail pattern). The
// cookie is AES-256-GCM encrypted (JWE) with a key derived from SESSION_SECRET,
// httpOnly + secure, so the credentials never reach the client.
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { createHash } from "crypto";

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
  const jwt = await new EncryptJWT({ ...data })
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
  (await cookies()).delete(COOKIE);
}

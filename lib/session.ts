// Revocable, server-backed session. The cookie carries ONLY an opaque session id
// (jti), JWE-encrypted (AES-256-GCM) and httpOnly+secure. The session row maps
// to a user; the user's internal Stalwart credential is stored encrypted on the
// users table. Because mail is encrypted at rest with the user's own PGP key,
// that credential only ever unlocks ciphertext — the server (and anyone who
// compromises it) cannot read stored mail.
//
// This module also issues short-lived "ceremony" cookies used to carry WebAuthn
// challenges (and, during signup, the pending TOTP secret) between the begin and
// complete steps of an auth ceremony without a server-side table.
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { newSession, getSessionRow, revokeSession, getUserById, type UserRow } from "./db";
import { decryptSecret } from "./secrets";

const COOKIE = "hm_session";
const CEREMONY_COOKIE = "hm_ceremony";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const CEREMONY_MAX_AGE = 60 * 15; // 15 minutes: signup wizard needs QR + words time

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not set");
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

export interface Session {
  userId: string;
  username: string;
  email: string;
  accountId: string;
  mailPassword: string; // internal Stalwart credential (ciphertext access only)
  user: UserRow;
}

export async function createSession(userId: string, email: string): Promise<void> {
  const jti = await newSession(userId, email);
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
    const row = await getSessionRow(jti);
    if (!row) return null;
    const user = await getUserById(row.userId);
    if (!user) return null;
    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      accountId: user.accountId,
      mailPassword: decryptSecret(user.encMailPassword),
      user,
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

// ---------- ceremony cookies (WebAuthn challenges & signup state) ----------

export interface CeremonyData extends JWTPayload {
  kind: "signup" | "login" | "login-totp" | "recovery" | "add-passkey";
  challenge: string;
  username?: string;
  invite?: string;
  totpSecret?: string; // base32, pending user confirmation during signup
  userId?: string;
  credentialId?: string; // the passkey already verified, carried into the TOTP step
}

export async function setCeremony(data: CeremonyData): Promise<void> {
  const jwt = await new EncryptJWT(data)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .encrypt(key());
  (await cookies()).set(CEREMONY_COOKIE, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CEREMONY_MAX_AGE,
  });
}

// Read and consume the ceremony cookie. Enforces the expected kind so a cookie
// minted for one flow can't be replayed against another.
export async function takeCeremony(kind: CeremonyData["kind"]): Promise<CeremonyData | null> {
  const jar = await cookies();
  const c = jar.get(CEREMONY_COOKIE);
  if (!c) return null;
  jar.delete(CEREMONY_COOKIE);
  try {
    const { payload } = await jwtDecrypt(c.value, key());
    const data = payload as CeremonyData;
    return data.kind === kind ? data : null;
  } catch {
    return null;
  }
}

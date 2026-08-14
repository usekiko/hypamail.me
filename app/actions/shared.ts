// Bits the action files in this directory share. Not a "use server" module on
// purpose — those may only export async functions.
import { headers } from "next/headers";
import { createHash } from "crypto";
import { getSession } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";
import { decryptSecret } from "@/lib/secrets";
import {
  getUserById,
  recoveryHashMatches,
  hashIp,
  isRateLimited,
  recordAttempt,
  clearAttempts,
} from "@/lib/db";

export const DOMAIN = process.env.MAIL_DOMAIN || "hypamail.me";

// Brute-force budgets, keyed by hashed IP. Flows where an attacker could pick a
// target account also get a per-username bucket.
export const SIGNUP_MAX = 10;
export const SIGNUP_WINDOW = 600;
export const RECOVERY_MAX = 5;
export const RECOVERY_WINDOW = 600;
export const LOGIN_TOTP_MAX = 6;
export const LOGIN_TOTP_WINDOW = 600;
export const MANAGE_MAX = 6;
export const MANAGE_WINDOW = 600;
export const LOGIN_LOOKUP_MAX = 12;
export const LOGIN_LOOKUP_WINDOW = 600;
export const LEGACY_MAX = 8;
export const LEGACY_WINDOW = 600;
export const PASSWORD_MAX = 8;
export const PASSWORD_WINDOW = 600;

// Only CF-Connecting-IP is trusted. X-Forwarded-For is client-settable and
// Cloudflare merely appends to it, so honouring it would hand out a fresh
// rate-limit bucket per request. No header → everyone shares "unknown".
export function clientIp(h: Headers): string | null {
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  if (process.env.NODE_ENV === "development") return "127.0.0.1";
  return null;
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  return hashIp(clientIp(h) || "unknown");
}

export function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

type User = NonNullable<Awaited<ReturnType<typeof getUserById>>>;

// Every credential change goes through here, even though you're already signed
// in: a stolen session on its own must not be able to add or strip a way in.
// Accounts with no authenticator are gated on the recovery code alone.
export async function manageGate(
  recoveryAuthKey: string,
  totpCode: string
): Promise<{ user: User } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const ipHash = await clientIpHash();
  const userKeyHash = hashIp(`user:${session.userId}`);
  if (
    (await isRateLimited(ipHash, "manage", MANAGE_MAX, MANAGE_WINDOW)) ||
    (await isRateLimited(userKeyHash, "manage", MANAGE_MAX, MANAGE_WINDOW))
  ) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const user = session.user;
  const bad = async () => {
    await recordAttempt(ipHash, "manage");
    await recordAttempt(userKeyHash, "manage");
    return { error: "Wrong recovery code or authenticator code." };
  };
  if (!recoveryHashMatches(user.recoveryAuthHash, sha256hex(recoveryAuthKey))) return bad();
  if (user.totpSecretEnc && !verifyTotp(decryptSecret(user.totpSecretEnc), totpCode)) return bad();

  await clearAttempts(ipHash, "manage");
  await clearAttempts(userKeyHash, "manage");
  return { user };
}

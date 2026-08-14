"use server";

// Optional password sign-in. The password never reaches the server: the browser
// stretches it against the salt handed out below, then splits the result — one
// half authenticates here, the other stays on the device and unwraps the mail
// key. So it's a password login that still can't decrypt anyone's mail.
import { verifyTotp } from "@/lib/totp";
import { decryptSecret } from "@/lib/secrets";
import { createSession } from "@/lib/session";
import {
  clearAttempts,
  getPasswordSalt,
  getUserByUsername,
  hashIp,
  isRateLimited,
  recordAttempt,
  recoveryHashMatches,
} from "@/lib/db";
import { PASSWORD_MAX, PASSWORD_WINDOW, clientIpHash, sha256hex } from "./shared";

// Unauthenticated on purpose — the salt is needed before the password can be
// stretched. Always answers, real salt or stable decoy, so it can't be used to
// discover which usernames exist.
export async function passwordSalt(payload: {
  username: string;
}): Promise<{ salt: string }> {
  const username = String(payload.username || "").trim().toLowerCase();
  return { salt: await getPasswordSalt(username) };
}

export interface PasswordLoginResult {
  error?: string;
  ok?: boolean;
  needTotp?: boolean;
  wrappedKeyPassword?: string | null;
}

export async function passwordLogin(payload: {
  username: string;
  passwordAuthKey: string;
  totpCode: string;
}): Promise<PasswordLoginResult> {
  const username = String(payload.username || "").trim().toLowerCase();
  const ipHash = await clientIpHash();
  const userKeyHash = hashIp(`user:${username}`);

  if (
    (await isRateLimited(ipHash, "password", PASSWORD_MAX, PASSWORD_WINDOW)) ||
    (await isRateLimited(userKeyHash, "password", PASSWORD_MAX, PASSWORD_WINDOW))
  ) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Same as recoveryLogin: the per-username bucket is only charged once the
  // password checked out, so knowing a username can't lock its owner out.
  const fail = async (chargeUser: boolean) => {
    await recordAttempt(ipHash, "password");
    if (chargeUser) await recordAttempt(userKeyHash, "password");
    return { error: "Wrong username, password, or authenticator code." };
  };

  const user = await getUserByUsername(username);
  if (!user || !user.passwordAuthHash || !user.wrappedKeyPassword) return fail(false);
  if (!recoveryHashMatches(user.passwordAuthHash, sha256hex(payload.passwordAuthKey))) {
    return fail(false);
  }

  // A password is one factor — unlike a passkey it proves nothing about the
  // device — so an enrolled authenticator is always demanded here.
  if (user.totpSecretEnc) {
    if (!payload.totpCode) return { needTotp: true };
    if (!verifyTotp(decryptSecret(user.totpSecretEnc), payload.totpCode)) return fail(true);
  }

  await clearAttempts(ipHash, "password");
  await clearAttempts(userKeyHash, "password");
  await createSession(user.id, user.email);
  return { ok: true, wrappedKeyPassword: user.wrappedKeyPassword };
}

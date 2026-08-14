"use server";

import { verifyTotp } from "@/lib/totp";
import { decryptSecret } from "@/lib/secrets";
import { createSession } from "@/lib/session";
import {
  clearAttempts,
  getUserByUsername,
  hashIp,
  isRateLimited,
  recordAttempt,
  recoveryHashMatches,
} from "@/lib/db";
import {
  RECOVERY_MAX,
  RECOVERY_WINDOW,
  clientIpHash,
  sha256hex,
} from "./shared";

export interface RecoveryLoginResult {
  error?: string;
  ok?: boolean;
  wrappedKeyRecovery?: string;
}

// Username + recovery-code proof + an authenticator code, if the account has one.
export async function recoveryLogin(payload: {
  username: string;
  recoveryAuthKey: string;
  totpCode: string;
}): Promise<RecoveryLoginResult> {
  const username = String(payload.username || "").trim().toLowerCase();
  const ipHash = await clientIpHash();
  const userKeyHash = hashIp(`user:${username}`);

  if (
    (await isRateLimited(ipHash, "recovery", RECOVERY_MAX, RECOVERY_WINDOW)) ||
    (await isRateLimited(userKeyHash, "recovery", RECOVERY_MAX, RECOVERY_WINDOW))
  ) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Every failure charges the IP, but the per-username bucket only gets charged
  // once the recovery code itself checked out — otherwise knowing a username
  // would be enough to lock its owner out of recovery. A leaked recovery code
  // still leaves the 6-digit code throttled, which is what that bucket is for.
  const fail = async (chargeUser: boolean) => {
    await recordAttempt(ipHash, "recovery");
    if (chargeUser) await recordAttempt(userKeyHash, "recovery");
    // One message for all three inputs — don't reveal which was wrong.
    return { error: "Wrong username, recovery code, or authenticator code." };
  };

  const user = await getUserByUsername(username);
  if (!user) return fail(false);
  if (!recoveryHashMatches(user.recoveryAuthHash, sha256hex(payload.recoveryAuthKey))) {
    return fail(false);
  }
  // No authenticator → the recovery code is the sole factor, which is exactly
  // what opting out of TOTP chose.
  if (user.totpSecretEnc && !verifyTotp(decryptSecret(user.totpSecretEnc), payload.totpCode)) {
    return fail(true);
  }

  await clearAttempts(ipHash, "recovery");
  await clearAttempts(userKeyHash, "recovery");
  await createSession(user.id, user.email);
  return { ok: true, wrappedKeyRecovery: user.wrappedKeyRecovery };
}

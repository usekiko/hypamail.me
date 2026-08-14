"use server";

// Authenticator app: enrolling one, dropping it, and the "ask every sign-in"
// toggle. The secret is an auth gate only — it plays no part in mail encryption,
// so changing it never touches any wrapped key.
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { getSession, setCeremony, takeCeremony } from "@/lib/session";
import {
  clearAttempts,
  hashIp,
  isRateLimited,
  recordAttempt,
  setRequireTotpOnLogin,
  setUserTotpSecret,
} from "@/lib/db";
import { MANAGE_MAX, MANAGE_WINDOW, clientIpHash, manageGate } from "./shared";

// Hands back a fresh secret to scan. Nothing is saved until enrollTotpComplete
// proves a code from it, so a half-finished setup leaves the account untouched.
export async function enrollTotpBegin(payload: {
  recoveryAuthKey: string;
  totpCode: string; // the current one, if the account already has an authenticator
}): Promise<{ error?: string; totpUri?: string; totpSecret?: string }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };

  const totpSecret = generateTotpSecret();
  await setCeremony({
    kind: "enroll-totp",
    challenge: "", // no WebAuthn here; the pending secret is the state
    userId: gate.user.id,
    totpSecret,
  });
  return { totpUri: totpUri(totpSecret, gate.user.email), totpSecret };
}

export async function enrollTotpComplete(payload: {
  totpCode: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const ceremony = await takeCeremony("enroll-totp");
  if (!ceremony?.totpSecret || ceremony.userId !== session.userId) {
    return { error: "Setup expired. Start again." };
  }
  // Single-use ceremony, so a wrong code costs a fresh QR rather than another
  // guess at the same secret.
  if (!verifyTotp(ceremony.totpSecret, payload.totpCode)) {
    return { error: "Wrong code. Scan the QR again and retry." };
  }
  await setUserTotpSecret(session.userId, encryptSecret(ceremony.totpSecret));
  return { ok: true };
}

export async function removeTotp(payload: {
  recoveryAuthKey: string;
  totpCode: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };
  // Clear the requirement too, or the next sign-in would demand a code from an
  // authenticator that no longer exists.
  await setRequireTotpOnLogin(gate.user.id, false);
  await setUserTotpSecret(gate.user.id, null);
  return { ok: true };
}

// Turning it ON only needs a live code — it's a hardening step, so it shouldn't
// cost 12 words, and a working code is what stops you locking yourself out of
// every future sign-in. Turning it OFF is a downgrade, so it takes the full gate.
export async function setLoginTotpRequired(payload: {
  enable: boolean;
  totpCode: string;
  recoveryAuthKey?: string;
}): Promise<{ error?: string; ok?: boolean }> {
  if (!payload.enable) {
    const gate = await manageGate(payload.recoveryAuthKey ?? "", payload.totpCode);
    if ("error" in gate) return { error: gate.error };
    await setRequireTotpOnLogin(gate.user.id, false);
    return { ok: true };
  }

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
  if (!session.user.totpSecretEnc) {
    return { error: "Set up an authenticator app first, then turn this on." };
  }
  if (!verifyTotp(decryptSecret(session.user.totpSecretEnc), payload.totpCode)) {
    await recordAttempt(ipHash, "manage");
    await recordAttempt(userKeyHash, "manage");
    return { error: "Wrong authenticator code." };
  }
  await clearAttempts(ipHash, "manage");
  await clearAttempts(userKeyHash, "manage");
  await setRequireTotpOnLogin(session.userId, true);
  return { ok: true };
}

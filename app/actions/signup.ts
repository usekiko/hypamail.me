"use server";

// Three-phase wizard, committed atomically at the end:
//   1. signupBegin  — validate invite/captcha/username, mint the WebAuthn
//      challenge and a pending TOTP secret (both live only in a 15-min cookie).
//   2. (client)     — create the passkey, generate the mail keypair + recovery
//      words, wrap the private key, scan the QR.
//   3. signupComplete — verify what came back, then write. Nothing is stored
//      anywhere until that last step succeeds.
import { headers } from "next/headers";
import { inviteRequired } from "@/constants/invite";
import { usernameTaken, validateUsername, verifyTurnstile } from "@/lib/admin";
import { registrationOptions, verifyRegistration } from "@/lib/webauthn";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { createSession, setCeremony, takeCeremony } from "@/lib/session";
import {
  clearAttempts,
  consumeInviteCode,
  inviteCodeUsable,
  isRateLimited,
  recordAttempt,
  usernameExists,
} from "@/lib/db";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createMailbox } from "./provision";
import { DOMAIN, SIGNUP_MAX, SIGNUP_WINDOW, clientIp, clientIpHash } from "./shared";

export interface SignupBeginResult {
  error?: string;
  optionsJSON?: unknown;
  totpUri?: string;
  totpSecret?: string;
  email?: string;
}

export async function signupBegin(formData: {
  username: string;
  invite: string;
  turnstileToken: string;
}): Promise<SignupBeginResult> {
  const username = String(formData.username || "").trim().toLowerCase();
  const invite = String(formData.invite || "").trim();

  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "signup", SIGNUP_MAX, SIGNUP_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const vErr = validateUsername(username);
  if (vErr) return { error: vErr };
  const needsInvite = inviteRequired();
  if (needsInvite && !invite) return { error: "An invite code is required." };

  const ip = clientIp(await headers()) ?? undefined;
  if (!(await verifyTurnstile(formData.turnstileToken, ip))) {
    await recordAttempt(ipHash, "signup");
    return { error: "Bot check failed. Please retry." };
  }

  if (needsInvite && !(await inviteCodeUsable(invite))) {
    await recordAttempt(ipHash, "signup");
    return { error: "Invalid or already-used invite code." };
  }

  if ((await usernameExists(username)) || (await usernameTaken(username))) {
    await recordAttempt(ipHash, "signup");
    return { error: "That username is already taken." };
  }

  const options = await registrationOptions(username);
  const totpSecret = generateTotpSecret();
  const email = `${username}@${DOMAIN}`;
  await setCeremony({
    kind: "signup",
    challenge: options.challenge,
    username,
    invite,
    totpSecret,
  });
  return { optionsJSON: options, totpUri: totpUri(totpSecret, email), totpSecret, email };
}

export interface SignupCompleteResult {
  error?: string;
  fatal?: boolean; // true → wizard must restart from step 1
  ok?: boolean;
}

export async function signupComplete(payload: {
  // Passkey, authenticator and password are all optional and independent. The
  // recovery code is the constant: it always wraps the mail key, so an account
  // can never end up with no way back in.
  attestation: unknown | null;
  prfCapable: boolean;
  wrappedKeyPrf: string | null;
  wrappedKeyRecovery: string;
  recoveryAuthKey: string;
  pgpPublicKey: string;
  totpCode: string | null;
  enrollTotp: boolean;
  passwordSalt: string | null;
  passwordAuthKey: string | null;
  wrappedKeyPassword: string | null;
}): Promise<SignupCompleteResult> {
  const ceremony = await takeCeremony("signup");
  if (!ceremony?.username || !ceremony.totpSecret) {
    return { error: "Signup session expired. Please start over.", fatal: true };
  }
  const { username, totpSecret } = ceremony;
  const invite = ceremony.invite ?? "";
  const needsInvite = inviteRequired();
  const email = `${username}@${DOMAIN}`;

  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "signup", SIGNUP_MAX, SIGNUP_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes.", fatal: true };
  }

  if (
    !payload.pgpPublicKey?.includes("BEGIN PGP PUBLIC KEY BLOCK") ||
    !payload.wrappedKeyRecovery ||
    !payload.recoveryAuthKey
  ) {
    return { error: "Malformed signup payload.", fatal: true };
  }

  // A password is three fields or none — a half-set would leave an account that
  // advertises password login but can never satisfy it.
  const wantsPassword =
    !!payload.passwordSalt || !!payload.passwordAuthKey || !!payload.wrappedKeyPassword;
  if (
    wantsPassword &&
    !(payload.passwordSalt && payload.passwordAuthKey && payload.wrappedKeyPassword)
  ) {
    return { error: "Malformed signup payload.", fatal: true };
  }

  // The ceremony cookie was consumed above and is single-use, so a wrong code
  // restarts the wizard rather than giving another guess at the same challenge.
  if (payload.enrollTotp) {
    if (!payload.totpCode || !verifyTotp(totpSecret, payload.totpCode)) {
      await recordAttempt(ipHash, "signup");
      return { error: "Wrong authenticator code. Signup restarted for safety.", fatal: true };
    }
  }

  // No attestation means the user skipped the passkey.
  let cred: Awaited<ReturnType<typeof verifyRegistration>> = null;
  if (payload.attestation) {
    cred = await verifyRegistration(
      payload.attestation as RegistrationResponseJSON,
      ceremony.challenge
    );
    if (!cred) {
      await recordAttempt(ipHash, "signup");
      return { error: "Passkey could not be verified. Please start over.", fatal: true };
    }
  }

  if ((await usernameExists(username)) || (await usernameTaken(username))) {
    return { error: "That username is already taken.", fatal: true };
  }

  if (needsInvite && !(await consumeInviteCode(invite, email))) {
    return { error: "Invalid or already-used invite code.", fatal: true };
  }

  const { userId, error } = await createMailbox({
    username,
    email,
    invite: needsInvite ? invite : null,
    pgpPublicKey: payload.pgpPublicKey,
    wrappedKeyRecovery: payload.wrappedKeyRecovery,
    recoveryAuthKey: payload.recoveryAuthKey,
    totpSecret: payload.enrollTotp ? totpSecret : null,
    passwordSalt: payload.passwordSalt,
    passwordAuthKey: payload.passwordAuthKey,
    wrappedKeyPassword: payload.wrappedKeyPassword,
    credential: cred,
    prfCapable: payload.prfCapable,
    wrappedKeyPrf: payload.wrappedKeyPrf,
  });
  if (!userId) return { error, fatal: true };

  await clearAttempts(ipHash, "signup");
  await createSession(userId, email);
  return { ok: true };
}

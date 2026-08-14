"use server";

// Password-era accounts moving to a passkey (/login/legacy).
//
// These exist only in Stalwart — username + password, plaintext mailbox, no
// users row — so since the passkey deploy they can't sign in at all. Until
// LEGACY_LOGIN_UNTIL they can prove the old password once and walk the signup
// wizard. Finishing it enables encryption, rotates the mailbox to an internal
// credential (the old password dies) and creates the users row. Mail already in
// the box stays readable; new mail is ciphertext from that moment on.
import { legacyLoginAvailable, LEGACY_LOGIN_LABEL } from "@/constants/legacy";
import { authenticate } from "@/lib/jmap";
import { generatePassword, rotateAccountPassword, uploadEncryptionKey } from "@/lib/admin";
import { registrationOptions, verifyRegistration } from "@/lib/webauthn";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { encryptSecret } from "@/lib/secrets";
import { createSession, setCeremony, takeCeremony } from "@/lib/session";
import {
  addCredential,
  clearAttempts,
  createUser,
  isRateLimited,
  recordAttempt,
  usernameExists,
} from "@/lib/db";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { SignupBeginResult, SignupCompleteResult } from "./signup";
import { DOMAIN, LEGACY_MAX, LEGACY_WINDOW, clientIpHash, sha256hex } from "./shared";

export async function legacyLoginBegin(payload: {
  username: string;
  password: string;
}): Promise<SignupBeginResult> {
  if (!legacyLoginAvailable()) {
    return { error: `Password sign-in ended on ${LEGACY_LOGIN_LABEL}. See /login/legacy for what to do.` };
  }
  // Accept "user" or "user@domain", like the old password form did.
  const username = String(payload.username || "").trim().toLowerCase().split("@")[0];
  const password = String(payload.password || "");
  if (!username || !password) return { error: "Enter your username and password." };
  const email = `${username}@${DOMAIN}`;

  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "legacy", LEGACY_MAX, LEGACY_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Checked before the password so someone who already migrated but still has
  // the old one saved gets pointed the right way, not a confusing "wrong password".
  if (await usernameExists(username)) {
    return { error: "This account already moved to passkeys. Use the normal sign-in." };
  }

  let accountId: string | null;
  try {
    accountId = await authenticate(email, password);
  } catch {
    return { error: "Server error. Please try again." };
  }
  if (!accountId) {
    await recordAttempt(ipHash, "legacy");
    return { error: "Wrong username or password." };
  }
  await clearAttempts(ipHash, "legacy");

  const options = await registrationOptions(username);
  const totpSecret = generateTotpSecret();
  await setCeremony({
    kind: "legacy",
    challenge: options.challenge,
    username,
    totpSecret,
    legacyPassword: password,
  });
  return { optionsJSON: options, totpUri: totpUri(totpSecret, email), totpSecret, email };
}

export async function legacyMigrateComplete(payload: {
  attestation: unknown;
  prfCapable: boolean;
  wrappedKeyPrf: string | null;
  wrappedKeyRecovery: string;
  recoveryAuthKey: string;
  pgpPublicKey: string;
  totpCode: string;
}): Promise<SignupCompleteResult> {
  const ceremony = await takeCeremony("legacy");
  if (!ceremony?.username || !ceremony.totpSecret || !ceremony.legacyPassword) {
    return { error: "Migration session expired. Please start over.", fatal: true };
  }
  if (!legacyLoginAvailable()) {
    return { error: "The migration window has closed.", fatal: true };
  }
  const { username, totpSecret, legacyPassword } = ceremony;
  const email = `${username}@${DOMAIN}`;

  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "legacy", LEGACY_MAX, LEGACY_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes.", fatal: true };
  }

  if (
    !payload.pgpPublicKey?.includes("BEGIN PGP PUBLIC KEY BLOCK") ||
    !payload.wrappedKeyRecovery ||
    !payload.recoveryAuthKey
  ) {
    return { error: "Malformed migration payload.", fatal: true };
  }

  // Ceremony consumed above, so a wrong code restarts the wizard (and re-proves
  // the password) instead of giving another guess.
  if (!verifyTotp(totpSecret, payload.totpCode)) {
    await recordAttempt(ipHash, "legacy");
    return { error: "Wrong authenticator code. Migration restarted for safety.", fatal: true };
  }

  const cred = await verifyRegistration(
    payload.attestation as RegistrationResponseJSON,
    ceremony.challenge
  );
  if (!cred) {
    await recordAttempt(ipHash, "legacy");
    return { error: "Passkey could not be verified. Please start over.", fatal: true };
  }

  // Parallel tab / double submit: someone finished this migration already.
  if (await usernameExists(username)) {
    return { error: "This account already moved to passkeys. Use the normal sign-in.", fatal: true };
  }

  // Ordered so every failure before the rotation leaves the account exactly as
  // it was. Encryption is enabled with the user's own just-proven credentials,
  // and retrying only uploads another key, which is harmless.
  try {
    await uploadEncryptionKey(email, legacyPassword, payload.pgpPublicKey);
  } catch {
    return { error: "Could not enable mailbox encryption. Please try again.", fatal: true };
  }

  // Point of no return — the old password is gone from here. A failure between
  // the rotation and the users insert strands the account, so it's kept to two
  // DB writes on purpose; digging one out means an admin re-rotating it.
  const mailPassword = generatePassword();
  try {
    await rotateAccountPassword(username, mailPassword);
  } catch {
    return { error: "Could not secure the mailbox. Please try again.", fatal: true };
  }

  let accountId: string | null;
  try {
    accountId = await authenticate(email, mailPassword);
  } catch {
    accountId = null;
  }
  if (!accountId) {
    return { error: "Could not verify the migrated mailbox. Please contact us.", fatal: true };
  }

  const userId = await createUser({
    username,
    email,
    accountId,
    encMailPassword: encryptSecret(mailPassword),
    pgpPublicKey: payload.pgpPublicKey,
    wrappedKeyRecovery: payload.wrappedKeyRecovery,
    recoveryAuthHash: sha256hex(payload.recoveryAuthKey),
    totpSecretEnc: encryptSecret(totpSecret),
    // The old password is retired rather than carried over.
    passwordSalt: null,
    passwordAuthHash: null,
    wrappedKeyPassword: null,
  });
  await addCredential({
    id: cred.id,
    userId,
    publicKey: cred.publicKey,
    counter: cred.counter,
    transports: cred.transports,
    prfCapable: payload.prfCapable,
    wrappedKeyPrf: payload.wrappedKeyPrf,
    isOriginal: true, // plays the signup passkey's role
  });

  await clearAttempts(ipHash, "legacy");
  await createSession(userId, email);
  return { ok: true };
}

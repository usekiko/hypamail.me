"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "crypto";
import {
  provisionAccount,
  deleteAccount,
  uploadEncryptionKey,
  validateUsername,
  usernameTaken,
  verifyTurnstile,
  generatePassword,
} from "@/lib/admin";
import {
  registrationOptions,
  verifyRegistration,
  authenticationOptions,
  verifyAuthentication,
} from "@/lib/webauthn";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import {
  createSession,
  destroySession,
  getSession,
  setCeremony,
  takeCeremony,
} from "@/lib/session";
import {
  inviteCodeUsable,
  consumeInviteCode,
  releaseInviteCode,
  usernameExists,
  createUser,
  getUserByUsername,
  getUserById,
  addCredential,
  getCredential,
  getCredentialsForUser,
  touchCredential,
  setCredentialPrfWrap,
  countCredentialsForUser,
  listCredentialMeta,
  removeCredential,
  recoveryHashMatches,
  hashIp,
  isRateLimited,
  recordAttempt,
  clearAttempts,
  MAX_PASSKEYS,
  type CredentialMeta,
} from "@/lib/db";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

const DOMAIN = process.env.MAIL_DOMAIN || "hypamail.me";

// Brute-force limits, keyed by hashed client IP (and hashed username for the
// recovery flow, so a distributed attack can't focus one account).
const SIGNUP_MAX = 10;
const SIGNUP_WINDOW = 600;
const RECOVERY_MAX = 5;
const RECOVERY_WINDOW = 600;
// TOTP gate on non-original passkey logins, and on passkey management.
const LOGIN_TOTP_MAX = 6;
const LOGIN_TOTP_WINDOW = 600;
const MANAGE_MAX = 6;
const MANAGE_WINDOW = 600;

// Real client IP. We trust ONLY Cloudflare's CF-Connecting-IP, which Cloudflare
// sets authoritatively and a client cannot override. We deliberately do NOT fall
// back to X-Forwarded-For: a client can pre-set that header and Cloudflare merely
// appends to it, so trusting it would let anyone rotate the rate-limit key on
// every request. Requests arriving without the CF header collapse to one
// "unknown" bucket, which fails closed. (In dev there is no Cloudflare, so we
// fall back to localhost to keep the limiter usable.)
function clientIp(h: Headers): string | null {
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  if (process.env.NODE_ENV === "development") return "127.0.0.1";
  return null;
}

async function clientIpHash(): Promise<string> {
  const h = await headers();
  return hashIp(clientIp(h) || "unknown");
}

function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ---------------------------------------------------------------------------
// Signup — three-phase wizard, committed atomically at the end:
//   1. signupBegin: validate invite+captcha+username, mint WebAuthn challenge
//      and pending TOTP secret (both live only in an encrypted 15-min cookie).
//   2. (client) create passkey, generate mail keypair + recovery words, wrap
//      the private key, scan TOTP QR.
//   3. signupComplete: verify passkey attestation + TOTP proof, consume the
//      invite, provision the mailbox, upload the PGP public key, store the
//      user. Nothing is written anywhere until this step succeeds.
// ---------------------------------------------------------------------------

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
  // During the open-signup window we ignore invite codes entirely rather than
  // consuming any that are sent, so nobody burns a code they didn't need.
  const needsInvite = inviteRequired();
  if (needsInvite && !invite) return { error: "An invite code is required." };

  const ip = clientIp(await headers()) ?? undefined;
  if (!(await verifyTurnstile(formData.turnstileToken, ip))) {
    await recordAttempt(ipHash, "signup");
    return { error: "Bot check failed. Please retry." };
  }

  if (!(await inviteCodeUsable(invite))) {
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
  return {
    optionsJSON: options,
    totpUri: totpUri(totpSecret, email),
    totpSecret,
    email,
  };
}

export interface SignupCompleteResult {
  error?: string;
  fatal?: boolean; // true → wizard must restart from step 1
  ok?: boolean;
}

export async function signupComplete(payload: {
  attestation: unknown;
  prfCapable: boolean;
  wrappedKeyPrf: string | null;
  wrappedKeyRecovery: string;
  recoveryAuthKey: string;
  pgpPublicKey: string;
  totpCode: string;
}): Promise<SignupCompleteResult> {
  const ceremony = await takeCeremony("signup");
  if (!ceremony?.username || !ceremony.invite || !ceremony.totpSecret) {
    return { error: "Signup session expired — please start over.", fatal: true };
  }
  const { username, invite, totpSecret } = ceremony;
  const email = `${username}@${DOMAIN}`;

  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "signup", SIGNUP_MAX, SIGNUP_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes.", fatal: true };
  }

  // Basic shape checks on the client-supplied crypto material.
  if (
    !payload.pgpPublicKey?.includes("BEGIN PGP PUBLIC KEY BLOCK") ||
    !payload.wrappedKeyRecovery ||
    !payload.recoveryAuthKey
  ) {
    return { error: "Malformed signup payload.", fatal: true };
  }

  // The ceremony cookie was consumed above and is single-use by design, so TOTP
  // codes can't be brute-forced against one challenge: a wrong code restarts
  // the wizard.
  if (!verifyTotp(totpSecret, payload.totpCode)) {
    await recordAttempt(ipHash, "signup");
    return { error: "Wrong authenticator code — signup restarted for safety.", fatal: true };
  }

  const cred = await verifyRegistration(
    payload.attestation as RegistrationResponseJSON,
    ceremony.challenge
  );
  if (!cred) {
    await recordAttempt(ipHash, "signup");
    return { error: "Passkey could not be verified — please start over.", fatal: true };
  }

  if ((await usernameExists(username)) || (await usernameTaken(username))) {
    return { error: "That username is already taken.", fatal: true };
  }

  if (!(await consumeInviteCode(invite, email))) {
    return { error: "Invalid or already-used invite code.", fatal: true };
  }

  // Internal mailbox credential: random, never shown to anyone, only unlocks
  // ciphertext. Stored encrypted server-side.
  const mailPassword = generatePassword();
  let accountId: string;
  try {
    accountId = await provisionAccount(username, mailPassword);
  } catch {
    await releaseInviteCode(invite);
    if (await usernameTaken(username)) return { error: "That username is already taken.", fatal: true };
    return { error: "Could not create the mailbox. Please try again.", fatal: true };
  }

  // Encryption-at-rest key upload. If this fails the mailbox would store
  // plaintext, which violates the whole design — tear the account down.
  try {
    await uploadEncryptionKey(email, mailPassword, payload.pgpPublicKey);
  } catch {
    try {
      await deleteAccount(username);
    } catch {}
    await releaseInviteCode(invite);
    return { error: "Could not enable mailbox encryption. Please try again.", fatal: true };
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
  });
  await addCredential({
    id: cred.id,
    userId,
    publicKey: cred.publicKey,
    counter: cred.counter,
    transports: cred.transports,
    prfCapable: payload.prfCapable,
    wrappedKeyPrf: payload.wrappedKeyPrf,
    isOriginal: true, // the signup passkey: one-tap login, no TOTP
  });

  await clearAttempts(ipHash, "signup");
  await createSession(userId, email);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Passkey login (usernameless / discoverable)
// ---------------------------------------------------------------------------

export async function loginBegin(): Promise<{ optionsJSON: unknown }> {
  const options = await authenticationOptions();
  await setCeremony({ kind: "login", challenge: options.challenge });
  return { optionsJSON: options };
}

export interface LoginCompleteResult {
  error?: string;
  ok?: boolean;
  needTotp?: boolean; // non-original passkey: prove TOTP before the session is issued
  wrappedKeyPrf?: string | null;
  wrappedKeyRecovery?: string;
  prfCapable?: boolean;
}

export async function loginComplete(payload: {
  assertion: unknown;
}): Promise<LoginCompleteResult> {
  const ceremony = await takeCeremony("login");
  if (!ceremony) return { error: "Login session expired — try again." };

  const assertion = payload.assertion as AuthenticationResponseJSON;
  const credential = await getCredential(assertion.id);
  if (!credential) return { error: "Unknown passkey. Try account recovery instead." };

  let newCounter: number | null;
  try {
    newCounter = await verifyAuthentication(assertion, ceremony.challenge, credential);
  } catch {
    newCounter = null;
  }
  if (newCounter === null) return { error: "Passkey could not be verified." };

  const user = await getUserById(credential.userId);
  if (!user) return { error: "Account no longer exists." };

  await touchCredential(credential.id, newCounter);

  // Only the original (signup) passkey logs in with a single tap. Any passkey
  // added later must also pass a TOTP code — we've proven possession, but hold
  // the session until the second factor is in.
  if (!credential.isOriginal) {
    await setCeremony({
      kind: "login-totp",
      challenge: "", // unused; the passkey is already verified
      userId: user.id,
    });
    return { needTotp: true };
  }

  await createSession(user.id, user.email);
  return {
    ok: true,
    wrappedKeyPrf: credential.wrappedKeyPrf,
    wrappedKeyRecovery: user.wrappedKeyRecovery,
    prfCapable: credential.prfCapable,
  };
}

// Second step for a non-original passkey login: the TOTP gate. The passkey was
// already verified in loginComplete; this issues the session on a valid code.
export async function loginTotp(payload: {
  credentialId: string;
  totpCode: string;
}): Promise<LoginCompleteResult> {
  const ceremony = await takeCeremony("login-totp");
  if (!ceremony?.userId) return { error: "Login session expired — start again." };

  const ipHash = await clientIpHash();
  const userKeyHash = hashIp(`user:${ceremony.userId}`);
  if (
    (await isRateLimited(ipHash, "login-totp", LOGIN_TOTP_MAX, LOGIN_TOTP_WINDOW)) ||
    (await isRateLimited(userKeyHash, "login-totp", LOGIN_TOTP_MAX, LOGIN_TOTP_WINDOW))
  ) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const user = await getUserById(ceremony.userId);
  const credential = await getCredential(payload.credentialId);
  if (!user || !credential || credential.userId !== user.id) {
    return { error: "Login session expired — start again." };
  }

  if (!verifyTotp(decryptSecret(user.totpSecretEnc), payload.totpCode)) {
    await recordAttempt(ipHash, "login-totp");
    await recordAttempt(userKeyHash, "login-totp");
    return { error: "Wrong authenticator code." };
  }

  await clearAttempts(ipHash, "login-totp");
  await clearAttempts(userKeyHash, "login-totp");
  await createSession(user.id, user.email);
  return {
    ok: true,
    wrappedKeyPrf: credential.wrappedKeyPrf,
    wrappedKeyRecovery: user.wrappedKeyRecovery,
    prfCapable: credential.prfCapable,
  };
}

// ---------------------------------------------------------------------------
// Recovery login: username + recovery-code-derived auth key + mandatory TOTP.
// ---------------------------------------------------------------------------

export interface RecoveryLoginResult {
  error?: string;
  ok?: boolean;
  wrappedKeyRecovery?: string;
}

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

  const fail = async () => {
    await recordAttempt(ipHash, "recovery");
    await recordAttempt(userKeyHash, "recovery");
    // One generic message: don't reveal which of the three inputs was wrong.
    return { error: "Wrong username, recovery code, or authenticator code." };
  };

  const user = await getUserByUsername(username);
  if (!user) return fail();
  if (!recoveryHashMatches(user.recoveryAuthHash, sha256hex(payload.recoveryAuthKey))) {
    return fail();
  }
  if (!verifyTotp(decryptSecret(user.totpSecretEnc), payload.totpCode)) return fail();

  await clearAttempts(ipHash, "recovery");
  await clearAttempts(userKeyHash, "recovery");
  await createSession(user.id, user.email);
  return { ok: true, wrappedKeyRecovery: user.wrappedKeyRecovery };
}

// ---------------------------------------------------------------------------
// Passkey management (Settings). Adding, resetting, or removing a passkey ALWAYS
// requires the recovery code + a TOTP code — even while signed in — so a stolen
// live session can't enroll or strip a device. Max 3 passkeys per account.
// ---------------------------------------------------------------------------

// Shared gate: valid session + recovery-code proof + TOTP. Returns the user or
// an error string.
async function manageGate(
  recoveryAuthKey: string,
  totpCode: string
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getUserById>>> } | { error: string }> {
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
  if (!verifyTotp(decryptSecret(user.totpSecretEnc), totpCode)) return bad();

  await clearAttempts(ipHash, "manage");
  await clearAttempts(userKeyHash, "manage");
  return { user };
}

export async function listPasskeys(): Promise<{ error?: string; passkeys?: CredentialMeta[]; max?: number }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  return { passkeys: await listCredentialMeta(session.userId), max: MAX_PASSKEYS };
}

export async function addPasskeyBegin(payload: {
  recoveryAuthKey: string;
  totpCode: string;
}): Promise<{ error?: string; optionsJSON?: unknown; wrappedKeyRecovery?: string }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };
  const { user } = gate;

  if ((await countCredentialsForUser(user.id)) >= MAX_PASSKEYS) {
    return { error: `You can have at most ${MAX_PASSKEYS} passkeys. Remove one first.` };
  }
  const existing = await getCredentialsForUser(user.id);
  const options = await registrationOptions(user.username, existing);
  await setCeremony({ kind: "add-passkey", challenge: options.challenge, userId: user.id });
  // The client re-wraps the mail key under the new passkey's PRF; it unwraps the
  // source key from the recovery blob using the words it already collected.
  return { optionsJSON: options, wrappedKeyRecovery: user.wrappedKeyRecovery };
}

export async function addPasskeyComplete(payload: {
  attestation: unknown;
  prfCapable: boolean;
  wrappedKeyPrf: string | null;
  nickname?: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const ceremony = await takeCeremony("add-passkey");
  if (!ceremony || ceremony.userId !== session.userId) {
    return { error: "Ceremony expired — try again." };
  }
  // Re-check the cap at commit time (guards a double-submit race).
  if ((await countCredentialsForUser(session.userId)) >= MAX_PASSKEYS) {
    return { error: `You can have at most ${MAX_PASSKEYS} passkeys.` };
  }
  const cred = await verifyRegistration(
    payload.attestation as RegistrationResponseJSON,
    ceremony.challenge
  );
  if (!cred) return { error: "Passkey could not be verified." };
  await addCredential({
    id: cred.id,
    userId: session.userId,
    publicKey: cred.publicKey,
    counter: cred.counter,
    transports: cred.transports,
    prfCapable: payload.prfCapable,
    wrappedKeyPrf: payload.wrappedKeyPrf,
    nickname: payload.nickname?.slice(0, 60),
    isOriginal: false, // added later → login with it also requires TOTP
  });
  return { ok: true };
}

export async function removePasskey(payload: {
  recoveryAuthKey: string;
  totpCode: string;
  credentialId: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };
  const cred = await getCredential(payload.credentialId);
  if (!cred || cred.userId !== gate.user.id) {
    return { error: "That passkey isn't on your account." };
  }
  // The original (signup) passkey is permanent: it's the only credential that
  // logs in without a TOTP code, and it can never be re-created for an existing
  // account, so removing it would silently downgrade the account forever.
  if (cred.isOriginal) {
    return { error: "Your original passkey is permanent and can't be removed." };
  }
  const removed = await removeCredential(payload.credentialId, gate.user.id);
  if (!removed) return { error: "That passkey isn't on your account." };
  return { ok: true };
}

// Wrapped key material for the signed-in user, so a fresh tab (session cookie
// valid, but sessionStorage empty) can re-unlock the mail key locally — via a
// passkey PRF tap or the recovery words. Blobs only; nothing here decrypts mail.
export async function getWrappedKeys(): Promise<{
  error?: string;
  wrappedKeyRecovery?: string;
  credentials?: { id: string; wrappedKeyPrf: string | null }[];
}> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const creds = await getCredentialsForUser(session.userId);
  return {
    wrappedKeyRecovery: session.user.wrappedKeyRecovery,
    credentials: creds.map((c) => ({ id: c.id, wrappedKeyPrf: c.wrappedKeyPrf })),
  };
}

// Self-heal: store a PRF-wrapped mail key for a credential the user just used.
// Authenticators commonly reveal PRF output only during `get()`, so the first
// login (not registration) is when this wrap becomes possible.
export async function setPrfWrap(payload: {
  credentialId: string;
  wrappedKeyPrf: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const cred = await getCredential(payload.credentialId);
  if (!cred || cred.userId !== session.userId) return { error: "Unknown credential." };
  if (!payload.wrappedKeyPrf || payload.wrappedKeyPrf.length > 16384) {
    return { error: "Malformed key blob." };
  }
  await setCredentialPrfWrap(cred.id, session.userId, payload.wrappedKeyPrf);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

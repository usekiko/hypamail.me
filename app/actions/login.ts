"use server";

// Passkey sign-in, both the usernameless flavour and the username-first one.
import { randomBytes } from "crypto";
import { authenticationOptions, verifyAuthentication } from "@/lib/webauthn";
import { verifyTotp } from "@/lib/totp";
import { decryptSecret } from "@/lib/secrets";
import { createSession, setCeremony, takeCeremony } from "@/lib/session";
import {
  clearAttempts,
  getCredential,
  getCredentialsForUser,
  getUserById,
  getUserByUsername,
  hashIp,
  isRateLimited,
  recordAttempt,
  touchCredential,
  type CredentialRow,
} from "@/lib/db";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  LOGIN_LOOKUP_MAX,
  LOGIN_LOOKUP_WINDOW,
  LOGIN_TOTP_MAX,
  LOGIN_TOTP_WINDOW,
  clientIpHash,
} from "./shared";

export async function loginBegin(): Promise<{ optionsJSON: unknown }> {
  const options = await authenticationOptions();
  await setCeremony({ kind: "login", challenge: options.challenge });
  return { optionsJSON: options };
}

// Stand-in for unknown usernames so loginBeginForDevice can't be used to probe
// which accounts exist — the ceremony looks identical and fails at the
// authenticator instead of here.
function decoyCredential(): CredentialRow {
  return {
    id: randomBytes(32).toString("base64url"),
    userId: "0",
    publicKey: "",
    counter: 0,
    transports: ["hybrid", "internal"],
    prfCapable: false,
    wrappedKeyPrf: null,
    isOriginal: false,
  };
}

// Username-first sign-in, for when the passkey lives on another device.
//
// The usernameless request sends an empty allowCredentials, so the browser can
// only offer passkeys it can enumerate locally — a machine with no platform
// passkey store has nothing to list and never offers the phone/QR flow. Naming
// the account lets us send the transports recorded at registration ("hybrid"
// for a phone), which is what makes the browser reach for it.
export async function loginBeginForDevice(payload: {
  username: string;
}): Promise<{ error?: string; optionsJSON?: unknown }> {
  const username = String(payload.username || "").trim().toLowerCase();

  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "login-lookup", LOGIN_LOOKUP_MAX, LOGIN_LOOKUP_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }
  await recordAttempt(ipHash, "login-lookup");

  const user = await getUserByUsername(username);
  const creds = user ? await getCredentialsForUser(user.id) : [];
  const options = await authenticationOptions(creds.length ? creds : [decoyCredential()]);
  await setCeremony({ kind: "login", challenge: options.challenge });
  return { optionsJSON: options };
}

export interface LoginCompleteResult {
  error?: string;
  ok?: boolean;
  needTotp?: boolean; // prove TOTP before the session is issued
  totpReason?: "added-passkey" | "always-on";
  wrappedKeyPrf?: string | null;
  wrappedKeyRecovery?: string;
  prfCapable?: boolean;
}

export async function loginComplete(payload: {
  assertion: unknown;
}): Promise<LoginCompleteResult> {
  const ceremony = await takeCeremony("login");
  if (!ceremony) return { error: "Login session expired. Try again." };

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

  // Only the original passkey logs in with one tap, and only while the account
  // hasn't opted into a code on every sign-in. No enrolled authenticator means
  // there's no second factor to demand — gating here would lock the account out
  // of a step it could never satisfy.
  if (user.totpSecretEnc && (!credential.isOriginal || user.requireTotpOnLogin)) {
    await setCeremony({
      kind: "login-totp",
      challenge: "", // unused; the passkey is already verified
      userId: user.id,
      credentialId: credential.id,
    });
    return { needTotp: true, totpReason: credential.isOriginal ? "always-on" : "added-passkey" };
  }

  await createSession(user.id, user.email);
  return {
    ok: true,
    wrappedKeyPrf: credential.wrappedKeyPrf,
    wrappedKeyRecovery: user.wrappedKeyRecovery,
    prfCapable: credential.prfCapable,
  };
}

// Second step after loginComplete asked for a code. The passkey is already
// verified; a valid code here issues the session.
export async function loginTotp(payload: {
  totpCode: string;
}): Promise<LoginCompleteResult> {
  const ceremony = await takeCeremony("login-totp");
  if (!ceremony?.userId || !ceremony.credentialId) {
    return { error: "Login session expired. Start again." };
  }

  const ipHash = await clientIpHash();
  const userKeyHash = hashIp(`user:${ceremony.userId}`);
  if (
    (await isRateLimited(ipHash, "login-totp", LOGIN_TOTP_MAX, LOGIN_TOTP_WINDOW)) ||
    (await isRateLimited(userKeyHash, "login-totp", LOGIN_TOTP_MAX, LOGIN_TOTP_WINDOW))
  ) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Both come from the ceremony, not the client: this must be the credential
  // loginComplete actually verified, not just any passkey on the account.
  const user = await getUserById(ceremony.userId);
  const credential = await getCredential(ceremony.credentialId);
  if (!user || !credential || credential.userId !== user.id) {
    return { error: "Login session expired. Start again." };
  }

  if (!user.totpSecretEnc || !verifyTotp(decryptSecret(user.totpSecretEnc), payload.totpCode)) {
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

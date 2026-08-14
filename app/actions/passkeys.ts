"use server";

// Passkey management from Settings. Adding or removing one always goes through
// manageGate — see shared.ts for why a live session isn't enough on its own.
import { registrationOptions, verifyRegistration } from "@/lib/webauthn";
import { getSession, setCeremony, takeCeremony } from "@/lib/session";
import {
  addCredential,
  countCredentialsForUser,
  getCredential,
  getCredentialsForUser,
  listCredentialMeta,
  removeCredential,
  MAX_PASSKEYS,
  type CredentialMeta,
} from "@/lib/db";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { manageGate } from "./shared";

export interface AccountSecurity {
  error?: string;
  username?: string;
  passkeys?: CredentialMeta[];
  max?: number;
  requireTotpOnLogin?: boolean;
  hasTotp?: boolean;
  hasPassword?: boolean;
}

// Everything Settings needs to render, in one round-trip.
export async function listPasskeys(): Promise<AccountSecurity> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  return {
    username: session.user.username,
    passkeys: await listCredentialMeta(session.userId),
    max: MAX_PASSKEYS,
    requireTotpOnLogin: session.user.requireTotpOnLogin,
    hasTotp: !!session.user.totpSecretEnc,
    hasPassword: !!session.user.passwordAuthHash,
  };
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
  // The client re-wraps the mail key under the new passkey's PRF, unwrapping the
  // source key from this blob with the words it already collected.
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
    return { error: "Ceremony expired. Try again." };
  }
  // Re-check the cap at commit time, in case of a double submit.
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
    isOriginal: false, // added later → signing in with it also wants a code
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
  // The original passkey can never be re-created for an existing account, so
  // removing it would quietly downgrade the account forever.
  if (cred.isOriginal) {
    return { error: "Your original passkey is permanent and can't be removed." };
  }
  const removed = await removeCredential(payload.credentialId, gate.user.id);
  if (!removed) return { error: "That passkey isn't on your account." };
  return { ok: true };
}

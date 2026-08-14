"use server";

import { redirect } from "next/navigation";
import { destroySession, getSession } from "@/lib/session";
import {
  clearUserPassword,
  getCredential,
  getCredentialsForUser,
  setCredentialPrfWrap,
  setUserPassword,
} from "@/lib/db";
import { manageGate, sha256hex } from "./shared";

const MAX_BLOB = 16384;

// Wrapped key material for the signed-in user, so a fresh tab (cookie valid,
// sessionStorage empty) can re-unlock the mail key locally — via a passkey tap
// or the recovery words. Blobs only; nothing here decrypts mail.
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
// Authenticators commonly reveal PRF output only during get(), so the first
// login — not registration — is when this wrap becomes possible.
export async function setPrfWrap(payload: {
  credentialId: string;
  wrappedKeyPrf: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const cred = await getCredential(payload.credentialId);
  if (!cred || cred.userId !== session.userId) return { error: "Unknown credential." };
  if (!payload.wrappedKeyPrf || payload.wrappedKeyPrf.length > MAX_BLOB) {
    return { error: "Malformed key blob." };
  }
  await setCredentialPrfWrap(cred.id, session.userId, payload.wrappedKeyPrf);
  return { ok: true };
}

// Set or replace the optional password. Same deal as signup: the password never
// arrives here — the browser derives the auth half and wraps the mail key with
// the other half, and we only ever see the results.
export async function setAccountPassword(payload: {
  recoveryAuthKey: string;
  totpCode: string;
  salt: string;
  passwordAuthKey: string;
  wrappedKeyPassword: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };

  const { salt, passwordAuthKey, wrappedKeyPassword } = payload;
  if (!salt || !passwordAuthKey || !wrappedKeyPassword) {
    return { error: "Malformed password payload." };
  }
  if (salt.length > 128 || passwordAuthKey.length > 512 || wrappedKeyPassword.length > MAX_BLOB) {
    return { error: "Malformed password payload." };
  }

  await setUserPassword(gate.user.id, salt, sha256hex(passwordAuthKey), wrappedKeyPassword);
  return { ok: true };
}

export async function removeAccountPassword(payload: {
  recoveryAuthKey: string;
  totpCode: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };
  await clearUserPassword(gate.user.id);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

// The commit half of signup. Everything past this point writes, so each step
// undoes the ones before it on failure.
import { provisionAccount, deleteAccount, uploadEncryptionKey, generatePassword, usernameTaken } from "@/lib/admin";
import { encryptSecret } from "@/lib/secrets";
import { addCredential, createUser, releaseInviteCode } from "@/lib/db";
import { sha256hex } from "./shared";
import type { verifyRegistration } from "@/lib/webauthn";

type VerifiedCredential = NonNullable<Awaited<ReturnType<typeof verifyRegistration>>>;

export interface NewAccount {
  username: string;
  email: string;
  invite: string | null; // null → the invite window is open, nothing to release
  pgpPublicKey: string;
  wrappedKeyRecovery: string;
  recoveryAuthKey: string;
  totpSecret: string | null;
  passwordSalt: string | null;
  passwordAuthKey: string | null;
  wrappedKeyPassword: string | null;
  credential: VerifiedCredential | null;
  prfCapable: boolean;
  wrappedKeyPrf: string | null;
}

export async function createMailbox(a: NewAccount): Promise<{ userId?: string; error?: string }> {
  // Internal mailbox credential: random, never shown to anyone, only unlocks
  // ciphertext. Stored encrypted server-side.
  const mailPassword = generatePassword();
  let accountId: string;
  try {
    accountId = await provisionAccount(a.username, mailPassword);
  } catch {
    if (a.invite) await releaseInviteCode(a.invite);
    if (await usernameTaken(a.username)) return { error: "That username is already taken." };
    return { error: "Could not create the mailbox. Please try again." };
  }

  // Without this the mailbox would store plaintext, which is the whole point of
  // the product — tear the account down rather than ship it half-built.
  try {
    await uploadEncryptionKey(a.email, mailPassword, a.pgpPublicKey);
  } catch {
    try {
      await deleteAccount(a.username);
    } catch {}
    if (a.invite) await releaseInviteCode(a.invite);
    return { error: "Could not enable mailbox encryption. Please try again." };
  }

  const userId = await createUser({
    username: a.username,
    email: a.email,
    accountId,
    encMailPassword: encryptSecret(mailPassword),
    pgpPublicKey: a.pgpPublicKey,
    wrappedKeyRecovery: a.wrappedKeyRecovery,
    recoveryAuthHash: sha256hex(a.recoveryAuthKey),
    totpSecretEnc: a.totpSecret ? encryptSecret(a.totpSecret) : null,
    passwordSalt: a.passwordSalt,
    passwordAuthHash: a.passwordAuthKey ? sha256hex(a.passwordAuthKey) : null,
    wrappedKeyPassword: a.wrappedKeyPassword,
  });

  if (a.credential) {
    await addCredential({
      id: a.credential.id,
      userId,
      publicKey: a.credential.publicKey,
      counter: a.credential.counter,
      transports: a.credential.transports,
      prfCapable: a.prfCapable,
      wrappedKeyPrf: a.wrappedKeyPrf,
      isOriginal: true, // the signup passkey: one-tap login, no TOTP
    });
  }

  return { userId };
}

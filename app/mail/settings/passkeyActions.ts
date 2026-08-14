"use client";

// The browser half of adding and removing a passkey. Each returns an error
// string, or null when it worked.
import { addPasskeyBegin, addPasskeyComplete, removePasskey } from "../../actions";
import {
  deriveRecoveryAuthKey,
  loadMailKey,
  unwrapWithRecovery,
  webauthnCreate,
  wrapWithPrf,
} from "@/lib/client/crypto";

export async function addPasskey(words: string, totpCode: string): Promise<string | null> {
  try {
    const begin = await addPasskeyBegin({
      recoveryAuthKey: await deriveRecoveryAuthKey(words),
      totpCode,
    });
    if (begin.error || !begin.optionsJSON || !begin.wrappedKeyRecovery) {
      return begin.error || "Could not start passkey setup.";
    }
    const created = await webauthnCreate(begin.optionsJSON);

    // The new passkey needs its own PRF-wrapped copy of the mail key, so unwrap
    // the source from the recovery blob with the words just entered (or reuse
    // the already-unlocked key if this tab has one).
    let mailKey = loadMailKey();
    if (!mailKey) {
      try {
        mailKey = await unwrapWithRecovery(words, begin.wrappedKeyRecovery);
      } catch {
        mailKey = null;
      }
    }

    const res = await addPasskeyComplete({
      attestation: created.responseJSON,
      prfCapable: created.prfEnabled,
      wrappedKeyPrf:
        created.prfOutput && mailKey ? await wrapWithPrf(created.prfOutput, mailKey) : null,
    });
    return res.ok ? null : res.error || "Could not save the passkey.";
  } catch (err) {
    if (err instanceof DOMException && err.name === "InvalidStateError") {
      return "This device already has a passkey for your account.";
    }
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      return "Passkey creation was cancelled.";
    }
    return "This browser couldn't create a passkey. See the help below.";
  }
}

export async function deletePasskey(
  words: string,
  totpCode: string,
  credentialId: string
): Promise<string | null> {
  const res = await removePasskey({
    recoveryAuthKey: await deriveRecoveryAuthKey(words),
    totpCode,
    credentialId,
  });
  return res.ok ? null : res.error || "Could not remove the passkey.";
}

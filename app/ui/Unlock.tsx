"use client";

// Puts the mail key back in sessionStorage for a session that's already signed
// in (fresh tab, browser restart). Two local paths, no re-login: a passkey tap
// via PRF, or the 12 recovery words. Only wrapped blobs come from the server.
import { useState } from "react";
import { getWrappedKeys, setPrfWrap } from "../actions";
import {
  localPrfGet,
  unwrapWithPrf,
  unwrapWithRecovery,
  wrapWithPrf,
  recoveryWordsError,
  storeMailKey,
} from "@/lib/client/crypto";
import { Button, Card } from "@heroui/react";
import { Alert } from "./Alert";
import { MIcon } from "@/components/ui/material-icon";
import RecoveryWordsInput from "./RecoveryWordsInput";

export default function Unlock({ onUnlocked }: { onUnlocked: (key: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [words, setWords] = useState("");

  function done(key: string) {
    storeMailKey(key);
    onUnlocked(key);
  }

  async function viaPasskey() {
    setError(null);
    setBusy(true);
    try {
      const keys = await getWrappedKeys();
      if (keys.error) {
        setError(keys.error);
        return;
      }
      const got = await localPrfGet();
      const cred = keys.credentials?.find((c) => c.id === got.credentialId);
      if (!got.prfOutput || !cred?.wrappedKeyPrf) {
        setError(
          !got.prfOutput
            ? "This passkey/browser can't derive the unlock key. Use your recovery words below."
            : "This passkey has no stored key yet. Unlock with your recovery words once, then it will."
        );
        return;
      }
      done(await unwrapWithPrf(got.prfOutput, cred.wrappedKeyPrf));
    } catch {
      setError("Passkey unlock failed. Try your recovery words.");
    } finally {
      setBusy(false);
    }
  }

  async function viaWords(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) {
      setError(wordsErr);
      return;
    }
    setBusy(true);
    try {
      const keys = await getWrappedKeys();
      if (keys.error || !keys.wrappedKeyRecovery) {
        setError(keys.error || "Could not load your key.");
        return;
      }
      let key: string;
      try {
        key = await unwrapWithRecovery(words, keys.wrappedKeyRecovery);
      } catch {
        setError("Wrong recovery code.");
        return;
      }
      // Opportunistically PRF-wrap for this device's passkey so next time is
      // one tap. Best effort; failures are fine.
      try {
        const got = await localPrfGet();
        const cred = keys.credentials?.find((c) => c.id === got.credentialId);
        if (got.prfOutput && cred && !cred.wrappedKeyPrf) {
          await setPrfWrap({
            credentialId: got.credentialId,
            wrappedKeyPrf: await wrapWithPrf(got.prfOutput, key),
          });
        }
      } catch {}
      done(key);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Card.Content>
        <div className="mb-3 flex items-center gap-2">
          <MIcon name="lock" size={16} />
          <b>Mailbox locked</b>
        </div>
        <p className="mt-0 mb-4 text-[13px] leading-relaxed text-muted">
          Your mail is end-to-end encrypted and this tab doesn&apos;t hold the key yet.
          Unlock it with your passkey.
        </p>
        <Button variant="primary" onPress={viaPasskey} isDisabled={busy} fullWidth className="mb-4">
          {busy ? "Waiting…" : "Unlock with passkey"}
        </Button>
        <details>
          <summary className="cursor-pointer text-[13px] text-muted">
            Use recovery words instead
          </summary>
          <form onSubmit={viaWords} className="mt-3 flex flex-col gap-3">
            <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
            <Button type="submit" variant="outline" isDisabled={busy || !words.trim()} fullWidth>
              Unlock
            </Button>
          </form>
        </details>
        {error && <Alert tone="error" style={{ marginTop: "0.75rem", marginBottom: 0 }}>{error}</Alert>}
      </Card.Content>
    </Card>
  );
}

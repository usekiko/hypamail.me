"use client";

// Unlocks the mail key into sessionStorage for an already-authenticated session
// (fresh tab, browser restart). Two local paths, no re-login:
//   - passkey tap → PRF output → unwrap the per-credential blob
//   - 12 recovery words → unwrap the recovery blob
// Fetches only wrapped blobs from the server; unwrapping happens here.
import { useState } from "react";
import { getWrappedKeys, setPrfWrap } from "../actions";
import {
  localPrfGet,
  unwrapWithPrf,
  unwrapWithRecovery,
  wrapWithPrf,
  recoveryWordsValid,
  storeMailKey,
} from "@/lib/client/crypto";
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
            ? "This passkey/browser can't derive the unlock key — use your recovery words below."
            : "This passkey has no stored key yet — unlock with your recovery words once, then it will."
        );
        return;
      }
      done(await unwrapWithPrf(got.prfOutput, cred.wrappedKeyPrf));
    } catch {
      setError("Passkey unlock failed — try your recovery words.");
    } finally {
      setBusy(false);
    }
  }

  async function viaWords(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!recoveryWordsValid(words)) {
      setError("That doesn't look like a valid 12-word recovery code.");
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
    <div className="panel" style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.75rem" }}>
        <span className="icon" style={{ fontSize: "18px" }}>lock</span>
        <b>Mailbox locked</b>
      </div>
      <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1rem", lineHeight: 1.6 }}>
        Your mail is end-to-end encrypted and this tab doesn&apos;t hold the key yet.
        Unlock it with your passkey.
      </p>
      <button className="btn btn-primary" onClick={viaPasskey} disabled={busy} style={{ width: "100%", padding: "0.55rem", marginBottom: "1rem" }}>
        {busy ? "Waiting…" : "Unlock with passkey"}
      </button>
      <details>
        <summary style={{ color: "#878787", fontSize: "13px", cursor: "pointer" }}>
          Use recovery words instead
        </summary>
        <form onSubmit={viaWords} style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
          <button className="btn btn-cancel" type="submit" disabled={busy || !words.trim()} style={{ padding: "0.5rem" }}>
            Unlock
          </button>
        </form>
      </details>
      {error && <div style={{ color: "#e06a6a", fontSize: "13px", marginTop: "0.75rem" }}>{error}</div>}
    </div>
  );
}

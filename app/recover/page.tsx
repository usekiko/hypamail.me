"use client";

// Account recovery: username + 12 recovery words + mandatory TOTP.
// The words never leave the browser — only a derived auth key does (HKDF with
// a different context than the key-unwrap derivation, so the server-side
// verifier can't decrypt anything). After recovery we offer to add a passkey
// for this device; because adding a passkey always needs recovery + TOTP, we
// reuse the recovery proof and just ask for a fresh authenticator code.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { recoveryLogin, addPasskeyBegin, addPasskeyComplete } from "../actions";
import {
  deriveRecoveryAuthKey,
  unwrapWithRecovery,
  recoveryWordsError,
  webauthnCreate,
  wrapWithPrf,
  storeMailKey,
  loadMailKey,
} from "@/lib/client/crypto";
import PasskeyHelp from "../ui/PasskeyHelp";
import RecoveryWordsInput from "../ui/RecoveryWordsInput";

export default function RecoverPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [words, setWords] = useState("");
  // Kept after a successful recovery so we can gate the add-passkey step.
  const [recoveryAuthKey, setRecoveryAuthKey] = useState<string | null>(null);
  const [addTotp, setAddTotp] = useState("");

  async function onRecover(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get("username") || "");
    const wordsStr = words;
    const totpCode = String(fd.get("totp") || "");
    const wordsErr = recoveryWordsError(wordsStr);
    if (wordsErr) {
      setError(wordsErr);
      return;
    }
    setBusy(true);
    try {
      const authKey = await deriveRecoveryAuthKey(wordsStr);
      const res = await recoveryLogin({ username, recoveryAuthKey: authKey, totpCode });
      if (!res.ok || !res.wrappedKeyRecovery) {
        setError(res.error || "Recovery failed.");
        return;
      }
      try {
        storeMailKey(await unwrapWithRecovery(wordsStr, res.wrappedKeyRecovery));
      } catch {
        // Shouldn't happen (same words just authenticated), but never block login on it.
      }
      setRecoveryAuthKey(authKey);
      setRecovered(true);
    } finally {
      setBusy(false);
    }
  }

  async function onAddPasskey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!recoveryAuthKey) return;
    setError(null);
    setBusy(true);
    try {
      const begin = await addPasskeyBegin({ recoveryAuthKey, totpCode: addTotp });
      if (begin.error || !begin.optionsJSON) {
        setError(begin.error || "Could not start passkey setup.");
        return;
      }
      const created = await webauthnCreate(begin.optionsJSON);
      const mailKey = loadMailKey();
      const res = await addPasskeyComplete({
        attestation: created.responseJSON,
        prfCapable: created.prfEnabled,
        wrappedKeyPrf:
          created.prfOutput && mailKey ? await wrapWithPrf(created.prfOutput, mailKey) : null,
      });
      if (!res.ok) {
        setError(res.error || "Could not save the passkey.");
        return;
      }
      router.push("/mail");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "InvalidStateError"
          ? "This device already has a passkey for your account — just continue to your inbox."
          : err instanceof DOMException && err.name === "NotAllowedError"
            ? "Passkey creation was cancelled."
            : "This browser couldn't create a passkey — you can still continue to your inbox."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 500 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
          alt="hypamail"
          style={{ height: 80, width: "auto", display: "block", marginBottom: "1.5rem" }}
        />

        {recovered ? (
          <>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>You&apos;re back in</h1>
            <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
              Add a passkey on this device so next time is one tap. Enter a fresh code from your
              authenticator to confirm (this passkey will be a secondary one, so signing in with
              it will also ask for a code).
            </p>
            <form onSubmit={onAddPasskey} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <input
                className="inpt"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="authenticator code"
                autoComplete="one-time-code"
                value={addTotp}
                onChange={(e) => setAddTotp(e.target.value.replace(/\D/g, ""))}
                required
                style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em" }}
              />
              <button className="btn btn-primary" type="submit" disabled={busy || addTotp.length !== 6} style={{ width: "100%", padding: "0.55rem" }}>
                {busy ? "Waiting for your device…" : "Add a passkey on this device"}
              </button>
            </form>
            <Link className="btn btn-cancel" href="/mail" style={{ display: "block", width: "100%", textAlign: "center", padding: "0.55rem", marginTop: "0.75rem" }}>
              Skip — go to inbox
            </Link>
            {error && <div style={{ color: "#e06a6a", fontSize: "13px", marginTop: "0.75rem" }}>{error}</div>}
            <PasskeyHelp />
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Account recovery</h1>
            <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.75rem", lineHeight: 1.6 }}>
              Lost your device? Sign in with your username, your 12 recovery words, and a
              code from your authenticator app.
            </p>
            <form onSubmit={onRecover} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="field-label">Username</label>
                <input className="inpt" name="username" placeholder="Username" autoComplete="username" autoCapitalize="none" required />
              </div>
              <div>
                <label className="field-label">Recovery code (12 words)</label>
                <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
              </div>
              <div>
                <label className="field-label">Authenticator code</label>
                <input
                  className="inpt"
                  name="totp"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  required
                  style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em" }}
                />
              </div>
              {error && <div style={{ color: "#e06a6a", fontSize: "13px" }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", padding: "0.55rem" }}>
                {busy ? "Checking…" : "Recover account"}
              </button>
            </form>
            <p style={{ fontSize: "13px", marginTop: "1.25rem" }}>
              <Link href="/login" style={{ fontWeight: 600 }}>Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

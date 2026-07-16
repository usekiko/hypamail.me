"use client";

// Passwordless login: one passkey tap signs you in AND unlocks your mail key
// (via the WebAuthn PRF extension). If the browser/passkey can't do PRF, we
// fall back to asking for the recovery words to unlock mail after the passkey
// authenticates.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginBegin, loginComplete, setPrfWrap } from "../actions";
import {
  webauthnGet,
  unwrapWithPrf,
  unwrapWithRecovery,
  wrapWithPrf,
  recoveryWordsValid,
  storeMailKey,
} from "@/lib/client/crypto";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the passkey signed us in but couldn't unlock mail (no PRF):
  const [needWords, setNeedWords] = useState<{
    wrappedKeyRecovery: string;
    credentialId: string;
    prfOutput: ArrayBuffer | null;
  } | null>(null);
  const [words, setWords] = useState("");

  async function onPasskey() {
    setError(null);
    setBusy(true);
    try {
      const { optionsJSON } = await loginBegin();
      const got = await webauthnGet(optionsJSON);
      const res = await loginComplete({ assertion: got.responseJSON });
      if (!res.ok) {
        setError(res.error || "Sign-in failed.");
        return;
      }
      if (got.prfOutput && res.wrappedKeyPrf) {
        storeMailKey(await unwrapWithPrf(got.prfOutput, res.wrappedKeyPrf));
        router.push("/mail");
        return;
      }
      // Signed in, but the mail key needs another way in. If we got PRF output
      // but no stored wrap, the words will unlock it once and we self-heal.
      setNeedWords({
        wrappedKeyRecovery: res.wrappedKeyRecovery!,
        credentialId: got.credentialId,
        prfOutput: got.prfOutput,
      });
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Sign-in was cancelled — try again."
          : "No usable passkey here? Use account recovery below."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onWords(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!needWords) return;
    setError(null);
    if (!recoveryWordsValid(words)) {
      setError("That doesn't look like a valid 12-word recovery code.");
      return;
    }
    setBusy(true);
    try {
      let key: string;
      try {
        key = await unwrapWithRecovery(words, needWords.wrappedKeyRecovery);
      } catch {
        setError("Wrong recovery code.");
        return;
      }
      if (needWords.prfOutput) {
        // Self-heal: store a PRF wrap so next login is a single tap.
        try {
          await setPrfWrap({
            credentialId: needWords.credentialId,
            wrappedKeyPrf: await wrapWithPrf(needWords.prfOutput, key),
          });
        } catch {}
      }
      storeMailKey(key);
      router.push("/mail");
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
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Sign in</h1>
        <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.75rem" }}>
          no passwords here — your passkey signs you in and decrypts your mail
        </p>

        {needWords ? (
          <form onSubmit={onWords} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ color: "#878787", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
              You&apos;re signed in, but this browser couldn&apos;t unlock your encrypted mail
              with the passkey alone. Enter your 12 recovery words once to unlock it here.
            </p>
            <textarea
              className="inpt"
              rows={2}
              placeholder="twelve words separated by spaces"
              value={words}
              onChange={(e) => setWords(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              style={{ height: "auto", padding: "9px 10px", fontFamily: "ui-monospace, monospace", resize: "vertical" }}
            />
            {error && <div style={{ color: "#e06a6a", fontSize: "13px" }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", padding: "0.55rem" }}>
              {busy ? "Unlocking…" : "Unlock mail"}
            </button>
          </form>
        ) : (
          <>
            <button className="btn btn-primary" onClick={onPasskey} disabled={busy} style={{ width: "100%", padding: "0.55rem" }}>
              {busy ? "Waiting for your device…" : "Sign in with passkey"}
            </button>
            {error && <div style={{ color: "#e06a6a", fontSize: "13px", marginTop: "0.75rem" }}>{error}</div>}
          </>
        )}

        <p style={{ fontSize: "13px", marginTop: "1.25rem", display: "flex", gap: "1rem" }}>
          <Link href="/recover" style={{ fontWeight: 600 }}>Lost your device?</Link>
          <Link href="/signup" style={{ fontWeight: 600 }}>Create an account</Link>
        </p>
      </div>
    </main>
  );
}

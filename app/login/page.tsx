"use client";

// Passwordless login. One passkey tap signs you in and (via the PRF extension)
// unlocks your mail key in the same gesture.
//   - Original (signup) passkey → straight to the inbox.
//   - A passkey you added later → we also ask for a TOTP code before letting you
//     in (proving possession isn't enough for a secondary device).
//   - No-PRF browsers → after sign-in, unlock mail once with the recovery words.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginBegin, loginComplete, loginTotp, setPrfWrap } from "../actions";
import {
  webauthnGet,
  unwrapWithPrf,
  unwrapWithRecovery,
  wrapWithPrf,
  recoveryWordsValid,
  storeMailKey,
} from "@/lib/client/crypto";
import PasskeyHelp from "../ui/PasskeyHelp";

type Phase = "idle" | "totp" | "words";

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [words, setWords] = useState("");
  // Carried between steps within one attempt.
  const [ctx, setCtx] = useState<{
    prfOutput: ArrayBuffer | null;
    credentialId: string;
    wrappedKeyPrf?: string | null;
    wrappedKeyRecovery?: string;
  } | null>(null);

  // Decide how to unlock mail once the server has issued the session.
  async function finishUnlock(res: {
    wrappedKeyPrf?: string | null;
    wrappedKeyRecovery?: string;
  }, prfOutput: ArrayBuffer | null) {
    if (prfOutput && res.wrappedKeyPrf) {
      storeMailKey(await unwrapWithPrf(prfOutput, res.wrappedKeyPrf));
      router.push("/mail");
      return;
    }
    // No PRF path — need the recovery words to unlock mail on this device.
    setCtx((c) => (c ? { ...c, wrappedKeyRecovery: res.wrappedKeyRecovery, prfOutput } : c));
    setPhase("words");
  }

  async function onPasskey() {
    setError(null);
    setBusy(true);
    try {
      const { optionsJSON } = await loginBegin();
      const got = await webauthnGet(optionsJSON);
      const res = await loginComplete({ assertion: got.responseJSON });
      if (res.error) {
        setError(res.error);
        return;
      }
      setCtx({ prfOutput: got.prfOutput, credentialId: got.credentialId });
      if (res.needTotp) {
        setPhase("totp");
        return;
      }
      await finishUnlock(res, got.prfOutput);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Sign-in was cancelled — try again."
          : "No usable passkey here? Use account recovery below, or see the help under the button."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ctx) return;
    setError(null);
    setBusy(true);
    try {
      const res = await loginTotp({ credentialId: ctx.credentialId, totpCode });
      if (!res.ok) {
        setError(res.error || "Sign-in failed.");
        return;
      }
      await finishUnlock(res, ctx.prfOutput);
    } finally {
      setBusy(false);
    }
  }

  async function onWords(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ctx?.wrappedKeyRecovery) return;
    setError(null);
    if (!recoveryWordsValid(words)) {
      setError("That doesn't look like a valid 12-word recovery code.");
      return;
    }
    setBusy(true);
    try {
      let key: string;
      try {
        key = await unwrapWithRecovery(words, ctx.wrappedKeyRecovery);
      } catch {
        setError("Wrong recovery code.");
        return;
      }
      if (ctx.prfOutput) {
        try {
          await setPrfWrap({
            credentialId: ctx.credentialId,
            wrappedKeyPrf: await wrapWithPrf(ctx.prfOutput, key),
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

        {phase === "totp" && (
          <form onSubmit={onTotp} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ color: "#878787", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
              This passkey was added after signup, so it also needs a code from your
              authenticator app.
            </p>
            <input
              className="inpt"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              required
              style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", textAlign: "center" }}
            />
            {error && <div style={{ color: "#e06a6a", fontSize: "13px" }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy || totpCode.length !== 6} style={{ width: "100%", padding: "0.55rem" }}>
              {busy ? "Checking…" : "Verify & sign in"}
            </button>
          </form>
        )}

        {phase === "words" && (
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
        )}

        {phase === "idle" && (
          <>
            <button className="btn btn-primary" onClick={onPasskey} disabled={busy} style={{ width: "100%", padding: "0.55rem" }}>
              {busy ? "Waiting for your device…" : "Sign in with passkey"}
            </button>
            {error && <div style={{ color: "#e06a6a", fontSize: "13px", marginTop: "0.75rem" }}>{error}</div>}
            <PasskeyHelp />
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

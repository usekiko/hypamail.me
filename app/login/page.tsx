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
import { Instrument_Sans } from "next/font/google";
import { Button, InputGroup } from "@heroui/react";
import { loginBegin, loginBeginForDevice, loginComplete, loginTotp, setPrfWrap } from "../actions";
import {
  webauthnGet,
  unwrapWithPrf,
  unwrapWithRecovery,
  wrapWithPrf,
  recoveryWordsError,
  storeMailKey,
} from "@/lib/client/crypto";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import { DarkAuthColumn } from "../ui/DarkAuthShell";
import { legacyLoginAvailable } from "@/constants/legacy";
import PasskeyHelp from "../ui/PasskeyHelp";
import FirefoxNote from "../ui/FirefoxNote";
import RecoveryWordsInput from "../ui/RecoveryWordsInput";
import "../heroui.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type Phase = "idle" | "totp" | "words";

const TITLES: Record<Phase, { title: string; subtitle: string }> = {
  idle: {
    title: "Sign in",
    subtitle: "No passwords here. Your passkey signs you in and decrypts your mail.",
  },
  totp: { title: "One more step", subtitle: "Enter the code from your authenticator app." },
  words: { title: "Unlock your mail", subtitle: "One-time step for this browser." },
};

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpReason, setTotpReason] = useState<"added-passkey" | "always-on" | null>(null);
  const [words, setWords] = useState("");
  const [deviceUser, setDeviceUser] = useState("");
  const [showDevice, setShowDevice] = useState(false);
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

  // Shared tail of both sign-in routes, once the authenticator has answered.
  async function afterAssertion(got: Awaited<ReturnType<typeof webauthnGet>>) {
    const res = await loginComplete({ assertion: got.responseJSON });
    if (res.error) {
      setError(res.error);
      return;
    }
    setCtx({ prfOutput: got.prfOutput, credentialId: got.credentialId });
    if (res.needTotp) {
      setTotpReason(res.totpReason ?? null);
      setPhase("totp");
      return;
    }
    await finishUnlock(res, got.prfOutput);
  }

  function assertionError(err: unknown) {
    setError(
      err instanceof DOMException && err.name === "NotAllowedError"
        ? "Sign-in was cancelled, or no passkey was offered. If yours is on your phone or a security key, use the option below."
        : "Couldn't reach a passkey here. Try the option below, or account recovery."
    );
  }

  // Usernameless: only surfaces passkeys the browser can enumerate locally.
  async function onPasskey() {
    setError(null);
    setBusy(true);
    try {
      const { optionsJSON } = await loginBegin();
      await afterAssertion(await webauthnGet(optionsJSON));
    } catch (err) {
      assertionError(err);
    } finally {
      setBusy(false);
    }
  }

  // Username-first: sends allowCredentials with the stored transports, which is
  // what lets the browser offer a passkey living on a phone or a security key.
  async function onDevice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const begin = await loginBeginForDevice({ username: deviceUser });
      if (begin.error || !begin.optionsJSON) {
        setError(begin.error || "Could not start sign-in.");
        return;
      }
      await afterAssertion(await webauthnGet(begin.optionsJSON));
    } catch (err) {
      assertionError(err);
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
      const res = await loginTotp({ totpCode });
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
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) {
      setError(wordsErr);
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
    <div className={`${instrumentSans.className} heroui-scope bg-background flex min-h-screen`}>
      <DarkAuthColumn
        title={TITLES[phase].title}
        subtitle={TITLES[phase].subtitle}
        footer={
          <>
            <span className="block">
              Lost your device?{" "}
              <Link href="/recover" className="text-foreground font-semibold hover:underline">
                Recover your account
              </Link>
            </span>
            <span className="block mt-1">
              No account?{" "}
              <Link href="/signup" className="text-foreground font-semibold hover:underline">
                Create one
              </Link>
            </span>
            {legacyLoginAvailable() && (
              <span className="block mt-1">
                Signed up back when we had passwords?{" "}
                <Link href="/login/legacy" className="text-foreground font-semibold hover:underline">
                  Move to passkeys
                </Link>
              </span>
            )}
          </>
        }
      >
        {phase === "totp" && (
          <form onSubmit={onTotp} className="space-y-4">
            <p className="text-sm text-muted leading-[1.6] m-0">
              {totpReason === "always-on"
                ? "You've asked for a code on every sign-in. Enter the one from your authenticator app."
                : "This passkey was added after signup, so it also needs a code from your authenticator app."}
            </p>
            <InputGroup fullWidth>
              <InputGroup.Input
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
            </InputGroup>
            {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
            <Button type="submit" variant="primary" size="lg" isDisabled={busy || totpCode.length !== 6} fullWidth>
              {busy ? "Checking…" : "Verify & sign in"}
            </Button>
          </form>
        )}

        {phase === "words" && (
          <form onSubmit={onWords} className="space-y-4">
            <p className="text-sm text-muted leading-[1.6] m-0">
              You&apos;re signed in, but this browser couldn&apos;t unlock your encrypted mail
              with the passkey alone. Enter your 12 recovery words once to unlock it here.
            </p>
            <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
            {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
            <Button type="submit" variant="primary" size="lg" isDisabled={busy} fullWidth>
              {busy ? "Unlocking…" : "Unlock mail"}
            </Button>
          </form>
        )}

        {phase === "idle" && (
          <>
            <Button variant="primary" size="lg" onPress={onPasskey} isDisabled={busy} fullWidth>
              <MIcon name="passkey" size={18} style={{ marginRight: 8 }} />
              {busy ? "Waiting for your device…" : "Sign in with passkey"}
            </Button>
            {error && <AlertMessage tone="error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</AlertMessage>}
            <FirefoxNote />

            {showDevice ? (
              <form onSubmit={onDevice} className="mt-4 space-y-3">
                <p className="text-sm text-muted leading-[1.6] m-0">
                  Enter your username and we&apos;ll offer your phone (via QR code) or your
                  security key. Your browser can&apos;t find a passkey that lives on another
                  device on its own.
                </p>
                <InputGroup fullWidth>
                  <InputGroup.Prefix>
                    <MIcon name="person" size={16} />
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    placeholder="Username"
                    value={deviceUser}
                    onChange={(e) => setDeviceUser(e.target.value.trim().toLowerCase())}
                    autoComplete="username webauthn"
                    autoCapitalize="none"
                    required
                  />
                </InputGroup>
                <Button type="submit" variant="primary" size="lg" isDisabled={busy || !deviceUser} fullWidth>
                  {busy ? "Waiting for your device…" : "Continue"}
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => { setShowDevice(true); setError(null); }}
                className="mt-4 block bg-transparent border-0 p-0 text-sm text-muted underline cursor-pointer hover:text-foreground"
              >
                Passkey on your phone or a security key?
              </button>
            )}

            <PasskeyHelp />
          </>
        )}
      </DarkAuthColumn>
    </div>
  );
}

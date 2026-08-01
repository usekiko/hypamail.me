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
import { ShineButton } from "@/components/ui/shine-button";
import { SecondaryLink } from "@/components/ui/link-button";
import { TextInput } from "@/components/ui/text-input";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import { AuthColumn, AuthPanel } from "@/components/auth-panel";
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
          ? "This device already has a passkey for your account. Just continue to your inbox."
          : err instanceof DOMException && err.name === "NotAllowedError"
            ? "Passkey creation was cancelled."
            : "This browser couldn't create a passkey. You can still continue to your inbox."
      );
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      Remembered a device?{" "}
      <Link href="/login" className="text-[#f7f8f8] font-semibold hover:underline">
        Back to sign in
      </Link>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#151515]">
      {recovered ? (
        <AuthColumn
          title="You're back in"
          subtitle="Add a passkey on this device so next time is one tap."
          footer={footer}
        >
          <p className="text-[13px] text-[#898e97] leading-[1.6] m-0 mb-5">
            Enter a fresh code from your authenticator to confirm (this passkey will be a
            secondary one, so signing in with it will also ask for a code).
          </p>
          <form onSubmit={onAddPasskey} className="space-y-4">
            <TextInput
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="Authenticator code"
              autoComplete="one-time-code"
              value={addTotp}
              onChange={(e) => setAddTotp(e.target.value.replace(/\D/g, ""))}
              required
              fullWidth
              leading={<MIcon name="pin" size={16} />}
              style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em" }}
            />
            <ShineButton type="submit" disabled={busy || addTotp.length !== 6} fullWidth>
              {busy ? "Waiting for your device…" : "Add a passkey on this device"}
            </ShineButton>
          </form>
          <SecondaryLink href="/mail" fullWidth style={{ marginTop: "0.75rem" }}>
            Skip, go to inbox
          </SecondaryLink>
          {error && <AlertMessage tone="error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</AlertMessage>}
          <PasskeyHelp />
        </AuthColumn>
      ) : (
        <AuthColumn
          title="Account recovery"
          subtitle="Lost your device? Sign in with your username, your 12 recovery words, and a code from your authenticator app."
          footer={footer}
        >
          <form onSubmit={onRecover} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1" htmlFor="username">
                Username
              </label>
              <TextInput
                id="username"
                name="username"
                placeholder="you"
                autoComplete="username"
                autoCapitalize="none"
                required
                fullWidth
                leading={<MIcon name="person" size={16} />}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1">
                Recovery code (12 words)
              </label>
              <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1" htmlFor="totp">
                Authenticator code
              </label>
              <TextInput
                id="totp"
                name="totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                autoComplete="one-time-code"
                required
                fullWidth
                style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", textAlign: "center" }}
              />
            </div>
            {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
            <ShineButton type="submit" disabled={busy} fullWidth>
              {busy ? "Checking…" : "Recover account"}
            </ShineButton>
          </form>
        </AuthColumn>
      )}
      <AuthPanel />
    </div>
  );
}

"use client";

// Account recovery: username + 12 recovery words, plus a code if the account
// enrolled an authenticator. The words never leave the browser — only a derived
// auth key does, split off by HKDF with a different context than the unwrap key,
// so the server's verifier can't decrypt anything. Afterwards we offer to add a
// passkey for this device, reusing the proof the user just gave.
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
import { Instrument_Sans } from "next/font/google";
import { Button, InputGroup, buttonVariants } from "@heroui/react";
import { Alert } from "../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import { DarkAuthColumn } from "../ui/DarkAuthShell";
import PasskeyHelp from "../ui/PasskeyHelp";
import RecoveryWordsInput from "../ui/RecoveryWordsInput";
import "../heroui.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
      <Link href="/login" className="text-foreground font-semibold hover:underline">
        Back to log in
      </Link>
    </>
  );

  return (
    <div className={`${instrumentSans.className} heroui-scope bg-background flex min-h-screen`}>
      {recovered ? (
        <DarkAuthColumn
          title="You're back in"
          subtitle="Add a passkey on this device so next time is one tap."
          footer={footer}
        >
          <p className="text-sm text-muted leading-[1.6] m-0 mb-5">
            Enter a fresh code from your authenticator to confirm (this passkey will be a
            secondary one, so logging in with it will also ask for a code).
          </p>
          <form onSubmit={onAddPasskey} className="space-y-4">
            <InputGroup fullWidth>
              <InputGroup.Prefix>
                <MIcon name="pin" size={16} />
              </InputGroup.Prefix>
              <InputGroup.Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="Authenticator code"
                autoComplete="one-time-code"
                value={addTotp}
                onChange={(e) => setAddTotp(e.target.value.replace(/\D/g, ""))}
                required
                style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em" }}
              />
            </InputGroup>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isDisabled={busy || addTotp.length !== 6}
              fullWidth
            >
              {busy ? "Waiting for your device…" : "Add a passkey on this device"}
            </Button>
          </form>
          <Link
            href="/mail"
            className={`${buttonVariants({ variant: "outline", size: "lg" })} mt-3 w-full`}
          >
            Skip, go to inbox
          </Link>
          {error && <Alert tone="error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</Alert>}
          <PasskeyHelp />
        </DarkAuthColumn>
      ) : (
        <DarkAuthColumn
          title="Account recovery"
          subtitle="Lost your device? Log in with your username, your 12 recovery words, and a code from your authenticator app."
          footer={footer}
        >
          <form onSubmit={onRecover} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2 pl-1" htmlFor="username">
                Username
              </label>
              <InputGroup fullWidth>
                <InputGroup.Prefix>
                  <MIcon name="person" size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id="username"
                  name="username"
                  placeholder="you"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                />
              </InputGroup>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2 pl-1">
                Recovery code (12 words)
              </label>
              <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2 pl-1" htmlFor="totp">
                Authenticator code <span className="text-muted">(if you set one up)</span>
              </label>
              {/* Not required: accounts that skipped the authenticator have no code
                  to give, and the field is always shown so a blank submission can't
                  reveal whether this account enrolled one. */}
              <InputGroup fullWidth>
                <InputGroup.Input
                  id="totp"
                  name="totp"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", textAlign: "center" }}
                />
              </InputGroup>
            </div>
            {error && <Alert tone="error" style={{ marginBottom: 0 }}>{error}</Alert>}
            <Button type="submit" variant="primary" size="lg" isDisabled={busy} fullWidth>
              {busy ? "Checking…" : "Recover account"}
            </Button>
          </form>
        </DarkAuthColumn>
      )}
    </div>
  );
}

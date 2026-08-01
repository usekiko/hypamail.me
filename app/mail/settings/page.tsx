"use client";

// Passkey management. Adding or removing a passkey always requires the recovery
// code + a TOTP code (even though you're signed in), so a stolen session can't
// enroll or strip a device. Max 3 passkeys. The original (signup) passkey is
// permanent: it's the only one that logs in with a single tap, so it can't be
// removed; the rest also ask for a TOTP code at login.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  listPasskeys,
  addPasskeyBegin,
  addPasskeyComplete,
  removePasskey,
  setLoginTotpRequired,
} from "../../actions";
import {
  deriveRecoveryAuthKey,
  unwrapWithRecovery,
  webauthnCreate,
  wrapWithPrf,
  recoveryWordsError,
  loadMailKey,
} from "@/lib/client/crypto";
import PasskeysCard from "./PasskeysCard";
import TwoFactorCard from "./TwoFactorCard";
import type { GateState, Mode, Passkey } from "./types";

export default function SettingsPage() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [max, setMax] = useState(3);
  const [requireTotp, setRequireTotp] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [words, setWords] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await listPasskeys();
    if (res.passkeys) {
      setPasskeys(res.passkeys);
      if (res.max) setMax(res.max);
      setRequireTotp(!!res.requireTotpOnLogin);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function resetForm(next: Mode) {
    setMode(next);
    setWords("");
    setTotpCode("");
    setError(null);
    setNotice(null);
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) {
      setError(wordsErr);
      return;
    }
    setBusy(true);
    try {
      const recoveryAuthKey = await deriveRecoveryAuthKey(words);
      const begin = await addPasskeyBegin({ recoveryAuthKey, totpCode });
      if (begin.error || !begin.optionsJSON || !begin.wrappedKeyRecovery) {
        setError(begin.error || "Could not start passkey setup.");
        return;
      }
      const created = await webauthnCreate(begin.optionsJSON);
      // The new passkey needs its own PRF-wrapped copy of the mail key. Unwrap
      // the source key from the recovery blob with the words just entered
      // (falling back to the already-unlocked key if present).
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
      if (!res.ok) {
        setError(res.error || "Could not save the passkey.");
        return;
      }
      await reload();
      resetForm({ kind: "view" });
      setNotice("Passkey added. Signing in with it will also ask for a code from your authenticator.");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "InvalidStateError"
          ? "This device already has a passkey for your account."
          : err instanceof DOMException && err.name === "NotAllowedError"
            ? "Passkey creation was cancelled."
            : "This browser couldn't create a passkey. See the help below."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode.kind !== "remove") return;
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) {
      setError(wordsErr);
      return;
    }
    setBusy(true);
    try {
      const recoveryAuthKey = await deriveRecoveryAuthKey(words);
      const res = await removePasskey({ recoveryAuthKey, totpCode, credentialId: mode.id });
      if (!res.ok) {
        setError(res.error || "Could not remove the passkey.");
        return;
      }
      await reload();
      resetForm({ kind: "view" });
      setNotice("Passkey removed.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode.kind !== "totp-on" && mode.kind !== "totp-off") return;
    const enable = mode.kind === "totp-on";
    setError(null);
    if (!enable) {
      const wordsErr = recoveryWordsError(words);
      if (wordsErr) {
        setError(wordsErr);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await setLoginTotpRequired({
        enable,
        totpCode,
        recoveryAuthKey: enable ? undefined : await deriveRecoveryAuthKey(words),
      });
      if (!res.ok) {
        setError(res.error || "Could not change the setting.");
        return;
      }
      await reload();
      resetForm({ kind: "view" });
      setNotice(
        enable
          ? "Every sign-in will now ask for an authenticator code."
          : "Your original passkey signs you in with one tap again."
      );
    } finally {
      setBusy(false);
    }
  }

  const gate: GateState = {
    words,
    setWords,
    totpCode,
    setTotpCode,
    busy,
    error,
    onCancel: () => resetForm({ kind: "view" }),
  };

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="m-0 text-[1.1rem] font-semibold tracking-tight">Settings</h1>
        <Link href="/mail" className="text-[13px] text-muted">
          Back to inbox
        </Link>
      </div>

      <PasskeysCard
        passkeys={passkeys}
        max={max}
        mode={mode}
        notice={notice}
        gate={gate}
        onModeChange={resetForm}
        onAdd={onAdd}
        onRemove={onRemove}
      />

      <TwoFactorCard
        passkeys={passkeys}
        requireTotp={requireTotp}
        mode={mode}
        gate={gate}
        onModeChange={resetForm}
        onToggle={onToggleTotp}
      />
    </div>
  );
}

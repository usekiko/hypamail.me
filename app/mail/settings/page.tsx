"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listPasskeys, setLoginTotpRequired } from "../../actions";
import { deriveRecoveryAuthKey, recoveryWordsError } from "@/lib/client/crypto";
import AuthenticatorCard from "./AuthenticatorCard";
import PasskeysCard from "./PasskeysCard";
import PasswordCard from "./PasswordCard";
import TwoFactorCard from "./TwoFactorCard";
import { addPasskey, deletePasskey } from "./passkeyActions";
import type { GateState, Mode, Passkey } from "./types";

export default function SettingsPage() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [max, setMax] = useState(3);
  const [requireTotp, setRequireTotp] = useState(false);
  const [hasTotp, setHasTotp] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
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
      setHasTotp(!!res.hasTotp);
      setHasPassword(!!res.hasPassword);
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

  // Every passkey change runs the same shape: validate the words, do the work,
  // then either show the error or reload and close.
  async function run(
    e: React.FormEvent<HTMLFormElement>,
    work: () => Promise<string | null>,
    done: string
  ) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) return setError(wordsErr);
    setBusy(true);
    try {
      const err = await work();
      if (err) return setError(err);
      await reload();
      resetForm({ kind: "view" });
      setNotice(done);
    } finally {
      setBusy(false);
    }
  }

  const onAdd = (e: React.FormEvent<HTMLFormElement>) =>
    run(
      e,
      () => addPasskey(words, totpCode),
      hasTotp
        ? "Passkey added. Signing in with it will also ask for a code from your authenticator."
        : "Passkey added."
    );

  const onRemove = (e: React.FormEvent<HTMLFormElement>) =>
    run(
      e,
      () =>
        mode.kind === "remove"
          ? deletePasskey(words, totpCode, mode.id)
          : Promise.resolve("Nothing selected to remove."),
      "Passkey removed."
    );

  const onToggleTotp = (e: React.FormEvent<HTMLFormElement>) => {
    const enable = mode.kind === "totp-on";
    e.preventDefault();
    setError(null);
    // Turning it on is gated on a live code alone, so the words aren't needed.
    if (!enable) {
      const wordsErr = recoveryWordsError(words);
      if (wordsErr) return setError(wordsErr);
    }
    setBusy(true);
    void (async () => {
      try {
        const res = await setLoginTotpRequired({
          enable,
          totpCode,
          recoveryAuthKey: enable ? undefined : await deriveRecoveryAuthKey(words),
        });
        if (!res.ok) return setError(res.error || "Could not change the setting.");
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
    })();
  };

  const gate: GateState = {
    words,
    setWords,
    totpCode,
    setTotpCode,
    hasTotp,
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

      <AuthenticatorCard hasTotp={hasTotp} onChanged={reload} />

      {/* Only meaningful once there's an authenticator to ask for a code from. */}
      {hasTotp && (
        <TwoFactorCard
          passkeys={passkeys}
          requireTotp={requireTotp}
          mode={mode}
          gate={gate}
          onModeChange={resetForm}
          onToggle={onToggleTotp}
        />
      )}

      <PasswordCard hasPassword={hasPassword} hasTotp={hasTotp} onChanged={reload} />
    </div>
  );
}

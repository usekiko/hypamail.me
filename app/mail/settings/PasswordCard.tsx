"use client";

// The optional password. Setting one re-wraps the mail key under it locally —
// the password itself never leaves the browser, same as at signup.
import { useState } from "react";
import { Button, Card, Chip, InputGroup } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import GateForm from "./GateForm";
import { useGate } from "./useGate";
import { ROW_CLASS } from "./types";
import { setAccountPassword, removeAccountPassword, getWrappedKeys } from "../../actions";
import {
  deriveRecoveryAuthKey,
  derivePasswordAuthKey,
  generatePasswordSalt,
  loadMailKey,
  passwordError,
  recoveryWordsError,
  unwrapWithRecovery,
  wrapWithPassword,
  PASSWORD_MIN_LENGTH,
} from "@/lib/client/crypto";

type Mode = "view" | "set" | "remove";

export default function PasswordCard({
  hasPassword,
  hasTotp,
  onChanged,
}: {
  hasPassword: boolean;
  hasTotp: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const close = () => {
    setMode("view");
    setPassword("");
    setPassword2("");
  };
  const { gate, words, totpCode, busy, setBusy, setError, clear } = useGate(hasTotp, close);

  async function onSet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) return setError(wordsErr);
    const pwErr = passwordError(password);
    if (pwErr) return setError(pwErr);
    if (password !== password2) return setError("The two passwords don't match.");

    setBusy(true);
    try {
      // The mail key has to be in hand to re-wrap it. A fresh tab won't have it
      // unlocked, so fall back to the recovery blob and the words just typed.
      let privateKey = loadMailKey();
      if (!privateKey) {
        const keys = await getWrappedKeys();
        if (!keys.wrappedKeyRecovery) return setError("Couldn't load your key. Sign in again.");
        privateKey = await unwrapWithRecovery(words, keys.wrappedKeyRecovery);
      }
      const salt = generatePasswordSalt();
      const res = await setAccountPassword({
        recoveryAuthKey: await deriveRecoveryAuthKey(words),
        totpCode,
        salt,
        passwordAuthKey: await derivePasswordAuthKey(password, salt),
        wrappedKeyPassword: await wrapWithPassword(password, salt, privateKey),
      });
      if (!res.ok) return setError(res.error || "Could not save the password.");
      clear();
      close();
      onChanged();
      setNotice(hasPassword ? "Password changed." : "Password set. You can now sign in with it.");
    } catch {
      setError("That recovery code didn't unlock your key. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) return setError(wordsErr);
    setBusy(true);
    try {
      const res = await removeAccountPassword({
        recoveryAuthKey: await deriveRecoveryAuthKey(words),
        totpCode,
      });
      if (!res.ok) return setError(res.error || "Could not remove the password.");
      clear();
      close();
      onChanged();
      setNotice("Password removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-3">
      <Card.Content>
        <b className="text-sm">Password</b>
        <p className="mt-2 mb-4 text-[13px] leading-relaxed text-muted">
          Optional, and useful on a device that can&apos;t hold a passkey. It never reaches us: your
          browser stretches it and uses the result to lock your mail key, so we still can&apos;t read
          your mail. Setting or changing it needs your recovery code.
        </p>

        {notice && <Alert tone="success">{notice}</Alert>}

        <div className={ROW_CLASS}>
          <div className="flex items-center gap-2 text-[13px]">
            <MIcon name="lock" size={14} />
            Password sign-in
            <Chip color={hasPassword ? "success" : "default"} size="sm">
              <Chip.Label>{hasPassword ? "set" : "not set"}</Chip.Label>
            </Chip>
          </div>
          {mode === "view" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onPress={() => setMode("set")}>
                {hasPassword ? "Change" : "Set a password"}
              </Button>
              {hasPassword && (
                <Button variant="ghost" size="sm" onPress={() => setMode("remove")}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>

        {mode === "set" && (
          <GateForm
            gate={gate}
            onSubmit={onSet}
            submitLabel={hasPassword ? "Change password" : "Set password"}
            disabled={!password || !password2}
          >
            <InputGroup fullWidth>
              <InputGroup.Prefix>
                <MIcon name="lock" size={16} />
              </InputGroup.Prefix>
              <InputGroup.Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                placeholder={`New password, at least ${PASSWORD_MIN_LENGTH} characters`}
                autoComplete="new-password"
              />
            </InputGroup>
            <InputGroup fullWidth>
              <InputGroup.Prefix>
                <MIcon name="lock" size={16} />
              </InputGroup.Prefix>
              <InputGroup.Input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                disabled={busy}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </InputGroup>
          </GateForm>
        )}

        {mode === "remove" && (
          <div className="mt-3 rounded-lg border border-danger/30 p-3">
            <div className="text-[13px] text-danger">
              Remove the password? You&apos;ll sign in with a passkey or your recovery code.
            </div>
            <GateForm gate={gate} onSubmit={onRemove} submitLabel="Remove password" danger />
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

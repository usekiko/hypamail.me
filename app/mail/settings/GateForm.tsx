"use client";

// The recovery-code + authenticator gate in front of every passkey change.
// NOTE: module scope, NOT nested inside SettingsPage. A component declared
// inside another component gets a new identity on every render, so React would
// unmount/remount these inputs on each keystroke and they'd lose focus after a
// single character.
import { Button, InputGroup } from "@heroui/react";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import RecoveryWordsInput from "../../ui/RecoveryWordsInput";
import type { GateState } from "./types";

export function TotpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
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
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        required
        style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em" }}
      />
    </InputGroup>
  );
}

export default function GateForm({
  gate,
  onSubmit,
  submitLabel,
  danger,
}: {
  gate: GateState;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  danger?: boolean;
}) {
  const { words, setWords, totpCode, setTotpCode, busy, error, onCancel } = gate;
  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        For your security this needs your recovery code and an authenticator code.
      </p>
      <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
      <TotpInput value={totpCode} onChange={setTotpCode} disabled={busy} />
      {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant={danger ? "danger" : "primary"}
          isDisabled={busy || totpCode.length !== 6 || !words.trim()}
        >
          {busy ? "Working…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

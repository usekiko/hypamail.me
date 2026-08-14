"use client";

// The recovery-code (+ authenticator) gate in front of every credential change.
// Module scope, NOT nested in SettingsPage — a component declared inside another
// gets a fresh identity every render, so these inputs would remount and lose
// focus after each keystroke.
import { Button, InputGroup } from "@heroui/react";
import { Alert } from "../../ui/Alert";
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
  disabled,
  children,
}: {
  gate: GateState;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  danger?: boolean;
  disabled?: boolean; // extra condition from whatever the caller put in children
  children?: React.ReactNode;
}) {
  const { words, setWords, totpCode, setTotpCode, hasTotp, busy, error, onCancel } = gate;
  const incomplete = !words.trim() || (hasTotp && totpCode.length !== 6);
  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        For your security this needs your recovery code
        {hasTotp ? " and an authenticator code." : "."}
      </p>
      <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
      {hasTotp && <TotpInput value={totpCode} onChange={setTotpCode} disabled={busy} />}
      {children}
      {error && <Alert tone="error" style={{ marginBottom: 0 }}>{error}</Alert>}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant={danger ? "danger" : "primary"}
          isDisabled={busy || incomplete || disabled}
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

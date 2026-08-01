"use client";

import { Button, Card, Chip } from "@heroui/react";
import { AlertMessage } from "@/components/ui/alert-message";
import GateForm, { TotpInput } from "./GateForm";
import { ROW_CLASS, type GateState, type Mode, type Passkey } from "./types";

export default function TwoFactorCard({
  passkeys,
  requireTotp,
  mode,
  gate,
  onModeChange,
  onToggle,
}: {
  passkeys: Passkey[] | null;
  requireTotp: boolean;
  mode: Mode;
  gate: GateState;
  onModeChange: (next: Mode) => void;
  onToggle: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const { totpCode, setTotpCode, busy, error, onCancel } = gate;

  return (
    <Card className="mt-3">
      <Card.Content>
        <b className="text-sm">Two-factor on sign-in</b>
        <p className="mt-2 mb-4 text-[13px] leading-relaxed text-muted">
          A passkey already counts as two factors: the device plus your fingerprint, face or PIN.
          So by default your original passkey signs you in with one tap. Turn this on to also
          require a code from your authenticator app every single time. Passkeys you added later
          always ask for a code, whatever this is set to.
        </p>

        {passkeys === null ? (
          <div className="text-[13px] text-muted">Loading…</div>
        ) : (
          <div className={ROW_CLASS}>
            <div>
              <div className="flex items-center gap-2 text-[13px]">
                Ask for a code on every sign-in
                <Chip color={requireTotp ? "success" : "default"} size="sm">
                  <Chip.Label>{requireTotp ? "on" : "off"}</Chip.Label>
                </Chip>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {requireTotp
                  ? "Your original passkey also asks for an authenticator code."
                  : "Your original passkey signs you in with one tap."}
              </div>
            </div>
            {mode.kind === "totp-on" || mode.kind === "totp-off" ? null : (
              <Button
                variant="outline"
                size="sm"
                onPress={() => onModeChange({ kind: requireTotp ? "totp-off" : "totp-on" })}
              >
                {requireTotp ? "Turn off" : "Turn on"}
              </Button>
            )}
          </div>
        )}

        {/* Turning the requirement ON only needs a live TOTP code (proves the app
            works so you can't lock yourself out); turning it OFF needs the full gate. */}
        {mode.kind === "totp-on" && (
          <form onSubmit={onToggle} className="mt-3 flex flex-col gap-3">
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              Enter a code from your authenticator to confirm it works. Otherwise turning this on
              could lock you out of every future sign-in.
            </p>
            <TotpInput value={totpCode} onChange={setTotpCode} disabled={busy} />
            {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" isDisabled={busy || totpCode.length !== 6}>
                {busy ? "Working…" : "Turn on"}
              </Button>
              <Button type="button" variant="outline" onPress={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode.kind === "totp-off" && (
          <GateForm gate={gate} onSubmit={onToggle} submitLabel="Turn off" danger />
        )}
      </Card.Content>
    </Card>
  );
}

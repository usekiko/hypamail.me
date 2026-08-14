"use client";

import { Button, Chip } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import PasskeyHelp from "../../ui/PasskeyHelp";
import GateForm from "./GateForm";
import { ROW_CLASS, type GateState, type Mode, type Passkey } from "./types";

export default function PasskeysCard({
  passkeys,
  max,
  mode,
  notice,
  gate,
  onModeChange,
  onAdd,
  onRemove,
}: {
  passkeys: Passkey[] | null;
  max: number;
  mode: Mode;
  notice: string | null;
  gate: GateState;
  onModeChange: (next: Mode) => void;
  onAdd: (e: React.FormEvent<HTMLFormElement>) => void;
  onRemove: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const atMax = passkeys !== null && passkeys.length >= max;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <b className="text-sm">Passkeys</b>
        <span className="text-xs text-muted">{passkeys ? `${passkeys.length} / ${max}` : ""}</span>
      </div>
      <p className="mt-0 mb-4 text-[13px] leading-relaxed text-muted">
        Your <b className="text-foreground">original</b> passkey signs you in with one tap and is
        permanent. Passkeys you add here can be removed
        {gate.hasTotp && ", and ask for an authenticator code when signing in"}. Adding or
        removing one always needs your recovery code
        {gate.hasTotp ? " + authenticator code." : "."}
      </p>

      {notice && <Alert tone="success">{notice}</Alert>}

      {passkeys === null ? (
        <div className="text-[13px] text-muted">Loading…</div>
      ) : (
        <div className="flex flex-col gap-2">
          {passkeys.map((p, i) => (
            <div key={p.id} className={ROW_CLASS}>
              <div>
                <div className="flex items-center gap-2 text-[13px]">
                  <MIcon name="passkey" size={14} />
                  {p.isOriginal ? "Original passkey" : p.nickname || `Passkey ${i + 1}`}
                  {p.isOriginal && (
                    <Chip color="success" size="sm">
                      <Chip.Label>one-tap</Chip.Label>
                    </Chip>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  added {new Date(p.createdAt).toLocaleDateString()}
                  {p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : " · not used yet"}
                </div>
              </div>
              {/* The original passkey is permanent and has no remove button. */}
              {p.isOriginal ? (
                <span className="text-[11px] text-muted">permanent</span>
              ) : mode.kind === "remove" && mode.id === p.id ? null : (
                <Button variant="ghost" size="sm" onPress={() => onModeChange({ kind: "remove", id: p.id })}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {mode.kind === "remove" && (
        <div className="mt-3 rounded-lg border border-danger/30 p-3">
          <div className="text-[13px] text-danger">Remove this passkey?</div>
          <GateForm gate={gate} onSubmit={onRemove} submitLabel="Remove passkey" danger />
        </div>
      )}

      {mode.kind === "add" && (
        <div className="mt-3">
          <Alert
            tone="info"
            icon={<MIcon name="info" size={16} style={{ flexShrink: 0, marginRight: 8, marginTop: 2 }} />}
            style={{ fontSize: 12 }}
          >
            Adding a passkey <b>won&apos;t reset your recovery code</b>
            {gate.hasTotp && <> or your authenticator</>}. Nothing changes — you&apos;re only
            entering it here to prove it&apos;s you.
          </Alert>
          <GateForm gate={gate} onSubmit={onAdd} submitLabel="Create passkey" />
        </div>
      )}

      {mode.kind === "view" && (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onPress={() => onModeChange({ kind: "add" })} isDisabled={atMax}>
            <MIcon name="add" size={16} style={{ marginRight: 6 }} />
            Add a passkey
          </Button>
          {atMax && (
            <span className="text-xs text-muted">
              You&apos;ve reached the maximum of {max}. Remove one to add another.
            </span>
          )}
        </div>
      )}

      <PasskeyHelp />
    </section>
  );
}

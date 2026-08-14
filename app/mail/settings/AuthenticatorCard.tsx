"use client";

import { useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import AuthenticatorSetup from "./AuthenticatorSetup";
import GateForm from "./GateForm";
import { useGate } from "./useGate";
import { ROW_CLASS } from "./types";
import { removeTotp } from "../../actions";
import { deriveRecoveryAuthKey, recoveryWordsError } from "@/lib/client/crypto";

type Mode = "view" | "setup" | "remove";

export default function AuthenticatorCard({
  hasTotp,
  onChanged,
}: {
  hasTotp: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setMode("view");
  const { gate, words, totpCode, setBusy, setError, clear } = useGate(hasTotp, close);

  async function onRemove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) return setError(wordsErr);
    setBusy(true);
    try {
      const res = await removeTotp({
        recoveryAuthKey: await deriveRecoveryAuthKey(words),
        totpCode,
      });
      if (!res.ok) return setError(res.error || "Could not remove the authenticator.");
      clear();
      close();
      onChanged();
      setNotice("Authenticator removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-3">
      <Card.Content>
        <b className="text-sm">Authenticator app</b>
        <p className="mt-2 mb-4 text-[13px] leading-relaxed text-muted">
          A six-digit code from an app like Aegis, Ente Auth or 1Password. Optional — a passkey
          already proves both the device and you. It&apos;s asked for on password sign-in, on
          recovery, and on any passkey you added after signup.
        </p>

        {notice && <Alert tone="success">{notice}</Alert>}

        <div className={ROW_CLASS}>
          <div className="flex items-center gap-2 text-[13px]">
            <MIcon name="pin" size={14} />
            Authenticator
            <Chip color={hasTotp ? "success" : "default"} size="sm">
              <Chip.Label>{hasTotp ? "set up" : "not set up"}</Chip.Label>
            </Chip>
          </div>
          {mode === "view" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onPress={() => setMode("setup")}>
                {hasTotp ? "Replace" : "Set up"}
              </Button>
              {hasTotp && (
                <Button variant="ghost" size="sm" onPress={() => setMode("remove")}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>

        {mode === "setup" && (
          <AuthenticatorSetup
            hasTotp={hasTotp}
            onCancel={close}
            onDone={(message) => {
              close();
              onChanged();
              setNotice(message);
            }}
          />
        )}

        {mode === "remove" && (
          <div className="mt-3 rounded-lg border border-danger/30 p-3">
            <div className="text-[13px] text-danger">
              Remove the authenticator? Recovery and password sign-in will stop asking for a code.
            </div>
            <GateForm gate={gate} onSubmit={onRemove} submitLabel="Remove authenticator" danger />
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

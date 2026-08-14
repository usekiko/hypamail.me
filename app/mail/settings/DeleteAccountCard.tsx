"use client";

import { useState } from "react";
import { Button, Card, InputGroup } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import GateForm from "./GateForm";
import { useGate } from "./useGate";
import { deleteAccountForever } from "../../actions";
import { clearMailKey, deriveRecoveryAuthKey, recoveryWordsError } from "@/lib/client/crypto";

export default function DeleteAccountCard({
  username,
  hasTotp,
}: {
  username: string | null;
  hasTotp: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const close = () => {
    setOpen(false);
    setConfirm("");
  };
  const { gate, words, totpCode, busy, setBusy, setError } = useGate(hasTotp, close);

  async function onDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) return setError(wordsErr);
    setBusy(true);
    try {
      const res = await deleteAccountForever({
        recoveryAuthKey: await deriveRecoveryAuthKey(words),
        totpCode,
        confirmUsername: confirm,
      });
      if (!res.ok) {
        setError(res.error || "Could not delete the account.");
        return;
      }
      // The session is already revoked server-side; drop the unlocked mail key
      // before leaving so it can't linger in this tab.
      clearMailKey();
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-3 border-danger/40">
      <Card.Content>
        <b className="text-sm text-danger">Delete account</b>
        <p className="mt-2 mb-4 text-[13px] leading-relaxed text-muted">
          Deletes the mailbox and every message in it, your passkeys, and your account record.
          There is no undo and no backup to restore from — your mail is encrypted with a key only
          you hold, so even we can&apos;t recover it afterwards. Export your data first if you want
          a copy. Your address is retired permanently: nobody can ever register it again, including
          you, so mail still being sent to it can&apos;t end up in someone else&apos;s inbox.
        </p>

        {!open ? (
          <Button variant="danger" onPress={() => setOpen(true)}>
            <MIcon name="delete_forever" size={16} style={{ marginRight: 6 }} />
            Delete my account
          </Button>
        ) : (
          <>
            <Alert tone="error" style={{ marginBottom: 0 }}>
              This permanently deletes everything. Type your username below to confirm.
            </Alert>
            <GateForm
              gate={gate}
              onSubmit={onDelete}
              submitLabel="Delete permanently"
              danger
              disabled={!confirm.trim()}
            >
              <InputGroup fullWidth>
                <InputGroup.Prefix>
                  <MIcon name="person" size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                  placeholder={username ? `Type "${username}" to confirm` : "Type your username"}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </InputGroup>
            </GateForm>
          </>
        )}
      </Card.Content>
    </Card>
  );
}

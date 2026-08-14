"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import GateForm from "./GateForm";
import { useGate } from "./useGate";
import { exportAccountData } from "../../actions";
import { deriveRecoveryAuthKey, recoveryWordsError } from "@/lib/client/crypto";

// The file is built here from the string the action returns, so it never exists
// as a URL anyone could be tricked into fetching.
function download(filename: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportCard({ hasTotp }: { hasTotp: boolean }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { gate, words, totpCode, setBusy, setError, clear } = useGate(hasTotp, () => setOpen(false));

  async function onExport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) return setError(wordsErr);
    setBusy(true);
    try {
      const res = await exportAccountData({
        recoveryAuthKey: await deriveRecoveryAuthKey(words),
        totpCode,
      });
      if (!res.json || !res.filename) return setError(res.error || "Could not build the export.");
      download(res.filename, res.json);
      clear();
      setOpen(false);
      setNotice("Export downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border-t border-border pt-8">
      <b className="text-sm">Your data</b>
      <p className="mt-2 mb-4 text-[13px] leading-relaxed text-muted">
        Download everything our database holds about this account as JSON. Your messages
        aren&apos;t in it — they&apos;re stored encrypted and we can&apos;t read them, so use your
        mail client to keep those. The internal mailbox password and your authenticator secret
        are left out too, since both are live credentials.
      </p>

      {notice && <Alert tone="success">{notice}</Alert>}

      {!open ? (
        <Button variant="outline" onPress={() => setOpen(true)}>
          <MIcon name="download" size={16} style={{ marginRight: 6 }} />
          Export my data
        </Button>
      ) : (
        <GateForm gate={gate} onSubmit={onExport} submitLabel="Download JSON" />
      )}
    </section>
  );
}

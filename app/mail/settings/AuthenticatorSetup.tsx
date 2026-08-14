"use client";

// Enrolling (or replacing) the authenticator app. Two steps: prove it's you,
// then prove the app works. Nothing is saved until the second one succeeds.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import GateForm, { TotpInput } from "./GateForm";
import { useGate } from "./useGate";
import { enrollTotpBegin, enrollTotpComplete } from "../../actions";
import { deriveRecoveryAuthKey, recoveryWordsError } from "@/lib/client/crypto";

export default function AuthenticatorSetup({
  hasTotp,
  onDone,
  onCancel,
}: {
  hasTotp: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState<{ uri: string; secret: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const { gate, words, totpCode, busy, setBusy, setError } = useGate(hasTotp, onCancel);

  useEffect(() => {
    if (pending && qrRef.current) {
      QRCode.toCanvas(qrRef.current, pending.uri, { width: 190, margin: 2 }).catch(() => {});
    }
  }, [pending]);

  async function onBegin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) return setError(wordsErr);
    setBusy(true);
    try {
      const res = await enrollTotpBegin({
        recoveryAuthKey: await deriveRecoveryAuthKey(words),
        totpCode,
      });
      if (!res.totpUri || !res.totpSecret) return setError(res.error || "Could not start setup.");
      setPending({ uri: res.totpUri, secret: res.totpSecret });
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setConfirmError(null);
    setBusy(true);
    try {
      const res = await enrollTotpComplete({ totpCode: confirmCode });
      if (!res.ok) {
        setPending(null); // the ceremony is spent — a retry needs a fresh QR
        setConfirmCode("");
        setConfirmError(res.error || "Could not save the authenticator.");
        return;
      }
      onDone(
        hasTotp
          ? "Authenticator replaced. Use the new one from now on."
          : "Authenticator set up."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!pending) {
    return (
      <>
        {confirmError && <Alert tone="error">{confirmError}</Alert>}
        <GateForm gate={gate} onSubmit={onBegin} submitLabel="Continue" />
      </>
    );
  }

  return (
    <form onSubmit={onConfirm} className="mt-3 flex flex-col gap-3">
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Scan this with your authenticator app, then enter the code it shows.
      </p>
      <div className="w-fit rounded-lg bg-white p-2">
        <canvas ref={qrRef} className="block" />
      </div>
      <p className="m-0 text-[11px] leading-relaxed text-muted">
        Can&apos;t scan? Enter this key by hand:{" "}
        <code className="select-all text-foreground">{pending.secret}</code>
      </p>
      <TotpInput value={confirmCode} onChange={setConfirmCode} disabled={busy} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={busy || confirmCode.length !== 6}>
          {busy ? "Working…" : "Confirm"}
        </Button>
        <Button type="button" variant="outline" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

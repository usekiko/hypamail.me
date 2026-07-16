"use client";

// Minimal account settings: add a passkey on the current device. Useful after
// signing in on a new machine via QR-code cross-device auth or recovery words.
import Link from "next/link";
import { useState } from "react";
import { addPasskeyBegin, addPasskeyComplete } from "../../actions";
import { webauthnCreate, wrapWithPrf, loadMailKey } from "@/lib/client/crypto";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function onAdd() {
    setError(null);
    setBusy(true);
    try {
      const begin = await addPasskeyBegin();
      if (begin.error || !begin.optionsJSON) {
        setError(begin.error || "Could not start passkey setup.");
        return;
      }
      const created = await webauthnCreate(begin.optionsJSON);
      const mailKey = loadMailKey();
      const res = await addPasskeyComplete({
        attestation: created.responseJSON,
        prfCapable: created.prfEnabled,
        wrappedKeyPrf:
          created.prfOutput && mailKey ? await wrapWithPrf(created.prfOutput, mailKey) : null,
      });
      if (!res.ok) {
        setError(res.error || "Could not save the passkey.");
        return;
      }
      setAdded(true);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "InvalidStateError"
          ? "This device already has a passkey for your account."
          : err instanceof DOMException && err.name === "NotAllowedError"
            ? "Passkey creation was cancelled."
            : "This browser couldn't create a passkey."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
        <h1 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 700 }}>settings</h1>
        <Link href="/mail" style={{ color: "#878787", fontSize: "13px" }}>back to inbox</Link>
      </div>
      <div className="panel" style={{ padding: "16px" }}>
        <b style={{ fontSize: "14px" }}>Passkeys</b>
        <p style={{ color: "#878787", fontSize: "13px", margin: "0.5rem 0 1rem", lineHeight: 1.6 }}>
          Add a passkey on this device so signing in here is one tap. Your account can have
          any number of passkeys — one per device you use.
        </p>
        {added ? (
          <div style={{ color: "#7bb97b", fontSize: "13px" }}>Passkey added ✓</div>
        ) : (
          <button className="btn btn-primary" onClick={onAdd} disabled={busy} style={{ padding: "0.55rem 1.5rem" }}>
            {busy ? "Waiting for your device…" : "Add a passkey on this device"}
          </button>
        )}
        {error && <div style={{ color: "#e06a6a", fontSize: "13px", marginTop: "0.75rem" }}>{error}</div>}
      </div>
    </div>
  );
}

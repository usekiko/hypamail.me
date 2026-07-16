"use client";

// Passkey management. Adding or removing a passkey always requires the recovery
// code + a TOTP code (even though you're signed in), so a stolen session can't
// enroll or strip a device. Max 3 passkeys. The original (signup) passkey is
// permanent — it's the only one that logs in with a single tap, so it can't be
// removed; the rest also ask for a TOTP code at login.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  listPasskeys,
  addPasskeyBegin,
  addPasskeyComplete,
  removePasskey,
} from "../../actions";
import {
  deriveRecoveryAuthKey,
  unwrapWithRecovery,
  webauthnCreate,
  wrapWithPrf,
  recoveryWordsValid,
  loadMailKey,
} from "@/lib/client/crypto";
import PasskeyHelp from "../../ui/PasskeyHelp";
import RecoveryWordsInput from "../../ui/RecoveryWordsInput";

interface Passkey {
  id: string;
  nickname: string | null;
  isOriginal: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

type Mode = { kind: "view" } | { kind: "add" } | { kind: "remove"; id: string };

// NOTE: defined at module scope, NOT inside SettingsPage. A component declared
// inside another component gets a new identity on every render, so React would
// unmount/remount these inputs on each keystroke and they'd lose focus after a
// single character.
function GateForm({
  words,
  setWords,
  totpCode,
  setTotpCode,
  busy,
  error,
  onSubmit,
  onCancel,
  submitLabel,
  danger,
}: {
  words: string;
  setWords: (v: string) => void;
  totpCode: string;
  setTotpCode: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  submitLabel: string;
  danger?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
      <p style={{ color: "#878787", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
        For your security this needs your recovery code and an authenticator code.
      </p>
      <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
      <input
        className="inpt"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="authenticator code"
        autoComplete="one-time-code"
        value={totpCode}
        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
        required
        style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em" }}
      />
      {error && <div style={{ color: "#e06a6a", fontSize: "13px" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          className={danger ? "btn btn-cancel" : "btn btn-primary"}
          type="submit"
          disabled={busy || totpCode.length !== 6 || !words.trim()}
          style={{ padding: "0.5rem 1.25rem", ...(danger ? { color: "#e06a6a" } : {}) }}
        >
          {busy ? "Working…" : submitLabel}
        </button>
        <button type="button" className="btn btn-cancel" onClick={onCancel} style={{ padding: "0.5rem 1.25rem" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [max, setMax] = useState(3);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [words, setWords] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await listPasskeys();
    if (res.passkeys) {
      setPasskeys(res.passkeys);
      if (res.max) setMax(res.max);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function resetForm(next: Mode) {
    setMode(next);
    setWords("");
    setTotpCode("");
    setError(null);
    setNotice(null);
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!recoveryWordsValid(words)) {
      setError("That doesn't look like a valid 12-word recovery code.");
      return;
    }
    setBusy(true);
    try {
      const recoveryAuthKey = await deriveRecoveryAuthKey(words);
      const begin = await addPasskeyBegin({ recoveryAuthKey, totpCode });
      if (begin.error || !begin.optionsJSON || !begin.wrappedKeyRecovery) {
        setError(begin.error || "Could not start passkey setup.");
        return;
      }
      const created = await webauthnCreate(begin.optionsJSON);
      // The new passkey needs its own PRF-wrapped copy of the mail key. Unwrap
      // the source key from the recovery blob with the words just entered
      // (falling back to the already-unlocked key if present).
      let mailKey = loadMailKey();
      if (!mailKey) {
        try {
          mailKey = await unwrapWithRecovery(words, begin.wrappedKeyRecovery);
        } catch {
          mailKey = null;
        }
      }
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
      await reload();
      resetForm({ kind: "view" });
      setNotice("Passkey added. Signing in with it will also ask for a code from your authenticator.");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "InvalidStateError"
          ? "This device already has a passkey for your account."
          : err instanceof DOMException && err.name === "NotAllowedError"
            ? "Passkey creation was cancelled."
            : "This browser couldn't create a passkey — see the help below."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode.kind !== "remove") return;
    setError(null);
    if (!recoveryWordsValid(words)) {
      setError("That doesn't look like a valid 12-word recovery code.");
      return;
    }
    setBusy(true);
    try {
      const recoveryAuthKey = await deriveRecoveryAuthKey(words);
      const res = await removePasskey({ recoveryAuthKey, totpCode, credentialId: mode.id });
      if (!res.ok) {
        setError(res.error || "Could not remove the passkey.");
        return;
      }
      await reload();
      resetForm({ kind: "view" });
      setNotice("Passkey removed.");
    } finally {
      setBusy(false);
    }
  }

  const atMax = passkeys !== null && passkeys.length >= max;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
        <h1 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 700 }}>settings</h1>
        <Link href="/mail" style={{ color: "#878787", fontSize: "13px" }}>back to inbox</Link>
      </div>

      <div className="panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
          <b style={{ fontSize: "14px" }}>Passkeys</b>
          <span style={{ color: "#878787", fontSize: "12px" }}>
            {passkeys ? `${passkeys.length} / ${max}` : ""}
          </span>
        </div>
        <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1rem", lineHeight: 1.6 }}>
          Your <b style={{ color: "#ddd" }}>original</b> passkey signs you in with one tap and is
          permanent. Passkeys you add here also ask for an authenticator code when signing in, and
          can be removed. Adding or removing a passkey always needs your recovery code +
          authenticator code.
        </p>

        {notice && <div style={{ color: "#7bb97b", fontSize: "13px", marginBottom: "0.75rem" }}>{notice}</div>}

        {passkeys === null ? (
          <div style={{ color: "#878787", fontSize: "13px" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {passkeys.map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 6, background: "#1a1a1a" }}>
                <div>
                  <div style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                    {p.isOriginal ? "Original passkey" : p.nickname || `Passkey ${i + 1}`}
                    {p.isOriginal && (
                      <span style={{ fontSize: "11px", color: "#7bb97b", border: "1px solid #2c3a2c", borderRadius: 4, padding: "0 6px" }}>one-tap</span>
                    )}
                  </div>
                  <div style={{ color: "#878787", fontSize: "11px", marginTop: 2 }}>
                    added {new Date(p.createdAt).toLocaleDateString()}
                    {p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : " · not used yet"}
                  </div>
                </div>
                {/* The original passkey is permanent and has no remove button. */}
                {p.isOriginal ? (
                  <span style={{ color: "#5a5a5a", fontSize: "11px" }}>permanent</span>
                ) : mode.kind === "remove" && mode.id === p.id ? null : (
                  <button
                    className="btn btn-cancel"
                    onClick={() => resetForm({ kind: "remove", id: p.id })}
                    style={{ padding: "0.35rem 0.9rem", fontSize: "12px" }}
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {mode.kind === "remove" && (
          <div style={{ marginTop: "0.75rem", padding: "12px", borderRadius: 6, border: "1px solid #3a2c2c" }}>
            <div style={{ fontSize: "13px", color: "#e06a6a" }}>Remove this passkey?</div>
            <GateForm
              words={words}
              setWords={setWords}
              totpCode={totpCode}
              setTotpCode={setTotpCode}
              busy={busy}
              error={error}
              onSubmit={onRemove}
              onCancel={() => resetForm({ kind: "view" })}
              submitLabel="Remove passkey"
              danger
            />
          </div>
        )}

        {mode.kind === "add" && (
          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "9px 12px", borderRadius: 6, background: "rgba(123,185,123,0.08)", color: "#9ac79a", fontSize: "12px", lineHeight: 1.6 }}>
              <span className="icon" style={{ fontSize: "16px", marginTop: "1px" }}>info</span>
              <span>
                Adding a passkey <b>won&apos;t reset your recovery code or your authenticator</b>
                {" "}— both stay exactly as they are. You&apos;re only entering them here to prove
                it&apos;s you.
              </span>
            </div>
            <GateForm
              words={words}
              setWords={setWords}
              totpCode={totpCode}
              setTotpCode={setTotpCode}
              busy={busy}
              error={error}
              onSubmit={onAdd}
              onCancel={() => resetForm({ kind: "view" })}
              submitLabel="Create passkey"
            />
          </div>
        )}

        {mode.kind === "view" && (
          <div style={{ marginTop: "1rem" }}>
            <button
              className="btn btn-primary"
              onClick={() => resetForm({ kind: "add" })}
              disabled={atMax}
              style={{ padding: "0.55rem 1.5rem" }}
            >
              Add a passkey
            </button>
            {atMax && (
              <span style={{ color: "#878787", fontSize: "12px", marginLeft: "0.75rem" }}>
                You&apos;ve reached the maximum of {max}. Remove one to add another.
              </span>
            )}
          </div>
        )}

        <PasskeyHelp />
      </div>
    </div>
  );
}

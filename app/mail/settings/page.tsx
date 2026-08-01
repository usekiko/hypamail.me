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
  setLoginTotpRequired,
} from "../../actions";
import {
  deriveRecoveryAuthKey,
  unwrapWithRecovery,
  webauthnCreate,
  wrapWithPrf,
  recoveryWordsError,
  loadMailKey,
} from "@/lib/client/crypto";
import { ShineButton } from "@/components/ui/shine-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { TextInput } from "@/components/ui/text-input";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import PasskeyHelp from "../../ui/PasskeyHelp";
import RecoveryWordsInput from "../../ui/RecoveryWordsInput";

interface Passkey {
  id: string;
  nickname: string | null;
  isOriginal: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

type Mode =
  | { kind: "view" }
  | { kind: "add" }
  | { kind: "remove"; id: string }
  | { kind: "totp-on" }
  | { kind: "totp-off" };

// Row inside a panel: slightly raised against the card, hairline border.
const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "0.7px solid var(--border)",
};

// Small status chip ("one-tap", "on"/"off").
function Chip({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "11px",
        color: active ? "rgb(187,247,208)" : "var(--muted-foreground)",
        border: `0.7px solid ${active ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
        background: active ? "rgba(34,197,94,0.12)" : "transparent",
        borderRadius: 999,
        padding: "0 8px",
      }}
    >
      {children}
    </span>
  );
}

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
      <p style={{ color: "var(--muted-foreground)", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
        For your security this needs your recovery code and an authenticator code.
      </p>
      <RecoveryWordsInput value={words} onChange={setWords} disabled={busy} />
      <TextInput
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        size="md"
        placeholder="Authenticator code"
        autoComplete="one-time-code"
        value={totpCode}
        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
        required
        fullWidth
        leading={<MIcon name="pin" size={16} />}
        style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em" }}
      />
      {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {danger ? (
          <SecondaryButton type="submit" danger disabled={busy || totpCode.length !== 6 || !words.trim()}>
            {busy ? "Working…" : submitLabel}
          </SecondaryButton>
        ) : (
          <ShineButton type="submit" size="md" disabled={busy || totpCode.length !== 6 || !words.trim()}>
            {busy ? "Working…" : submitLabel}
          </ShineButton>
        )}
        <SecondaryButton type="button" onClick={onCancel}>
          Cancel
        </SecondaryButton>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [max, setMax] = useState(3);
  const [requireTotp, setRequireTotp] = useState(false);
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
      setRequireTotp(!!res.requireTotpOnLogin);
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
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) {
      setError(wordsErr);
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
            : "This browser couldn't create a passkey. See the help below."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode.kind !== "remove") return;
    setError(null);
    const wordsErr = recoveryWordsError(words);
    if (wordsErr) {
      setError(wordsErr);
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

  // Turning the requirement ON only needs a live TOTP code (proves the app works
  // so you can't lock yourself out); turning it OFF needs the full gate.
  async function onToggleTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode.kind !== "totp-on" && mode.kind !== "totp-off") return;
    const enable = mode.kind === "totp-on";
    setError(null);
    if (!enable) {
      const wordsErr = recoveryWordsError(words);
      if (wordsErr) {
        setError(wordsErr);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await setLoginTotpRequired({
        enable,
        totpCode,
        recoveryAuthKey: enable ? undefined : await deriveRecoveryAuthKey(words),
      });
      if (!res.ok) {
        setError(res.error || "Could not change the setting.");
        return;
      }
      await reload();
      resetForm({ kind: "view" });
      setNotice(
        enable
          ? "Every sign-in will now ask for an authenticator code."
          : "Your original passkey signs you in with one tap again."
      );
    } finally {
      setBusy(false);
    }
  }

  const atMax = passkeys !== null && passkeys.length >= max;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
        <h1 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>Settings</h1>
        <Link href="/mail" style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>
          Back to inbox
        </Link>
      </div>

      <div className="panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
          <b style={{ fontSize: "14px" }}>Passkeys</b>
          <span style={{ color: "var(--muted-foreground)", fontSize: "12px" }}>
            {passkeys ? `${passkeys.length} / ${max}` : ""}
          </span>
        </div>
        <p style={{ color: "var(--muted-foreground)", fontSize: "13px", margin: "0 0 1rem", lineHeight: 1.6 }}>
          Your <b style={{ color: "var(--foreground)" }}>original</b> passkey signs you in with one tap and is
          permanent. Passkeys you add here also ask for an authenticator code when signing in, and
          can be removed. Adding or removing a passkey always needs your recovery code +
          authenticator code.
        </p>

        {notice && <AlertMessage tone="success">{notice}</AlertMessage>}

        {passkeys === null ? (
          <div style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {passkeys.map((p, i) => (
              <div key={p.id} style={rowStyle}>
                <div>
                  <div style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <MIcon name="passkey" size={14} />
                    {p.isOriginal ? "Original passkey" : p.nickname || `Passkey ${i + 1}`}
                    {p.isOriginal && <Chip active>one-tap</Chip>}
                  </div>
                  <div style={{ color: "var(--muted-foreground)", fontSize: "11px", marginTop: 2 }}>
                    added {new Date(p.createdAt).toLocaleDateString()}
                    {p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : " · not used yet"}
                  </div>
                </div>
                {/* The original passkey is permanent and has no remove button. */}
                {p.isOriginal ? (
                  <span style={{ color: "var(--muted-foreground)", fontSize: "11px" }}>permanent</span>
                ) : mode.kind === "remove" && mode.id === p.id ? null : (
                  <SecondaryButton size="sm" danger variant="ghost" onClick={() => resetForm({ kind: "remove", id: p.id })}>
                    Remove
                  </SecondaryButton>
                )}
              </div>
            ))}
          </div>
        )}

        {mode.kind === "remove" && (
          <div style={{ marginTop: "0.75rem", padding: "12px", borderRadius: 8, border: "0.7px solid rgba(239,68,68,0.3)" }}>
            <div style={{ fontSize: "13px", color: "#f87171" }}>Remove this passkey?</div>
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
            <AlertMessage
              tone="info"
              icon={<MIcon name="info" size={16} style={{ flexShrink: 0, marginRight: 8, marginTop: 2 }} />}
              style={{ fontSize: 12 }}
            >
              Adding a passkey <b>won&apos;t reset your recovery code or your authenticator</b>.
              Both stay exactly as they are. You&apos;re only entering them here to prove
              it&apos;s you.
            </AlertMessage>
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
          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <ShineButton size="md" onClick={() => resetForm({ kind: "add" })} disabled={atMax}>
              <MIcon name="add" size={16} style={{ marginRight: 6 }} />
              Add a passkey
            </ShineButton>
            {atMax && (
              <span style={{ color: "var(--muted-foreground)", fontSize: "12px" }}>
                You&apos;ve reached the maximum of {max}. Remove one to add another.
              </span>
            )}
          </div>
        )}

        <PasskeyHelp />
      </div>

      <div className="panel" style={{ padding: "16px", marginTop: "12px" }}>
        <b style={{ fontSize: "14px" }}>Two-factor on sign-in</b>
        <p style={{ color: "var(--muted-foreground)", fontSize: "13px", margin: "0.5rem 0 1rem", lineHeight: 1.6 }}>
          A passkey already counts as two factors: the device plus your fingerprint, face or PIN.
          So by default your original passkey signs you in with one tap. Turn this on to also
          require a code from your authenticator app every single time. Passkeys you added later
          always ask for a code, whatever this is set to.
        </p>

        {passkeys === null ? (
          <div style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Loading…</div>
        ) : (
          <div style={rowStyle}>
            <div>
              <div style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                Ask for a code on every sign-in
                <Chip active={requireTotp}>{requireTotp ? "on" : "off"}</Chip>
              </div>
              <div style={{ color: "var(--muted-foreground)", fontSize: "11px", marginTop: 2 }}>
                {requireTotp
                  ? "Your original passkey also asks for an authenticator code."
                  : "Your original passkey signs you in with one tap."}
              </div>
            </div>
            {mode.kind === "totp-on" || mode.kind === "totp-off" ? null : (
              <SecondaryButton size="sm" onClick={() => resetForm({ kind: requireTotp ? "totp-off" : "totp-on" })}>
                {requireTotp ? "Turn off" : "Turn on"}
              </SecondaryButton>
            )}
          </div>
        )}

        {mode.kind === "totp-on" && (
          <form onSubmit={onToggleTotp} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
            <p style={{ color: "var(--muted-foreground)", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
              Enter a code from your authenticator to confirm it works. Otherwise turning this on
              could lock you out of every future sign-in.
            </p>
            <TextInput
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              size="md"
              placeholder="Authenticator code"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              required
              fullWidth
              leading={<MIcon name="pin" size={16} />}
              style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em" }}
            />
            {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <ShineButton type="submit" size="md" disabled={busy || totpCode.length !== 6}>
                {busy ? "Working…" : "Turn on"}
              </ShineButton>
              <SecondaryButton type="button" onClick={() => resetForm({ kind: "view" })}>
                Cancel
              </SecondaryButton>
            </div>
          </form>
        )}

        {mode.kind === "totp-off" && (
          <GateForm
            words={words}
            setWords={setWords}
            totpCode={totpCode}
            setTotpCode={setTotpCode}
            busy={busy}
            error={error}
            onSubmit={onToggleTotp}
            onCancel={() => resetForm({ kind: "view" })}
            submitLabel="Turn off"
            danger
          />
        )}
      </div>
    </div>
  );
}

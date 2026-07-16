"use client";

// Passwordless signup wizard:
//   1. username + invite + Turnstile
//   2. create a passkey (browser dialog)
//   3. save the 12-word recovery code (generated locally, never sent anywhere)
//   4. mandatory authenticator (TOTP) enrollment — QR + verify code
// While the user reads the words, the browser has already generated the PGP
// mail keypair and wrapped its private key; the server only ever receives
// wrapped blobs and the public key.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Turnstile from "../ui/Turnstile";
import {
  signupBegin,
  signupComplete,
  loginBegin,
  setPrfWrap,
  type SignupBeginResult,
} from "../actions";
import {
  generateRecoveryWords,
  deriveRecoveryAuthKey,
  generateMailKeypair,
  wrapWithRecovery,
  wrapWithPrf,
  webauthnCreate,
  webauthnGet,
  storeMailKey,
} from "@/lib/client/crypto";

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const Logo = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
    alt="hypamail"
    style={{ height: 80, width: "auto", display: "block", marginBottom: "1.5rem" }}
  />
);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
    <div style={{ width: "100%", maxWidth: 500 }}>
      <Logo />
      {children}
    </div>
  </main>
);

const Err = ({ msg }: { msg: string | null }) =>
  msg ? <div style={{ color: "#e06a6a", fontSize: "13px", marginTop: "0.75rem" }}>{msg}</div> : null;

type Step = "form" | "passkey" | "words" | "totp";

interface WizardState {
  begin: SignupBeginResult;
  attestation?: unknown;
  credentialId?: string;
  prfCapable?: boolean;
  prfOutput?: ArrayBuffer | null;
  words?: string;
  privateKey?: string;
  publicKey?: string;
  wrappedKeyRecovery?: string;
  wrappedKeyPrf?: string | null;
  recoveryAuthKey?: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wiz, setWiz] = useState<WizardState | null>(null);
  const [wordsSaved, setWordsSaved] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (step === "totp" && qrRef.current && wiz?.begin.totpUri) {
      QRCode.toCanvas(qrRef.current, wiz.begin.totpUri, { width: 190, margin: 2 }).catch(() => {});
    }
  }, [step, wiz]);

  async function onBegin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const begin = await signupBegin({
        username: String(fd.get("username") || ""),
        invite: String(fd.get("invite") || ""),
        turnstileToken: String(fd.get("cf-turnstile-response") || ""),
      });
      if (begin.error || !begin.optionsJSON) {
        setError(begin.error || "Something went wrong.");
        return;
      }
      setWiz({ begin });
      setStep("passkey");
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePasskey() {
    if (!wiz?.begin.optionsJSON || !wiz.begin.email) return;
    setError(null);
    setBusy(true);
    try {
      const created = await webauthnCreate(wiz.begin.optionsJSON);
      // All client-side: recovery words, mail keypair, wrapped blobs.
      const words = generateRecoveryWords();
      const { privateKey, publicKey } = await generateMailKeypair(wiz.begin.email);
      const wrappedKeyRecovery = await wrapWithRecovery(words, privateKey);
      const recoveryAuthKey = await deriveRecoveryAuthKey(words);
      const wrappedKeyPrf = created.prfOutput
        ? await wrapWithPrf(created.prfOutput, privateKey)
        : null;
      setWiz({
        ...wiz,
        attestation: created.responseJSON,
        credentialId: created.credentialId,
        prfCapable: created.prfEnabled,
        prfOutput: created.prfOutput,
        words,
        privateKey,
        publicKey,
        wrappedKeyRecovery,
        wrappedKeyPrf,
        recoveryAuthKey,
      });
      setStep("words");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Passkey creation was cancelled — try again."
          : "This browser couldn't create a passkey. Try Chrome/Edge/Safari, or a password manager like Bitwarden."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onComplete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!wiz?.attestation) return;
    setError(null);
    setBusy(true);
    try {
      const res = await signupComplete({
        attestation: wiz.attestation,
        prfCapable: !!wiz.prfCapable,
        wrappedKeyPrf: wiz.wrappedKeyPrf ?? null,
        wrappedKeyRecovery: wiz.wrappedKeyRecovery!,
        recoveryAuthKey: wiz.recoveryAuthKey!,
        pgpPublicKey: wiz.publicKey!,
        totpCode,
      });
      if (!res.ok) {
        if (res.fatal) {
          setStep("form");
          setWiz(null);
          setWordsSaved(false);
          setTotpCode("");
        }
        setError(res.error || "Something went wrong.");
        return;
      }
      storeMailKey(wiz.privateKey!);
      // Self-heal PRF: many authenticators only reveal PRF output on get(), not
      // create(). Best effort — quietly skipped if it doesn't work out.
      if (wiz.prfCapable && !wiz.wrappedKeyPrf && wiz.credentialId) {
        try {
          const { optionsJSON } = await loginBegin();
          const got = await webauthnGet(optionsJSON, wiz.credentialId);
          if (got.prfOutput) {
            await setPrfWrap({
              credentialId: wiz.credentialId,
              wrappedKeyPrf: await wrapWithPrf(got.prfOutput, wiz.privateKey!),
            });
          }
        } catch {}
      }
      router.push("/mail");
    } finally {
      setBusy(false);
    }
  }

  if (step === "passkey") {
    return (
      <Shell>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Create your passkey</h1>
        <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.75rem", lineHeight: 1.6 }}>
          {wiz?.begin.email} has no password. You sign in with a passkey — your
          fingerprint, face, or device PIN. Your browser will ask you to create one now.
        </p>
        <button className="btn btn-primary" onClick={onCreatePasskey} disabled={busy} style={{ width: "100%", padding: "0.55rem" }}>
          {busy ? "Waiting for your device…" : "Create passkey"}
        </button>
        <Err msg={error} />
      </Shell>
    );
  }

  if (step === "words" && wiz?.words) {
    return (
      <Shell>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Your recovery code</h1>
        <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
          Write these 12 words down and keep them safe. They are the <b style={{ color: "#ddd" }}>only</b> way
          back into your account if you lose your devices — and the only backup key to your mail.
          We can&apos;t reset or recover them. They will not be shown again.
        </p>
        <div className="panel" style={{ padding: "14px", marginBottom: "1.25rem", userSelect: "all" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 14px", fontFamily: "ui-monospace, monospace", fontSize: "14px" }}>
            {wiz.words.split(" ").map((w, i) => (
              <span key={i}>
                <span style={{ color: "#878787", fontSize: "11px", marginRight: 6 }}>{i + 1}.</span>
                {w}
              </span>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px", marginBottom: "1.25rem", cursor: "pointer" }}>
          <input type="checkbox" checked={wordsSaved} onChange={(e) => setWordsSaved(e.target.checked)} style={{ marginTop: 2 }} />
          <span>I wrote down my recovery code. I understand it cannot be recovered for me.</span>
        </label>
        <button
          className="btn btn-primary"
          disabled={!wordsSaved}
          onClick={() => setStep("totp")}
          style={{ width: "100%", padding: "0.55rem" }}
        >
          Continue
        </button>
      </Shell>
    );
  }

  if (step === "totp" && wiz?.begin.totpSecret) {
    return (
      <Shell>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Set up 2FA</h1>
        <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
          Scan this with an authenticator app (Aegis, Ente Auth, Google Authenticator…).
          It protects account recovery: recovery needs your 12 words <b style={{ color: "#ddd" }}>and</b> a
          code from this app. Use an authenticator with backups — losing both your passkeys and
          this app means the account is gone for good.
        </p>
        <div style={{ background: "#fff", borderRadius: 8, padding: 10, width: "fit-content", margin: "0 auto 1rem" }}>
          <canvas ref={qrRef} style={{ display: "block" }} />
        </div>
        <p style={{ color: "#878787", fontSize: "12px", margin: "0 0 1.25rem", textAlign: "center" }}>
          Can&apos;t scan? Enter manually:{" "}
          <code style={{ userSelect: "all", color: "#bbb" }}>{wiz.begin.totpSecret}</code>
        </p>
        <form onSubmit={onComplete} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="field-label">6-digit code from the app</label>
            <input
              className="inpt"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              required
              style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", textAlign: "center" }}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || totpCode.length !== 6} style={{ width: "100%", padding: "0.55rem" }}>
            {busy ? "Creating account…" : "Verify & finish"}
          </button>
          <Err msg={error} />
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Register</h1>
      <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.75rem" }}>
        invite-only — no password, you&apos;ll sign in with a passkey
      </p>
      <form onSubmit={onBegin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="field-label">Username</label>
          <div style={{ display: "flex" }}>
            <input className="inpt" name="username" placeholder="Username" autoComplete="off" autoCapitalize="none" required style={{ flex: 1 }} />
            <span style={{ display: "flex", alignItems: "center", padding: "0 12px", background: "#1f1f1f", color: "#878787", fontSize: "14px", whiteSpace: "nowrap" }}>
              @{DOMAIN}
            </span>
          </div>
        </div>
        <div>
          <label className="field-label">Invite code</label>
          <input className="inpt" name="invite" placeholder="Invite code" autoComplete="off" required />
        </div>
        {SITE_KEY ? (
          <Turnstile siteKey={SITE_KEY} />
        ) : (
          <div style={{ color: "#878787", fontSize: "12px" }}>(Turnstile not configured)</div>
        )}
        {error && <div style={{ color: "#e06a6a", fontSize: "13px" }}>{error}</div>}
        <button className="btn btn-cancel" type="submit" disabled={busy} style={{ width: "100%", padding: "0.55rem" }}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
      <p style={{ fontSize: "13px", marginTop: "1.25rem" }}>
        <Link href="/login" style={{ fontWeight: 600 }}>Already have an account?</Link>
      </p>
    </Shell>
  );
}

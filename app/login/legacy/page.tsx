"use client";

// Time-boxed migration for password-era accounts (see constants/legacy.ts).
// Prove the old password once, then walk the same wizard as signup:
//   1. username + password (the last time it's ever used)
//   2. create a passkey
//   3. save the 12-word recovery code (generated locally, never sent anywhere)
//   4. mandatory authenticator (TOTP) enrollment
// Completing it enables zero-access encryption for the mailbox and retires the
// password. Messages already in the inbox stay readable; new mail is encrypted
// before it touches disk.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import PasskeyHelp from "../../ui/PasskeyHelp";
import FirefoxNote from "../../ui/FirefoxNote";
import { ShineButton } from "@/components/ui/shine-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { TextInput } from "@/components/ui/text-input";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import { AuthColumn, AuthPanel } from "@/components/auth-panel";
import { legacyLoginAvailable, LEGACY_LOGIN_LABEL } from "@/constants/legacy";
import {
  legacyLoginBegin,
  legacyMigrateComplete,
  loginBegin,
  setPrfWrap,
  type SignupBeginResult,
} from "../../actions";
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

const Shell = ({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="flex min-h-screen bg-[#151515]">
    <AuthColumn title={title} subtitle={subtitle} footer={footer}>
      {children}
    </AuthColumn>
    <AuthPanel />
  </div>
);

type Step = "password" | "passkey" | "words" | "totp";

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

export default function LegacyLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wiz, setWiz] = useState<WizardState | null>(null);
  const [wordsSaved, setWordsSaved] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const qrRef = useRef<HTMLCanvasElement>(null);

  function downloadRecoveryCode() {
    if (!wiz?.words || !wiz.begin.email) return;
    const body = [
      "hypamail recovery code",
      "======================",
      "",
      `Address: ${wiz.begin.email}`,
      "",
      "These 12 words are the ONLY way back into your account if you lose your",
      "devices, and the only backup key to your encrypted mail. Anyone with them",
      "plus your authenticator can read your mail. Keep this file private and",
      "offline. We cannot reset or recover it for you.",
      "",
      ...wiz.words.split(" ").map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`),
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hypamail-recovery-${wiz.begin.email.split("@")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  useEffect(() => {
    if (step === "totp" && qrRef.current && wiz?.begin.totpUri) {
      QRCode.toCanvas(qrRef.current, wiz.begin.totpUri, { width: 190, margin: 2 }).catch(() => {});
    }
  }, [step, wiz]);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const begin = await legacyLoginBegin({
        username: String(fd.get("username") || ""),
        password: String(fd.get("password") || ""),
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
      const res = await legacyMigrateComplete({
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
          setStep("password");
          setWiz(null);
          setWordsSaved(false);
          setDownloaded(false);
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

  const footer = (
    <>
      Already moved to passkeys?{" "}
      <Link href="/login" className="text-[#f7f8f8] font-semibold hover:underline">
        Sign in
      </Link>
    </>
  );

  // The window is enforced server-side; this is just the honest front door.
  if (!legacyLoginAvailable()) {
    return (
      <Shell
        title="Password sign-in has ended"
        subtitle="hypamail is passkey-only now."
        footer={footer}
      >
        <p className="text-[13px] text-[#898e97] leading-[1.6] m-0 mb-4">
          The migration window for password-era accounts closed on {LEGACY_LOGIN_LABEL}. If you
          never moved your account to a passkey, email{" "}
          <a href="mailto:hello@hypamail.me" className="text-[#f7f8f8] underline">
            hello@hypamail.me
          </a>{" "}
          from another address and we&apos;ll sort it out.
        </p>
      </Shell>
    );
  }

  if (step === "passkey") {
    return (
      <Shell
        title="Create your passkey"
        subtitle="Your password just worked for the last time."
        footer={footer}
      >
        <p className="text-[13px] text-[#898e97] leading-[1.6] m-0 mb-6">
          From now on you&apos;ll sign in to {wiz?.begin.email} with a passkey — your
          fingerprint, face, or device PIN. Your browser will ask you to create one now.
        </p>
        <ShineButton onClick={onCreatePasskey} disabled={busy} fullWidth>
          <MIcon name="passkey" size={18} style={{ marginRight: 8 }} />
          {busy ? "Waiting for your device…" : "Create passkey"}
        </ShineButton>
        {error && <AlertMessage tone="error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</AlertMessage>}
        <FirefoxNote />
        <PasskeyHelp />
      </Shell>
    );
  }

  if (step === "words" && wiz?.words) {
    return (
      <Shell
        title="Your recovery code"
        subtitle="It will not be shown again."
        footer={footer}
      >
        <p className="text-[13px] text-[#898e97] leading-[1.6] m-0 mb-5">
          Write these 12 words down and keep them safe. They are the{" "}
          <b className="text-[#f7f8f8]">only</b>{" "}
          way back into your account if you lose your devices — and the only backup key to your
          mail. We can&apos;t reset or recover them.
        </p>
        <div className="panel mb-4 select-all" style={{ padding: 14 }}>
          <div
            className="grid grid-cols-3 text-[14px]"
            style={{ gap: "10px 16px", fontFamily: "ui-monospace, monospace" }}
          >
            {wiz.words.split(" ").map((w, i) => (
              <span key={i} className="flex gap-1.5" style={{ minWidth: 0 }}>
                <span className="text-[#898e97] text-right" style={{ minWidth: "1.6em" }}>{i + 1}.</span>
                <span className="text-[#f7f8f8]">{w}</span>
              </span>
            ))}
          </div>
        </div>

        <SecondaryButton onClick={downloadRecoveryCode} fullWidth style={{ marginBottom: "1rem" }}>
          <MIcon name="download" size={16} style={{ marginRight: 6 }} />
          {downloaded ? "Downloaded — download again" : "Download recovery code"}
        </SecondaryButton>

        <label className="flex items-start gap-2 text-[13px] text-[#f7f8f8] mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={wordsSaved}
            onChange={(e) => setWordsSaved(e.target.checked)}
            className="mt-0.5"
          />
          <span>I saved my recovery code. I understand it cannot be recovered for me.</span>
        </label>
        <ShineButton disabled={!wordsSaved || !downloaded} onClick={() => setStep("totp")} fullWidth>
          Continue
        </ShineButton>
        {!downloaded && (
          <p className="text-[12px] text-[#898e97] mt-2.5 text-center">
            Download your recovery code to continue.
          </p>
        )}
      </Shell>
    );
  }

  if (step === "totp" && wiz?.begin.totpSecret) {
    return (
      <Shell
        title="Set up 2FA"
        subtitle="Scan this with an authenticator app (Aegis, Ente Auth, Google Authenticator…)."
        footer={footer}
      >
        <p className="text-[13px] text-[#898e97] leading-[1.6] m-0 mb-5">
          It protects account recovery: recovery needs your 12 words{" "}
          <b className="text-[#f7f8f8]">and</b>{" "}
          a code from this app. Use an authenticator with backups — losing both your passkeys and
          this app means the account is gone for good.
        </p>
        <div className="bg-white rounded-lg p-2.5 w-fit mx-auto mb-4">
          <canvas ref={qrRef} className="block" />
        </div>
        <p className="text-[12px] text-[#898e97] m-0 mb-5 text-center">
          Can&apos;t scan? Enter manually:{" "}
          <code className="select-all text-[#b9bec6]">{wiz.begin.totpSecret}</code>
        </p>
        <form onSubmit={onComplete} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1">
              6-digit code from the app
            </label>
            <TextInput
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              required
              fullWidth
              style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", textAlign: "center" }}
            />
          </div>
          <ShineButton type="submit" disabled={busy || totpCode.length !== 6} fullWidth>
            {busy ? "Finishing migration…" : "Verify & finish"}
          </ShineButton>
          {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
        </form>
      </Shell>
    );
  }

  return (
    <Shell
      title="Move to passkeys"
      subtitle="One-time sign-in for accounts from the password era."
      footer={footer}
    >
      <AlertMessage
        tone="info"
        icon={<MIcon name="schedule" size={16} style={{ flexShrink: 0, marginRight: 8, marginTop: 2 }} />}
        className="mb-5"
      >
        Password sign-in works here until {LEGACY_LOGIN_LABEL}. You&apos;ll create a passkey and
        your mailbox switches to zero-access encryption — mail already in your inbox stays
        readable, new mail is encrypted before it touches disk, and your password stops working.
      </AlertMessage>

      <form onSubmit={onPassword} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1" htmlFor="username">
            Username
          </label>
          <TextInput
            id="username"
            name="username"
            disabled={busy}
            placeholder="you"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            fullWidth
            trailing={<span className="text-[13px] whitespace-nowrap">@{DOMAIN}</span>}
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1" htmlFor="password">
            Password
          </label>
          <TextInput
            id="password"
            name="password"
            type="password"
            disabled={busy}
            placeholder="••••••••"
            // Unlike the old login form this WANTS the saved password offered —
            // it's the whole point of the page.
            autoComplete="current-password"
            required
            fullWidth
            leading={<MIcon name="key" size={16} />}
          />
        </div>
        {error && <AlertMessage tone="error" style={{ marginBottom: 0 }}>{error}</AlertMessage>}
        <ShineButton type="submit" disabled={busy} fullWidth>
          {busy ? "Checking…" : "Sign in & start migration"}
        </ShineButton>
      </form>
    </Shell>
  );
}

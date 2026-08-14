"use client";

// Signup wizard:
//   1. username + invite + Turnstile
//   2. passkey, password, or neither — all optional
//   3. save the 12-word recovery code (the one thing you can't skip)
//   4. authenticator, if they want one — QR + verify code
// The PGP keypair is generated and wrapped while the user is still reading the
// words, so the server only ever receives blobs and the public key.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Instrument_Sans } from "next/font/google";
import { Button, InputGroup } from "@heroui/react";
import Turnstile from "../ui/Turnstile";
import PasskeyHelp from "../ui/PasskeyHelp";
import FirefoxNote from "../ui/FirefoxNote";
import { Alert } from "../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import { DarkAuthColumn } from "../ui/DarkAuthShell";
import { inviteRequired, INVITE_FREE_LABEL } from "@/constants/invite";
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
  generatePasswordSalt,
  derivePasswordAuthKey,
  wrapWithPassword,
  passwordError,
  PASSWORD_MIN_LENGTH,
} from "@/lib/client/crypto";
import "../heroui.css";

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Every wizard step shares the same centred auth shell as the login page.
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
  <div className={`${instrumentSans.className} heroui-scope bg-background flex min-h-screen`}>
    <DarkAuthColumn title={title} subtitle={subtitle} footer={footer}>
      {children}
    </DarkAuthColumn>
  </div>
);

// "secure" is passkey, password, or neither. "words" is the one step nobody can
// skip — it's what guarantees every account has a way back in.
type Step = "form" | "secure" | "words" | "totp";

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
  passwordSalt?: string | null;
  passwordAuthKey?: string | null;
  wrappedKeyPassword?: string | null;
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wiz, setWiz] = useState<WizardState | null>(null);
  const [wordsSaved, setWordsSaved] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const qrRef = useRef<HTMLCanvasElement>(null);
  const needsInvite = inviteRequired();

  // Save the recovery code as a plain-text file. This is the user's only copy —
  // the server never sees these words, so there is nothing to re-send later.
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
      setStep("secure");
    } finally {
      setBusy(false);
    }
  }

  // The mail keypair and the recovery wrapping happen no matter which credential
  // was chosen (or none), so they live here rather than inside the passkey path.
  // Everything is client-side; the server only ever receives wrapped blobs.
  async function buildKeys(
    created?: Awaited<ReturnType<typeof webauthnCreate>>,
    withPassword = false
  ) {
    const words = generateRecoveryWords();
    const { privateKey, publicKey } = await generateMailKeypair(wiz!.begin.email!);
    const wrappedKeyRecovery = await wrapWithRecovery(words, privateKey);
    const recoveryAuthKey = await deriveRecoveryAuthKey(words);
    const wrappedKeyPrf = created?.prfOutput
      ? await wrapWithPrf(created.prfOutput, privateKey)
      : null;

    let passwordSalt: string | null = null;
    let passwordAuthKey: string | null = null;
    let wrappedKeyPassword: string | null = null;
    if (withPassword) {
      passwordSalt = generatePasswordSalt();
      // Two PBKDF2 passes, one per half. Slow, but this only runs once and it
      // keeps the wrap half from ever existing outside this block.
      passwordAuthKey = await derivePasswordAuthKey(password, passwordSalt);
      wrappedKeyPassword = await wrapWithPassword(password, passwordSalt, privateKey);
    }

    setWiz({
      ...wiz!,
      attestation: created?.responseJSON ?? null,
      credentialId: created?.credentialId,
      prfCapable: created?.prfEnabled,
      prfOutput: created?.prfOutput,
      words,
      privateKey,
      publicKey,
      wrappedKeyRecovery,
      wrappedKeyPrf,
      recoveryAuthKey,
      passwordSalt,
      passwordAuthKey,
      wrappedKeyPassword,
    });
    setStep("words");
  }

  async function onCreatePasskey() {
    if (!wiz?.begin.optionsJSON || !wiz.begin.email) return;
    setError(null);
    setBusy(true);
    try {
      await buildKeys(await webauthnCreate(wiz.begin.optionsJSON));
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Passkey creation was cancelled. Try again."
          : "This browser couldn't create a passkey. Try Chrome/Edge/Safari, or a password manager like Bitwarden."
      );
    } finally {
      setBusy(false);
    }
  }

  // Password, or nothing at all — either way no WebAuthn ceremony runs. The
  // caller says which; reading `usePassword` here would see a stale value when
  // the skip button clears it in the same tick.
  async function onContinueWithoutPasskey(withPassword: boolean) {
    if (!wiz?.begin.email) return;
    setError(null);
    if (withPassword) {
      const pwErr = passwordError(password);
      if (pwErr) return setError(pwErr);
      if (password !== password2) return setError("The two passwords don't match.");
    }
    setBusy(true);
    try {
      await buildKeys(undefined, withPassword);
    } catch {
      setError("Could not prepare your encryption keys. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // `enrollTotp` false means the user skipped the authenticator; the server then
  // stores no secret and never demands a code from this account.
  async function onComplete(e: React.FormEvent<HTMLFormElement> | null, enrollTotp: boolean) {
    e?.preventDefault();
    if (!wiz?.privateKey) return;
    setError(null);
    setBusy(true);
    try {
      const res = await signupComplete({
        attestation: wiz.attestation ?? null,
        prfCapable: !!wiz.prfCapable,
        wrappedKeyPrf: wiz.wrappedKeyPrf ?? null,
        wrappedKeyRecovery: wiz.wrappedKeyRecovery!,
        recoveryAuthKey: wiz.recoveryAuthKey!,
        pgpPublicKey: wiz.publicKey!,
        totpCode: enrollTotp ? totpCode : null,
        enrollTotp,
        passwordSalt: wiz.passwordSalt ?? null,
        passwordAuthKey: wiz.passwordAuthKey ?? null,
        wrappedKeyPassword: wiz.wrappedKeyPassword ?? null,
      });
      if (!res.ok) {
        if (res.fatal) {
          setStep("form");
          setWiz(null);
          setWordsSaved(false);
          setDownloaded(false);
          setTotpCode("");
          setUsePassword(false);
          setPassword("");
          setPassword2("");
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

  const signInFooter = (
    <>
      Already have an account?{" "}
      <Link href="/login" className="text-foreground font-semibold hover:underline">
        Log in
      </Link>
    </>
  );

  if (step === "secure") {
    return (
      <Shell
        title="How you'll sign in"
        subtitle={`Pick one for ${wiz?.begin.email}, or skip.`}
        footer={signInFooter}
      >
        <p className="text-sm text-muted leading-[1.6] m-0 mb-6">
          A passkey is the safest: your fingerprint, face, or device PIN, with nothing to
          remember. A password works everywhere. Skip both and your recovery code becomes
          the only way in.
        </p>

        <Button variant="primary" size="lg" onPress={onCreatePasskey} isDisabled={busy} fullWidth>
          <MIcon name="passkey" size={18} style={{ marginRight: 8 }} />
          {busy ? "Waiting for your device…" : "Create passkey"}
        </Button>

        {!usePassword ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onPress={() => {
              setError(null);
              setUsePassword(true);
            }}
            isDisabled={busy}
            fullWidth
            style={{ marginTop: 12 }}
          >
            <MIcon name="password" size={18} style={{ marginRight: 8 }} />
            Use a password instead
          </Button>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium mb-2 pl-1 text-foreground" htmlFor="pw">
                Password
              </label>
              <InputGroup fullWidth>
                <InputGroup.Prefix>
                  <MIcon name="lock" size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                  autoComplete="new-password"
                />
              </InputGroup>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 pl-1 text-foreground" htmlFor="pw2">
                Confirm password
              </label>
              <InputGroup fullWidth>
                <InputGroup.Prefix>
                  <MIcon name="lock" size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id="pw2"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  disabled={busy}
                  placeholder="Type it again"
                  autoComplete="new-password"
                />
              </InputGroup>
            </div>
            <p className="text-xs text-muted leading-[1.6] m-0">
              Your password never leaves this device — it unlocks your mail here. We cannot
              reset it for you.
            </p>
            <Button
              variant="primary"
              size="lg"
              onPress={() => onContinueWithoutPasskey(true)}
              isDisabled={busy}
              fullWidth
            >
              {busy ? "Setting up…" : "Continue with password"}
            </Button>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          onPress={() => {
            setUsePassword(false);
            setPassword("");
            setPassword2("");
            onContinueWithoutPasskey(false);
          }}
          isDisabled={busy}
          fullWidth
          style={{ marginTop: 12 }}
        >
          Skip for now — use my recovery code
        </Button>

        {error && <Alert tone="error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</Alert>}
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
        footer={signInFooter}
      >
        <p className="text-sm text-muted leading-[1.6] m-0 mb-5">
          Write these 12 words down and keep them safe. They are the{" "}
          <b className="text-foreground">only</b>{" "}
          way back into your account if you lose your devices, and the only backup key to your
          mail. We can&apos;t reset or recover them.
        </p>
        <div className="panel mb-4 select-all" style={{ padding: 14 }}>
          <div
            className="grid grid-cols-3 font-mono text-[14px]"
            style={{ gap: "10px 16px", fontFamily: "ui-monospace, monospace" }}
          >
            {wiz.words.split(" ").map((w, i) => (
              <span key={i} className="flex gap-1.5" style={{ minWidth: 0 }}>
                <span className="text-muted text-right" style={{ minWidth: "1.6em" }}>{i + 1}.</span>
                <span className="text-foreground">{w}</span>
              </span>
            ))}
          </div>
        </div>

        <Button variant="outline" size="lg" onPress={downloadRecoveryCode} fullWidth style={{ marginBottom: "1rem" }}>
          <MIcon name="download" size={16} style={{ marginRight: 6 }} />
          {downloaded ? "Downloaded, download again" : "Download recovery code"}
        </Button>

        <label className="flex items-start gap-2 text-sm text-foreground mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={wordsSaved}
            onChange={(e) => setWordsSaved(e.target.checked)}
            className="mt-0.5"
          />
          <span>I saved my recovery code. I understand it cannot be recovered for me.</span>
        </label>
        <Button variant="primary" size="lg" isDisabled={!wordsSaved || !downloaded} onPress={() => setStep("totp")} fullWidth>
          Continue
        </Button>
        {!downloaded && (
          <p className="text-xs text-muted mt-2.5 text-center">
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
        subtitle="Optional — scan this with an authenticator app (Aegis, Ente Auth, Google Authenticator…)."
        footer={signInFooter}
      >
        <p className="text-sm text-muted leading-[1.6] m-0 mb-5">
          It protects account recovery: recovery would need your 12 words{" "}
          <b className="text-foreground">and</b>{" "}
          a code from this app. Use an authenticator with backups. Losing both your passkeys and
          this app means the account is gone for good.
        </p>
        <div className="bg-white rounded-lg p-2.5 w-fit mx-auto mb-4">
          <canvas ref={qrRef} className="block" />
        </div>
        <p className="text-xs text-muted m-0 mb-5 text-center">
          Can&apos;t scan? Enter manually:{" "}
          <code className="select-all text-muted">{wiz.begin.totpSecret}</code>
        </p>
        <form onSubmit={(e) => onComplete(e, true)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2 pl-1">
              6-digit code from the app
            </label>
            <InputGroup fullWidth>
              <InputGroup.Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                required
                style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", textAlign: "center" }}
              />
            </InputGroup>
          </div>
          <Button type="submit" variant="primary" size="lg" isDisabled={busy || totpCode.length !== 6} fullWidth>
            {busy ? "Creating account…" : "Verify & finish"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onPress={() => onComplete(null, false)}
            isDisabled={busy}
            fullWidth
          >
            Skip — finish without 2FA
          </Button>
          {error && <Alert tone="error" style={{ marginBottom: 0 }}>{error}</Alert>}
        </form>
      </Shell>
    );
  }

  return (
    <Shell
      title="Create account"
      subtitle="No password, you'll sign in with a passkey."
      footer={signInFooter}
    >
      {!needsInvite && (
        <Alert
          tone="info"
          icon={<MIcon name="celebration" size={16} style={{ flexShrink: 0, marginRight: 8, marginTop: 2 }} />}
          className="mb-5"
        >
          Invites are open until {INVITE_FREE_LABEL}. You don&apos;t need a code, just pick a
          username.
        </Alert>
      )}

      <form onSubmit={onBegin} className="space-y-4">
        {error && <Alert tone="error" style={{ marginBottom: 0 }}>{error}</Alert>}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 pl-1" htmlFor="username">
            Username
          </label>
          <InputGroup fullWidth>
            <InputGroup.Input
              id="username"
              name="username"
              disabled={busy}
              placeholder="you"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              required
            />
            <InputGroup.Suffix>
              <span className="text-sm whitespace-nowrap text-foreground/70">@{DOMAIN}</span>
            </InputGroup.Suffix>
          </InputGroup>
        </div>
        <div>
          <label
            className={`block text-sm font-medium mb-2 pl-1 ${needsInvite ? "text-foreground" : "text-muted"}`}
            htmlFor="invite"
          >
            Invite code{!needsInvite && " (not needed right now)"}
          </label>
          <InputGroup fullWidth>
            <InputGroup.Prefix>
              <MIcon name="confirmation_number" size={16} />
            </InputGroup.Prefix>
            <InputGroup.Input
              id="invite"
              name="invite"
              disabled={busy || !needsInvite}
              placeholder={needsInvite ? "Invite code" : "Not needed until " + INVITE_FREE_LABEL}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              required={needsInvite}
            />
          </InputGroup>
        </div>

        {SITE_KEY ? (
          <Turnstile siteKey={SITE_KEY} />
        ) : (
          <p className="text-xs text-muted pl-1">(Turnstile not configured)</p>
        )}

        <Button type="submit" variant="primary" size="lg" isDisabled={busy} fullWidth>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>
    </Shell>
  );
}

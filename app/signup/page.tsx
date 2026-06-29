"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState } from "react";
import { signupAction, type FormState } from "../actions";

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

export default function SignupPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, null);

  if (state?.ok) {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "1.5rem" }}>
        <div style={{ width: "100%", maxWidth: 500 }}>
          <Logo />
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>You&apos;re in</h1>
          <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.75rem" }}>
            Save your password — it won&apos;t be shown again.
          </p>
          <label className="field-label">Address</label>
          <div className="inpt" style={{ height: "auto", padding: "9px 10px", marginBottom: "1rem", userSelect: "all" }}>
            {state.email}
          </div>
          <label className="field-label">Password</label>
          <div className="inpt" style={{ height: "auto", padding: "9px 10px", marginBottom: "1.5rem", fontFamily: "ui-monospace, monospace", userSelect: "all" }}>
            {state.password}
          </div>
          <Link className="btn btn-primary" href="/mail" style={{ display: "block", width: "100%", textAlign: "center", padding: "0.55rem" }}>
            Go to inbox
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "1.5rem" }}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div style={{ width: "100%", maxWidth: 500 }}>
        <Logo />
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Register</h1>
        <p style={{ color: "#878787", fontSize: "13px", margin: "0 0 1.75rem" }}>
          invite-only — a password is generated for you
        </p>
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
            <div className="cf-turnstile" data-sitekey={SITE_KEY} data-theme="dark" />
          ) : (
            <div style={{ color: "#878787", fontSize: "12px" }}>(Turnstile not configured)</div>
          )}
          {state?.error && <div style={{ color: "#e06a6a", fontSize: "13px" }}>{state.error}</div>}
          <button className="btn btn-cancel" type="submit" disabled={pending} style={{ width: "100%", padding: "0.55rem" }}>
            {pending ? "Creating…" : "Register"}
          </button>
        </form>
        <p style={{ fontSize: "13px", marginTop: "1.25rem" }}>
          <Link href="/login" style={{ fontWeight: 600 }}>Already have an account?</Link>
        </p>
      </div>
    </main>
  );
}

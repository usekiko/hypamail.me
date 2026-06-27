"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState } from "react";
import { signupAction, type FormState } from "../actions";

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function SignupPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, null);

  if (state?.ok) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
        <div className="card" style={{ width: "100%", maxWidth: 420, padding: "2rem" }}>
          <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>You&apos;re in</h1>
          <p style={{ color: "var(--muted)", margin: "0 0 1.5rem", fontSize: "0.9rem" }}>
            Save your password — it won&apos;t be shown again.
          </p>
          <label style={{ color: "var(--muted)", fontSize: "0.75rem" }}>Address</label>
          <div className="input" style={{ marginTop: "0.25rem", marginBottom: "0.9rem", userSelect: "all" }}>
            {state.email}
          </div>
          <label style={{ color: "var(--muted)", fontSize: "0.75rem" }}>Password</label>
          <div
            className="input"
            style={{ marginTop: "0.25rem", marginBottom: "1.25rem", fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em", userSelect: "all" }}
          >
            {state.password}
          </div>
          <Link className="btn btn-primary" href="/mail" style={{ width: "100%" }}>
            Go to inbox
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: "2rem" }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>Create your address</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 1.5rem", fontSize: "0.9rem" }}>
          on hypamail.me — invite-only. A password is generated for you.
        </p>
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <input
              className="input"
              name="username"
              placeholder="username"
              autoComplete="off"
              autoCapitalize="none"
              required
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: "none" }}
            />
            <span
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 0.75rem",
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderLeft: "none",
                color: "var(--muted)",
                fontSize: "0.9rem",
                whiteSpace: "nowrap",
              }}
            >
              @{DOMAIN}
            </span>
          </div>
          <input className="input" name="invite" placeholder="invite code" autoComplete="off" required />
          {SITE_KEY ? (
            <div className="cf-turnstile" data-sitekey={SITE_KEY} data-theme="dark" />
          ) : (
            <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
              (Turnstile not configured)
            </div>
          )}
          {state?.error && <div style={{ color: "#ff7a7a", fontSize: "0.85rem" }}>{state.error}</div>}
          <button className="btn btn-primary" type="submit" disabled={pending} style={{ marginTop: "0.25rem" }}>
            {pending ? "Creating…" : "Create address"}
          </button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "1.25rem", textAlign: "center" }}>
          Already have one? <Link href="/login" style={{ color: "var(--accent-2)" }}>Sign in</Link>
        </p>
      </div>
    </main>
  );
}

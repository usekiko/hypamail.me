"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, null);
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: "2rem" }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>Sign in</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 1.5rem", fontSize: "0.9rem" }}>
          to your hypamail.me inbox
        </p>
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <input className="input" name="username" placeholder="username" autoComplete="username" autoCapitalize="none" required />
          <input className="input" name="password" type="password" placeholder="password" autoComplete="current-password" required />
          {state?.error && (
            <div style={{ color: "#ff7a7a", fontSize: "0.85rem" }}>{state.error}</div>
          )}
          <button className="btn btn-primary" type="submit" disabled={pending} style={{ marginTop: "0.25rem" }}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "1.25rem", textAlign: "center" }}>
          No account? <Link href="/signup" style={{ color: "var(--accent-2)" }}>Create one</Link>
        </p>
      </div>
    </main>
  );
}

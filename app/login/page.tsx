"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, null);
  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 500 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
          alt="hypamail"
          style={{ height: 80, width: "auto", display: "block", marginBottom: "1.5rem" }}
        />
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 1.75rem" }}>Login</h1>
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="field-label">Username</label>
            <input className="inpt" name="username" placeholder="Username" autoComplete="username" autoCapitalize="none" required />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input className="inpt" name="password" type="password" placeholder="Password" autoComplete="current-password" required />
          </div>
          {state?.error && <div style={{ color: "#e06a6a", fontSize: "13px" }}>{state.error}</div>}
          <button className="btn btn-cancel" type="submit" disabled={pending} style={{ width: "100%", padding: "0.55rem" }}>
            {pending ? "Logging in…" : "Login"}
          </button>
        </form>
        <p style={{ fontSize: "13px", marginTop: "1.25rem" }}>
          <Link href="/signup" style={{ fontWeight: 600 }}>Create an account</Link>
        </p>
      </div>
    </main>
  );
}

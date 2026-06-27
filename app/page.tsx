import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  if (await getSession()) redirect("/mail");
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 540 }}>
        <div
          style={{
            display: "inline-block",
            fontSize: "0.72rem",
            letterSpacing: "0.12em",
            color: "var(--muted)",
            textTransform: "uppercase",
            border: "1px solid var(--border)",
            padding: "0.35rem 0.7rem",
            marginBottom: "1.25rem",
          }}
        >
          In development · not for public use yet
        </div>
        <h1 style={{ fontSize: "3rem", margin: "0 0 1rem", lineHeight: 1.05 }}>
          Your own private inbox.
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1.05rem", margin: "0 0 2rem" }}>
          A clean, private email address on hypamail.me. Pick a username, grab your
          inbox, read it anywhere. This is an early build — invite-only, and things
          may change or break while we&apos;re building it.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/signup">
            Create your address
          </Link>
          <Link className="btn btn-ghost" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

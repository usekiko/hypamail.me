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
      <div style={{ maxWidth: 560 }}>
        <div
          style={{
            display: "inline-block",
            fontSize: "12px",
            color: "#878787",
            border: "1px solid #1f1f1f",
            background: "#080808",
            padding: "4px 10px",
            marginBottom: "1.5rem",
          }}
        >
          in development · not for public use yet
        </div>
        <h1 style={{ fontSize: "2.5rem", margin: "0 0 1rem", lineHeight: 1.1, fontWeight: 700 }}>
          your own private inbox
        </h1>
        <p style={{ color: "#9a9a9a", fontSize: "15px", margin: "0 0 2rem", lineHeight: 1.6 }}>
          A clean, private email address on hypamail.me. Pick a username, grab your inbox,
          read it anywhere. Early build — invite-only, and things may change or break while
          we&apos;re building it.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/signup">
            Create your address
          </Link>
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

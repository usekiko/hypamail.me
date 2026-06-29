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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
          alt="hypamail"
          style={{ height: 120, width: "auto", margin: "0 auto 1.5rem", display: "block" }}
        />
        <h1 style={{ fontSize: "2.5rem", margin: "0 0 1rem", lineHeight: 1.1, fontWeight: 700 }}>
          your own private inbox
        </h1>
        <p style={{ color: "#9a9a9a", fontSize: "15px", margin: "0 0 2rem", lineHeight: 1.6 }}>
          A clean, private email address on hypamail.me. Pick a username, grab your inbox,
          read it anywhere. Early build — invite-only, and things may change or break while
          we&apos;re building it.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
          <Link className="btn btn-cancel" href="/signup" style={{ padding: "0.55rem 1.5rem", textAlign: "center" }}>
            Create your address
          </Link>
          <Link className="btn btn-cancel" href="/login" style={{ padding: "0.55rem 1.5rem", textAlign: "center" }}>
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

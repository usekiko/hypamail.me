import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ShineLink, SecondaryLink } from "@/components/ui/link-button";

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
        <h1
          style={{
            fontSize: "2.5rem",
            margin: "0 0 1rem",
            lineHeight: 1.1,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          your own private inbox
        </h1>
        <p
          style={{
            color: "var(--muted-foreground)",
            fontSize: "15px",
            margin: "0 0 2rem",
            lineHeight: 1.6,
          }}
        >
          A clean, private email address on hypamail.me. Pick a username, grab your inbox,
          read it anywhere. Early build — invite-only, and things may change or break while
          we&apos;re building it.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center", flexWrap: "wrap" }}>
          <ShineLink href="/signup">
            Create your address
          </ShineLink>
          <SecondaryLink href="/login" size="lg">
            Sign in
          </SecondaryLink>
        </div>
      </div>
    </main>
  );
}

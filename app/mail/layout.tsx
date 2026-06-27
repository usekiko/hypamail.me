import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { logoutAction } from "../actions";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.9rem 1.25rem",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          background: "var(--bg)",
          zIndex: 10,
        }}
      >
        <Link href="/mail" style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
          hypamail
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{session.email}</span>
          <form action={logoutAction}>
            <button className="btn btn-ghost" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div style={{ flex: 1, width: "100%", maxWidth: 820, margin: "0 auto", padding: "1.25rem" }}>
        {children}
      </div>
    </div>
  );
}

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
          padding: "10px 16px",
          borderBottom: "1px solid #1f1f1f",
          background: "#080808",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Link href="/mail" style={{ fontWeight: 700 }}>
          hypamail
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#878787", fontSize: "13px" }}>{session.email}</span>
          <form action={logoutAction}>
            <button className="btn btn-cancel" type="submit">sign out</button>
          </form>
        </div>
      </header>
      <div style={{ flex: 1, width: "100%", maxWidth: 900, margin: "0 auto", padding: "16px" }}>
        {children}
      </div>
    </div>
  );
}

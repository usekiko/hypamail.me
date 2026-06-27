import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { logoutAction } from "../actions";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        {children}
        <div style={{ marginTop: "2rem", textAlign: "center", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center" }}>
          <span style={{ color: "#878787", fontSize: "13px" }}>Logged in as {session.email}</span>
          <form action={logoutAction}>
            <button className="btn btn-cancel" type="submit" style={{ padding: "0.55rem 2rem" }}>sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { SecondaryLink } from "@/components/ui/link-button";
import { MIcon } from "@/components/ui/material-icon";
import SignOut from "../ui/SignOut";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <main style={{ minHeight: "100dvh", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 900, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <Link href="/mail" style={{ display: "flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
              alt="hypamail"
              style={{ height: 32, width: "auto", display: "block" }}
            />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
            <span
              style={{
                color: "var(--muted-foreground)",
                fontSize: "13px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session.email}
            </span>
            <SecondaryLink href="/mail/settings" size="sm" iconOnly aria-label="Settings" title="Settings">
              <MIcon name="settings" size={16} />
            </SecondaryLink>
            {/* SignOut (not a bare logout form): it wipes the unlocked mail key
                from sessionStorage before the server session is revoked. */}
            <SignOut />
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

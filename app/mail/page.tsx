import Link from "next/link";
import { getSession } from "@/lib/session";
import { listInbox, type MailSummary } from "@/lib/jmap";

export const dynamic = "force-dynamic";

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function sender(m: MailSummary): string {
  const f = m.from[0];
  return f ? f.name || f.email : "(unknown)";
}

export default async function Inbox() {
  const session = (await getSession())!;
  let mail: MailSummary[] = [];
  let error: string | null = null;
  try {
    mail = await listInbox(session.email, session.password, session.accountId);
  } catch {
    error = "Couldn't load your inbox. Try signing in again.";
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.4rem", margin: "0 0 1rem" }}>Inbox</h1>
      {error && <div style={{ color: "#ff7a7a" }}>{error}</div>}
      {!error && mail.length === 0 && (
        <div style={{ color: "var(--muted)", padding: "3rem 0", textAlign: "center" }}>
          No messages yet.
        </div>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }} className="card">
        {mail.map((m, i) => (
          <li key={m.id} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
            <Link
              href={`/mail/${m.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: "0.75rem",
                alignItems: "baseline",
                padding: "0.85rem 1rem",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: m.unread ? "var(--accent-2)" : "transparent",
                  alignSelf: "center",
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                  <strong style={{ fontWeight: m.unread ? 700 : 500, whiteSpace: "nowrap" }}>
                    {sender(m)}
                  </strong>
                  <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.subject || "(no subject)"}
                  </span>
                </span>
                <span style={{ color: "var(--muted)", fontSize: "0.85rem", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.preview}
                </span>
              </span>
              <span style={{ color: "var(--muted)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                {when(m.receivedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

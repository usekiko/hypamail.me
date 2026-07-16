import Link from "next/link";
import { getSession } from "@/lib/session";
import { listInbox, type MailSummary } from "@/lib/jmap";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";

export const dynamic = "force-dynamic";

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
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

  const unread = mail.filter((m) => m.unread).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "12px",
        }}
      >
        <h1 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Inbox
        </h1>
        <span style={{ color: "var(--muted-foreground)", fontSize: "12px" }}>
          {mail.length} {mail.length === 1 ? "message" : "messages"}
          {unread > 0 && ` · ${unread} unread`}
        </span>
      </div>

      {error && <AlertMessage tone="error">{error}</AlertMessage>}

      {!error && mail.length === 0 && (
        <div
          className="panel"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
            color: "var(--muted-foreground)",
            padding: "3.5rem 2rem",
            textAlign: "center",
          }}
        >
          <MIcon name="inbox" size={32} />
          <span>No messages yet.</span>
        </div>
      )}

      {mail.length > 0 && (
        <div className="tbl">
          <table>
            <colgroup>
              <col style={{ width: "26%" }} />
              <col />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th style={{ textAlign: "right" }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {mail.map((m) => (
                <tr key={m.id}>
                  <td
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: m.unread ? 600 : 400,
                      color: m.unread ? "var(--foreground)" : "var(--muted-foreground)",
                    }}
                  >
                    <Link href={`/mail/${m.id}`}>{sender(m)}</Link>
                  </td>
                  <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Link href={`/mail/${m.id}`}>
                      <span style={{ fontWeight: m.unread ? 600 : 400 }}>
                        {m.subject || "(no subject)"}
                      </span>
                      <span style={{ color: "var(--muted-foreground)" }}> — {m.preview}</span>
                    </Link>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {m.spam && (
                      <span
                        style={{
                          display: "inline-block",
                          marginRight: 8,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "0.7px solid rgba(234,179,8,0.3)",
                          background: "rgba(234,179,8,0.12)",
                          color: "rgb(254,240,138)",
                          fontSize: "11px",
                          fontWeight: 500,
                          verticalAlign: "middle",
                        }}
                      >
                        Spam
                      </span>
                    )}
                    <span style={{ color: "var(--muted-foreground)" }}>{when(m.receivedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

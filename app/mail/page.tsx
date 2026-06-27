import Link from "next/link";
import { getSession } from "@/lib/session";
import { listInbox, type MailSummary } from "@/lib/jmap";

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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
        <h1 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 700 }}>inbox</h1>
        <span style={{ color: "#878787", fontSize: "12px" }}>{mail.length} messages</span>
      </div>

      {error && <div style={{ color: "#e06a6a" }}>{error}</div>}
      {!error && mail.length === 0 && (
        <div style={{ color: "#878787", padding: "2.5rem", textAlign: "center" }}>
          No messages yet.
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
                  <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: m.unread ? 700 : 400 }}>
                    <Link href={`/mail/${m.id}`}>
                      {m.unread && <span style={{ color: "#2e6f40", marginRight: 6 }}>●</span>}
                      {sender(m)}
                    </Link>
                  </td>
                  <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Link href={`/mail/${m.id}`}>
                      <span style={{ fontWeight: m.unread ? 700 : 400 }}>{m.subject || "(no subject)"}</span>
                      <span style={{ color: "#878787" }}> — {m.preview}</span>
                    </Link>
                  </td>
                  <td style={{ textAlign: "right", color: "#878787", whiteSpace: "nowrap" }}>{when(m.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

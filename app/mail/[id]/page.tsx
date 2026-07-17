import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEmailMeta, markSeen } from "@/lib/jmap";
import { deleteEmailAction } from "../actions";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { SecondaryLink } from "@/components/ui/link-button";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import MessageBody from "../MessageBody";

export const dynamic = "force-dynamic";

// Zero-access rendering: the server only ever sees the cleartext headers
// (sender, subject, date — Stalwart keeps those for the list view). The body
// is PGP ciphertext, streamed to <MessageBody /> and decrypted in the browser
// with a key the server never holds. Sanitization (strict text-only allowlist,
// no images/scripts/remote content) happens client-side in lib/client/mail.ts,
// backed by the page CSP.
export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await getSession())!;
  const mail = await getEmailMeta(session.email, session.mailPassword, session.accountId, id);
  if (!mail) notFound();
  if (mail.unread) {
    try {
      await markSeen(session.email, session.mailPassword, session.accountId, id);
    } catch {}
  }

  const from = mail.from[0];

  return (
    <article>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "12px" }}>
        <SecondaryLink href="/mail" variant="ghost" size="sm">
          <MIcon name="arrow_back" size={16} style={{ marginRight: 6 }} />
          Inbox
        </SecondaryLink>
        <form action={deleteEmailAction} style={{ display: "flex" }}>
          <input type="hidden" name="id" value={mail.id} />
          <SecondaryButton type="submit" size="sm" danger>
            <MIcon name="delete" size={16} style={{ marginRight: 6 }} />
            Delete
          </SecondaryButton>
        </form>
      </div>

      {mail.spam && (
        <AlertMessage tone="warning" icon={<MIcon name="report" size={16} style={{ marginRight: 8, marginTop: 2 }} />}>
          Flagged as probable spam. Be cautious with links, attachments, and anything asking for personal info.
        </AlertMessage>
      )}

      <div className="panel" style={{ padding: "16px", marginBottom: "10px" }}>
        <h1 style={{ fontSize: "1.15rem", margin: "0 0 0.6rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{mail.subject || "(no subject)"}</h1>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted-foreground)", fontSize: "13px", flexWrap: "wrap", gap: "0.5rem" }}>
          <span>
            <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{from ? from.name || from.email : "(unknown)"}</span>
            {from?.name && <span> &lt;{from.email}&gt;</span>}
          </span>
          <span>{new Date(mail.receivedAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="panel" style={{ padding: "16px", lineHeight: 1.6, overflowWrap: "anywhere" }}>
        <MessageBody emailId={mail.id} />
      </div>
      <p style={{ color: "var(--muted-foreground)", fontSize: "12px", marginTop: "8px", display: "flex", alignItems: "flex-start", gap: "6px" }}>
        <MIcon name="lock" size={14} style={{ marginTop: "2px" }} />
        <span>This message is stored encrypted — it was decrypted just now, on your device.
        Images, scripts, and all remote content are stripped, which blocks tracking pixels
        and malicious code. Messages may look plainer than in other mail apps.</span>
      </p>
    </article>
  );
}

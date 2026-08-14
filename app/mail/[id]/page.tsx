import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getEmailMeta, markSeen } from "@/lib/jmap";
import { deleteEmailAction } from "../actions";
import { Button, Card, buttonVariants } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import MessageBody from "../MessageBody";

export const dynamic = "force-dynamic";

// The server sees only the cleartext headers Stalwart keeps for the list view.
// The body is ciphertext, streamed to <MessageBody /> and decrypted in the
// browser; sanitizing happens there too (lib/client/mail.ts), behind the CSP.
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href="/mail" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <MIcon name="arrow_back" size={16} style={{ marginRight: 6 }} />
          Inbox
        </Link>
        <div className="flex items-center gap-2">
          {/* Rendered only for accounts with sending enabled; sendMail re-checks. */}
          {session.user.allowSend && from && (
            <Link
              href={`/mail/compose?${new URLSearchParams({
                to: from.email,
                subject: /^re:/i.test(mail.subject || "") ? mail.subject! : `Re: ${mail.subject || ""}`,
                ...(mail.messageId ? { inReplyTo: mail.messageId, references: mail.messageId } : {}),
              })}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <MIcon name="reply" size={16} style={{ marginRight: 6 }} />
              Reply
            </Link>
          )}
          <form action={deleteEmailAction} className="flex">
            <input type="hidden" name="id" value={mail.id} />
            <Button type="submit" variant="danger-soft" size="sm">
              <MIcon name="delete" size={16} style={{ marginRight: 6 }} />
              Delete
            </Button>
          </form>
        </div>
      </div>

      {mail.spam && (
        <Alert tone="warning" icon={<MIcon name="report" size={16} style={{ marginRight: 8, marginTop: 2 }} />}>
          Flagged as probable spam. Be cautious with links, attachments, and anything asking for personal info.
        </Alert>
      )}

      <Card className="mb-2.5">
        <Card.Header>
          <Card.Title className="m-0 text-[1.15rem] font-semibold tracking-tight">
            {mail.subject || "(no subject)"}
          </Card.Title>
          <Card.Description className="mt-2.5 flex flex-wrap justify-between gap-2 text-[13px] text-muted">
            <span>
              <span className="font-medium text-foreground">{from ? from.name || from.email : "(unknown)"}</span>
              {from?.name && <span> &lt;{from.email}&gt;</span>}
            </span>
            <span>{new Date(mail.receivedAt).toLocaleString()}</span>
          </Card.Description>
        </Card.Header>
      </Card>

      <Card>
        <Card.Content className="leading-relaxed [overflow-wrap:anywhere]">
          <MessageBody emailId={mail.id} />
        </Card.Content>
      </Card>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
        <MIcon name="lock" size={14} style={{ marginTop: "2px" }} />
        <span>This message is stored encrypted. It was decrypted just now, on your device.
        Images, scripts, and all remote content are stripped, which blocks tracking pixels
        and malicious code. Messages may look plainer than in other mail apps.</span>
      </p>
    </article>
  );
}

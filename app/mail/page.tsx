import { getSession } from "@/lib/session";
import { listInbox, type MailSummary } from "@/lib/jmap";
import { EmptyState } from "@heroui/react";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import InboxTable from "./InboxTable";

export const dynamic = "force-dynamic";

export default async function Inbox() {
  const session = (await getSession())!;
  let mail: MailSummary[] = [];
  let error: string | null = null;
  try {
    mail = await listInbox(session.email, session.mailPassword, session.accountId);
  } catch {
    error = "Couldn't load your inbox. Try signing in again.";
  }

  const unread = mail.filter((m) => m.unread).length;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="m-0 text-[1.1rem] font-semibold tracking-tight">Inbox</h1>
        <span className="text-xs text-muted">
          {mail.length} {mail.length === 1 ? "message" : "messages"}
          {unread > 0 && ` · ${unread} unread`}
        </span>
      </div>

      {error && <AlertMessage tone="error">{error}</AlertMessage>}

      {!error && mail.length === 0 && (
        <EmptyState className="gap-3 py-14 text-muted">
          <MIcon name="inbox" size={32} />
          <span>No messages yet.</span>
        </EmptyState>
      )}

      {mail.length > 0 && <InboxTable mail={mail} />}
    </div>
  );
}

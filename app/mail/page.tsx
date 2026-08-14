import { getSession } from "@/lib/session";
import { listInbox, type MailSummary } from "@/lib/jmap";
import { EmptyState } from "@heroui/react";
import { Alert } from "../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import InboxTable from "./InboxTable";

export const dynamic = "force-dynamic";

export default async function Inbox() {
  const session = (await getSession())!;
  let mail: MailSummary[] = [];
  let total = 0;
  let unread = 0;
  let error: string | null = null;
  try {
    ({ mail, total, unread } = await listInbox(
      session.email,
      session.mailPassword,
      session.accountId
    ));
  } catch {
    error = "Couldn't load your inbox. Try signing in again.";
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="m-0 text-[1.1rem] font-semibold tracking-tight">Inbox</h1>
        <span className="text-xs text-muted">
          {total} {total === 1 ? "message" : "messages"}
          {unread > 0 && ` · ${unread} unread`}
        </span>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* EmptyState ships as bare padding/type, so the centring is ours. The
          icon is desktop-only: on a phone the bare line reads better. */}
      {!error && total === 0 && (
        <EmptyState className="flex flex-col items-center justify-center gap-3 py-20 text-center sm:py-14">
          <MIcon name="inbox" size={32} className="hidden sm:block" />
          <span>No messages yet.</span>
        </EmptyState>
      )}

      {mail.length > 0 && <InboxTable initialMail={mail} total={total} />}
    </div>
  );
}

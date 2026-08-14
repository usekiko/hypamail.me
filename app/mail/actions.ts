"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { deleteEmail, listInbox, type MailSummary } from "@/lib/jmap";

// Next page for the "load more" button. The first page is rendered on the
// server; this is the only reason the inbox needs an action at all.
export async function loadMoreInbox(
  position: number
): Promise<{ mail?: MailSummary[]; total?: number; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Sign in again." };
  try {
    return await listInbox(
      session.email,
      session.mailPassword,
      session.accountId,
      Math.max(0, Math.floor(position))
    );
  } catch {
    return { error: "Couldn't load more messages." };
  }
}

export async function deleteEmailAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "");
  const session = await getSession();
  if (!session) redirect("/login");
  if (id) await deleteEmail(session.email, session.mailPassword, session.accountId, id);
  redirect("/mail");
}

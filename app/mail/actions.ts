"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { deleteEmail } from "@/lib/jmap";

export async function deleteEmailAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "");
  const session = await getSession();
  if (!session) redirect("/login");
  if (id) await deleteEmail(session.email, session.password, session.accountId, id);
  redirect("/mail");
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ComposeForm from "./ComposeForm";

export const dynamic = "force-dynamic";

// Gated server-side as well as in the UI: someone who guesses this URL without
// the permission gets bounced before the form ever renders.
export default async function Compose({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.allowSend) redirect("/mail");

  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]) || "";

  return (
    <ComposeForm
      from={session.email}
      initialTo={one("to")}
      initialSubject={one("subject")}
      inReplyTo={one("inReplyTo")}
      references={one("references")}
    />
  );
}

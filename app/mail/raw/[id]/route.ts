// Streams the raw (PGP-encrypted) message blob to the signed-in user's browser
// for client-side decryption. The server relays ciphertext it cannot read.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getEmailMeta, downloadRaw } from "@/lib/jmap";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });
  const { id } = await params;

  // Resolve the blob through Email/get on the user's own account, so only the
  // owner's messages are reachable regardless of what id is supplied.
  const meta = await getEmailMeta(session.email, session.mailPassword, session.accountId, id);
  if (!meta) return new NextResponse("not found", { status: 404 });

  const raw = await downloadRaw(session.email, session.mailPassword, session.accountId, meta.blobId);
  return new NextResponse(raw, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}

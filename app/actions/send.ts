"use server";

// Composing and sending. Off for everyone by default: allow_send is granted per
// account from HypaTools and checked here on every call. Hiding the compose
// button is cosmetic — this is the check that actually stops a forged request.
import { getSession } from "@/lib/session";
import { buildMime, sendRaw } from "@/lib/smtp";
import { fileSentCopy } from "@/lib/sent";
import { hashIp, isRateLimited, recordAttempt } from "@/lib/db";
import {
  SEND_MAX,
  SEND_MAX_RECIPIENTS,
  SEND_WINDOW,
  clientIpHash,
} from "./shared";

const MAX_SUBJECT = 300;
const MAX_BODY = 100_000;
const ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;.]+(\.[^\s@<>",;.]+)+$/;

export interface SendResult {
  error?: string;
  ok?: boolean;
  sentCopyFailed?: boolean; // delivered, but filing the Sent copy didn't work
}

// Splits on commas, drops empties, and rejects anything with a control
// character in it — a bare newline in an address or subject is how header
// injection gets a second set of recipients onto a message.
function parseAddresses(raw: string): string[] | null {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.some((p) => /[\r\n\0]/.test(p) || !ADDRESS.test(p))) return null;
  return parts;
}

export async function sendMail(payload: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): Promise<SendResult> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  if (!session.user.allowSend) return { error: "Sending isn't enabled for this account." };

  const userKeyHash = hashIp(`send:${session.userId}`);
  const ipHash = await clientIpHash();
  if (
    (await isRateLimited(userKeyHash, "send", SEND_MAX, SEND_WINDOW)) ||
    (await isRateLimited(ipHash, "send", SEND_MAX, SEND_WINDOW))
  ) {
    return { error: "You've sent a lot recently. Try again in a little while." };
  }

  const to = parseAddresses(payload.to || "");
  const cc = parseAddresses(payload.cc || "");
  if (!to || !cc) return { error: "One of those addresses doesn't look valid." };
  if (to.length === 0) return { error: "Add at least one recipient." };
  if (to.length + cc.length > SEND_MAX_RECIPIENTS) {
    return { error: `At most ${SEND_MAX_RECIPIENTS} recipients per message.` };
  }

  const subject = String(payload.subject || "").replace(/[\r\n\0]/g, " ").slice(0, MAX_SUBJECT);
  const body = String(payload.body || "");
  if (!body.trim()) return { error: "Write something first." };
  if (body.length > MAX_BODY) return { error: "That message is too long." };

  const { raw } = await buildMime({
    from: session.email,
    to,
    cc,
    subject,
    text: body,
    inReplyTo: payload.inReplyTo?.replace(/[\r\n\0]/g, "") || undefined,
    references: payload.references
      ? payload.references.replace(/[\r\n\0]/g, "").split(/\s+/).filter(Boolean)
      : undefined,
  });

  try {
    await sendRaw(raw, { from: session.email, to: [...to, ...cc] });
  } catch {
    return { error: "Couldn't send that right now. Try again shortly." };
  }
  await recordAttempt(userKeyHash, "send");
  await recordAttempt(ipHash, "send");

  // The message is already gone by this point, so a failure here is worth
  // reporting but must not read as "sending failed".
  try {
    await fileSentCopy({
      email: session.email,
      mailPassword: session.mailPassword,
      accountId: session.accountId,
      pgpPublicKey: session.user.pgpPublicKey,
      raw,
    });
  } catch {
    return { ok: true, sentCopyFailed: true };
  }
  return { ok: true };
}

// Lets the client decide whether to render the compose entry point at all.
// Cosmetic only — sendMail re-checks regardless.
export async function canSend(): Promise<{ allowed: boolean }> {
  const session = await getSession();
  return { allowed: !!session?.user.allowSend };
}

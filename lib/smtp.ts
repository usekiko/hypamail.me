// Outbound submission to the relay on the proxy VPS. Server-side only.
//
// The origin can't deliver mail itself — its egress on 25 is blocked and its IP
// must never appear in a message anyway — so everything goes to the relay, which
// strips the Received headers naming us and DKIM-signs before delivering.
// Host and port come from the environment: they are infrastructure, not code.
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { Transporter } from "nodemailer";

const RELAY_HOST = process.env.MAIL_RELAY_HOST;
const RELAY_PORT = Number(process.env.MAIL_RELAY_PORT || 587);
const DOMAIN = process.env.MAIL_DOMAIN || "hypamail.me";

export interface OutgoingMail {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
}

let transport: Transporter | null = null;

function relay(): Transporter {
  if (!RELAY_HOST) throw new Error("MAIL_RELAY_HOST not set");
  if (!transport) {
    transport = nodemailer.createTransport({
      host: RELAY_HOST,
      port: RELAY_PORT,
      secure: false,
      requireTLS: true,
      // The relay presents a self-signed certificate. Accepting it is safe here
      // and nowhere else: that listener is bound to one address, firewalled to
      // this host, and authorises by source IP, so nobody else is on the path
      // to impersonate it.
      tls: { rejectUnauthorized: false },
      pool: true,
      maxConnections: 2,
    });
  }
  return transport;
}

/**
 * Build the RFC 5322 bytes once. Both the transmitted message and the Sent copy
 * come from this, so what the recipient receives and what the user later reads
 * back are the same message rather than two reconstructions that can drift.
 */
export async function buildMime(mail: OutgoingMail): Promise<{ raw: Buffer; messageId: string }> {
  const messageId = `<${crypto.randomUUID()}@${DOMAIN}>`;
  const raw = await new MailComposer({
    from: mail.from,
    to: mail.to,
    cc: mail.cc?.length ? mail.cc : undefined,
    subject: mail.subject,
    text: mail.text,
    inReplyTo: mail.inReplyTo,
    references: mail.references?.length ? mail.references.join(" ") : undefined,
    messageId,
    date: new Date(),
    // No X-Mailer / User-Agent: the relay strips them anyway, but not emitting
    // them at all means one less thing describing our stack.
    headers: {},
  })
    .compile()
    .build();

  return { raw: Buffer.from(raw), messageId };
}

/** Hands the prebuilt message to the relay. Envelope is explicit, not inferred. */
export async function sendRaw(
  raw: Buffer,
  envelope: { from: string; to: string[] }
): Promise<void> {
  await relay().sendMail({ envelope, raw });
}

// JMAP client for Stalwart, server-side only. Mail access uses the user's own
// internal Basic credentials; provisioning uses the admin ones (lib/admin.ts).
// Only touches headers (which Stalwart keeps cleartext) and opaque ciphertext —
// bodies are decrypted in the browser, never here.

const JMAP_URL = process.env.JMAP_URL || "http://127.0.0.1:8088";
const USING_MAIL = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

export function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

type MethodCall = [string, Record<string, unknown>, string];

export async function jmap(auth: string, using: string[], methodCalls: MethodCall[]) {
  const res = await fetch(`${JMAP_URL}/jmap/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ using, methodCalls }),
  });
  if (!res.ok) throw new Error(`JMAP request failed: ${res.status}`);
  const body = await res.json();
  if (body.type) throw new Error(`JMAP error: ${body.type}`);
  return body.methodResponses as [string, Record<string, unknown>, string][];
}

// Verify credentials and return the user's mail account id (or null if invalid).
export async function authenticate(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${JMAP_URL}/jmap/session`, {
    headers: { Authorization: basicAuth(email, password) },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`session failed: ${res.status}`);
  const session = await res.json();
  return session.primaryAccounts?.["urn:ietf:params:jmap:mail"] ?? null;
}

// Inbox id, plus Junk if the account has one. Junk is shown *in* the inbox and
// merely labelled, so a misflagged signup confirmation or OTP never disappears.
async function inboxAndJunk(
  auth: string,
  accountId: string
): Promise<{ inbox: string; junk: string | null }> {
  const [getRes] = await jmap(auth, USING_MAIL, [
    ["Mailbox/get", { accountId, properties: ["role"] }, "0"],
  ]);
  const list = (getRes[1].list as Array<{ id: string; role: string }>) || [];
  const inbox = list.find((m) => m.role === "inbox");
  const junk = list.find((m) => m.role === "junk");
  if (!inbox) throw new Error("no inbox mailbox");
  return { inbox: inbox.id, junk: junk?.id ?? null };
}

export interface MailSummary {
  id: string;
  from: { name?: string; email: string }[];
  subject: string | null;
  receivedAt: string;
  unread: boolean;
  spam: boolean;
}

export const INBOX_PAGE = 50;

// One page of the inbox, newest first, plus the full count so the caller knows
// whether there's more behind it.
export async function listInbox(
  email: string,
  password: string,
  accountId: string,
  position = 0,
  limit = INBOX_PAGE
): Promise<{ mail: MailSummary[]; total: number; unread: number }> {
  const auth = basicAuth(email, password);
  const { inbox, junk } = await inboxAndJunk(auth, accountId);
  // Show Inbox + Junk together; tag Junk messages as spam instead of hiding them.
  const filter = junk
    ? { operator: "OR", conditions: [{ inMailbox: inbox }, { inMailbox: junk }] }
    : { inMailbox: inbox };
  const responses = await jmap(auth, USING_MAIL, [
    [
      "Email/query",
      {
        accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        position,
        limit,
        calculateTotal: true,
      },
      "0",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
        properties: ["from", "subject", "receivedAt", "keywords", "mailboxIds"],
      },
      "1",
    ],
    // Unread across the whole mailbox, not just this page — otherwise the count
    // in the header would drift every time you loaded more.
    [
      "Email/query",
      {
        accountId,
        filter: { operator: "AND", conditions: [filter, { notKeyword: "$seen" }] },
        limit: 1,
        calculateTotal: true,
      },
      "2",
    ],
  ]);
  const list = (responses[1][1].list as Array<Record<string, unknown>>) || [];
  const mail = list.map((e) => ({
    id: e.id as string,
    from: (e.from as MailSummary["from"]) || [],
    subject: (e.subject as string) ?? null,
    receivedAt: e.receivedAt as string,
    unread: !((e.keywords as Record<string, boolean>) || {})["$seen"],
    spam: junk ? !!((e.mailboxIds as Record<string, boolean>) || {})[junk] : false,
  }));
  // Stalwart honours calculateTotal, but fall back to what we can see rather
  // than reporting zero if a future backend ever skips it.
  const total = (responses[0][1].total as number | undefined) ?? position + mail.length;
  const unread = (responses[2][1].total as number | undefined) ?? mail.filter((m) => m.unread).length;
  return { mail, total, unread };
}

export interface MailMeta extends MailSummary {
  to: { name?: string; email: string }[];
  blobId: string;
}

// Header metadata + the raw-blob id. The body itself is fetched through
// downloadRaw and decrypted in the browser.
export async function getEmailMeta(
  email: string,
  password: string,
  accountId: string,
  id: string
): Promise<MailMeta | null> {
  const auth = basicAuth(email, password);
  const { junk } = await inboxAndJunk(auth, accountId);
  const responses = await jmap(auth, USING_MAIL, [
    [
      "Email/get",
      {
        accountId,
        ids: [id],
        properties: ["blobId", "from", "to", "subject", "receivedAt", "keywords", "mailboxIds"],
      },
      "0",
    ],
  ]);
  const list = (responses[0][1].list as Array<Record<string, unknown>>) || [];
  const e = list[0];
  if (!e) return null;
  return {
    id: e.id as string,
    blobId: e.blobId as string,
    from: (e.from as MailMeta["from"]) || [],
    to: (e.to as MailMeta["to"]) || [],
    subject: (e.subject as string) ?? null,
    receivedAt: e.receivedAt as string,
    unread: !((e.keywords as Record<string, boolean>) || {})["$seen"],
    spam: junk ? !!((e.mailboxIds as Record<string, boolean>) || {})[junk] : false,
  };
}

// Stream the raw (encrypted) RFC 5322 message bytes.
export async function downloadRaw(
  email: string,
  password: string,
  accountId: string,
  blobId: string
): Promise<ArrayBuffer> {
  const res = await fetch(
    `${JMAP_URL}/jmap/download/${encodeURIComponent(accountId)}/${encodeURIComponent(blobId)}/raw?accept=message/rfc822`,
    { headers: { Authorization: basicAuth(email, password) } }
  );
  if (!res.ok) throw new Error(`blob download failed: ${res.status}`);
  return res.arrayBuffer();
}

export async function markSeen(
  email: string,
  password: string,
  accountId: string,
  id: string
): Promise<void> {
  const auth = basicAuth(email, password);
  await jmap(auth, USING_MAIL, [
    ["Email/set", { accountId, update: { [id]: { "keywords/$seen": true } } }, "0"],
  ]);
}

export async function deleteEmail(
  email: string,
  password: string,
  accountId: string,
  id: string
): Promise<void> {
  const auth = basicAuth(email, password);
  await jmap(auth, USING_MAIL, [
    ["Email/set", { accountId, destroy: [id] }, "0"],
  ]);
}

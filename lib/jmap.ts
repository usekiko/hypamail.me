// JMAP client for Stalwart. Runs server-side only (talks to the localhost admin
// listener on the VPS). User mail access uses the user's own Basic credentials;
// provisioning uses the admin credentials.

const JMAP_URL = process.env.JMAP_URL || "http://127.0.0.1:8088";
const USING_MAIL = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

export function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

type MethodCall = [string, Record<string, unknown>, string];

export async function jmap(auth: string, using: string[], methodCalls: MethodCall[]) {
  const res = await fetch(`${JMAP_URL}/jmap`, {
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

async function inboxId(auth: string, accountId: string): Promise<string> {
  const [getRes] = await jmap(auth, USING_MAIL, [
    ["Mailbox/get", { accountId, properties: ["role"] }, "0"],
  ]);
  const list = (getRes[1].list as Array<{ id: string; role: string }>) || [];
  const inbox = list.find((m) => m.role === "inbox");
  if (!inbox) throw new Error("no inbox mailbox");
  return inbox.id;
}

export interface MailSummary {
  id: string;
  from: { name?: string; email: string }[];
  subject: string | null;
  preview: string;
  receivedAt: string;
  unread: boolean;
}

export async function listInbox(
  email: string,
  password: string,
  accountId: string,
  limit = 50
): Promise<MailSummary[]> {
  const auth = basicAuth(email, password);
  const mbox = await inboxId(auth, accountId);
  const responses = await jmap(auth, USING_MAIL, [
    [
      "Email/query",
      {
        accountId,
        filter: { inMailbox: mbox },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "0",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
        properties: ["from", "subject", "preview", "receivedAt", "keywords"],
      },
      "1",
    ],
  ]);
  const list = (responses[1][1].list as Array<Record<string, unknown>>) || [];
  return list.map((e) => ({
    id: e.id as string,
    from: (e.from as MailSummary["from"]) || [],
    subject: (e.subject as string) ?? null,
    preview: (e.preview as string) || "",
    receivedAt: e.receivedAt as string,
    unread: !((e.keywords as Record<string, boolean>) || {})["$seen"],
  }));
}

export interface MailDetail extends MailSummary {
  to: { name?: string; email: string }[];
  html: string | null;
  text: string | null;
}

export async function getEmail(
  email: string,
  password: string,
  accountId: string,
  id: string
): Promise<MailDetail | null> {
  const auth = basicAuth(email, password);
  const responses = await jmap(auth, USING_MAIL, [
    [
      "Email/get",
      {
        accountId,
        ids: [id],
        properties: [
          "from", "to", "subject", "preview", "receivedAt", "keywords",
          "htmlBody", "textBody", "bodyValues",
        ],
        fetchHTMLBodyValues: true,
        fetchTextBodyValues: true,
      },
      "0",
    ],
  ]);
  const list = (responses[0][1].list as Array<Record<string, unknown>>) || [];
  const e = list[0];
  if (!e) return null;
  const bodyValues = (e.bodyValues as Record<string, { value: string }>) || {};
  const partText = (parts: Array<{ partId?: string }> | undefined) =>
    (parts || []).map((p) => (p.partId ? bodyValues[p.partId]?.value : "")).join("\n");
  return {
    id: e.id as string,
    from: (e.from as MailDetail["from"]) || [],
    to: (e.to as MailDetail["to"]) || [],
    subject: (e.subject as string) ?? null,
    preview: (e.preview as string) || "",
    receivedAt: e.receivedAt as string,
    unread: !((e.keywords as Record<string, boolean>) || {})["$seen"],
    html: partText(e.htmlBody as Array<{ partId?: string }>) || null,
    text: partText(e.textBody as Array<{ partId?: string }>) || null,
  };
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

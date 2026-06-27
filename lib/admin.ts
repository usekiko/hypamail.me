// Server-side admin operations: provision new mailbox accounts (with a disk
// quota) via Stalwart's management JMAP, and verify Cloudflare Turnstile tokens.
import { jmap, basicAuth } from "./jmap";
import { randomBytes } from "crypto";

const JMAP_URL = process.env.JMAP_URL || "http://127.0.0.1:8088";

// Strong, readable password (ambiguous chars removed). ~16 chars easily clears
// Stalwart's minimum strength requirement.
export function generatePassword(len = 16): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}
const USING_ADMIN = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];
const QUOTA_KEY = "maxDiskQuota";

function adminAuth(): string {
  const user = process.env.STALWART_ADMIN_USER;
  const pass = process.env.STALWART_ADMIN_PASS;
  if (!user || !pass) throw new Error("STALWART_ADMIN_USER/PASS not set");
  return basicAuth(user, pass);
}

async function mgmtAccount(auth: string): Promise<string> {
  const res = await fetch(`${JMAP_URL}/jmap/session`, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`session failed: ${res.status}`);
  const s = await res.json();
  return s.primaryAccounts["urn:stalwart:jmap"];
}

async function domainId(auth: string, acct: string): Promise<string> {
  const [r] = await jmap(auth, USING_ADMIN, [
    ["x:Domain/get", { accountId: acct, ids: null, properties: ["name"] }, "0"],
  ]);
  const list = (r[1].list as Array<{ id: string; name: string }>) || [];
  const d = list.find((x) => x.name === process.env.MAIL_DOMAIN);
  if (!d) throw new Error("domain not found");
  return d.id;
}

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/;
const RESERVED = new Set([
  "admin", "administrator", "postmaster", "abuse", "root", "inbox", "hostmaster",
  "webmaster", "security", "noreply", "no-reply", "support", "mailer-daemon",
]);

export function validateUsername(username: string): string | null {
  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) return "Username must be 2-32 chars: letters, digits, . _ -";
  if (RESERVED.has(u)) return "That username is reserved";
  return null;
}

export async function usernameTaken(username: string): Promise<boolean> {
  const auth = adminAuth();
  const acct = await mgmtAccount(auth);
  const [r] = await jmap(auth, USING_ADMIN, [
    ["x:Account/get", { accountId: acct, ids: null, properties: ["name", "emailAddress"] }, "0"],
  ]);
  const list = (r[1].list as Array<{ name: string; emailAddress?: string }>) || [];
  const target = `${username}@${process.env.MAIL_DOMAIN}`;
  return list.some((a) => a.name === username || a.emailAddress === target);
}

export async function provisionAccount(username: string, password: string): Promise<void> {
  const auth = adminAuth();
  const acct = await mgmtAccount(auth);
  const did = await domainId(auth, acct);
  const quota = parseInt(process.env.ACCOUNT_QUOTA_BYTES || "1073741824", 10);
  const [r] = await jmap(auth, USING_ADMIN, [
    [
      "x:Account/set",
      {
        accountId: acct,
        create: {
          a: {
            "@type": "User",
            name: username,
            domainId: did,
            description: "",
            roles: { "@type": "User" },
            quotas: { [QUOTA_KEY]: quota },
            credentials: { "0": { "@type": "Password", secret: password } },
          },
        },
      },
      "0",
    ],
  ]);
  const res = r[1] as { created?: unknown; notCreated?: unknown };
  if (!res.created) throw new Error("provision failed: " + JSON.stringify(res.notCreated));
}

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return !!data.success;
  } catch {
    return false;
  }
}

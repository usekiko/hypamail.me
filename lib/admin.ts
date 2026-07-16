// Server-side admin operations against Stalwart's management JMAP (v0.16
// registry API): provision mailbox accounts with a disk quota, enable
// per-account encryption-at-rest, and verify Cloudflare Turnstile tokens.
import { jmap, basicAuth, authenticate } from "./jmap";
import { randomBytes } from "crypto";

const JMAP_URL = process.env.JMAP_URL || "http://127.0.0.1:8088";

// Strong, readable internal credential (ambiguous chars removed). Never shown
// to a human — it authenticates the webmail to Stalwart and only ever unlocks
// ciphertext. ~16 chars easily clears Stalwart's minimum strength requirement.
export function generatePassword(len = 16): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Rejection sampling: discard bytes in the biased tail so every char is equally
  // likely (no modulo bias).
  const limit = 256 - (256 % chars.length);
  let out = "";
  while (out.length < len) {
    for (const b of randomBytes(len)) {
      if (b >= limit) continue;
      out += chars[b % chars.length];
      if (out.length === len) break;
    }
  }
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

async function domainId(auth: string): Promise<string> {
  const [r] = await jmap(auth, USING_ADMIN, [
    ["x:Domain/get", { ids: null, properties: ["name"] }, "0"],
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

// Registry id of the account with this username, or null.
async function accountRegistryId(username: string): Promise<string | null> {
  const auth = adminAuth();
  const [r] = await jmap(auth, USING_ADMIN, [
    ["x:Account/get", { ids: null, properties: ["name"] }, "0"],
  ]);
  const list = (r[1].list as Array<{ id: string; name: string }>) || [];
  return list.find((a) => a.name === username)?.id ?? null;
}

export async function usernameTaken(username: string): Promise<boolean> {
  return (await accountRegistryId(username)) !== null;
}

// Create the Stalwart account and return its JMAP *mail* account id.
export async function provisionAccount(username: string, password: string): Promise<string> {
  const auth = adminAuth();
  const did = await domainId(auth);
  const quota = parseInt(process.env.ACCOUNT_QUOTA_BYTES || "1073741824", 10);
  const [r] = await jmap(auth, USING_ADMIN, [
    [
      "x:Account/set",
      {
        create: {
          a: {
            "@type": "User",
            name: username,
            domainId: did,
            roles: { "@type": "User" },
            quotas: { [QUOTA_KEY]: quota },
            credentials: { "0": { "@type": "Password", secret: password } },
          },
        },
      },
      "0",
    ],
  ]);
  const res = r[1] as { created?: Record<string, unknown>; notCreated?: unknown };
  if (!res.created?.a) throw new Error("provision failed: " + JSON.stringify(res.notCreated));

  const email = `${username}@${process.env.MAIL_DOMAIN}`;
  const accountId = await authenticate(email, password);
  if (!accountId) throw new Error("provisioned account failed to authenticate");
  return accountId;
}

export async function deleteAccount(username: string): Promise<void> {
  const id = await accountRegistryId(username);
  if (!id) return;
  await jmap(adminAuth(), USING_ADMIN, [["x:Account/set", { destroy: [id] }, "0"]]);
}

// Upload the user's PGP public key and switch the account to encryption-at-rest.
// Runs with the *user's own* credentials (self-service permissions). From this
// point every message Stalwart stores for this account — SMTP deliveries and
// client appends alike — is PGP ciphertext only the browser can open.
export async function uploadEncryptionKey(
  email: string,
  password: string,
  armoredPublicKey: string
): Promise<void> {
  const auth = basicAuth(email, password);
  const [keyRes] = await jmap(auth, USING_ADMIN, [
    ["x:PublicKey/set", { create: { k: { key: armoredPublicKey, description: "webmail key" } } }, "0"],
  ]);
  const created = keyRes[1] as { created?: Record<string, { id: string }>; notCreated?: unknown };
  const keyId = created.created?.k?.id;
  if (!keyId) throw new Error("public key upload failed: " + JSON.stringify(created.notCreated));

  const [setRes] = await jmap(auth, USING_ADMIN, [
    [
      "x:AccountSettings/set",
      {
        update: {
          singleton: {
            encryptionAtRest: { "@type": "Aes256", publicKey: keyId, encryptOnAppend: true },
          },
        },
      },
      "0",
    ],
  ]);
  const updated = setRes[1] as { updated?: Record<string, unknown> };
  if (!updated.updated || !("singleton" in updated.updated)) {
    throw new Error("enabling encryption-at-rest failed");
  }
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

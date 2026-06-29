"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authenticate } from "@/lib/jmap";
import { createSession, destroySession } from "@/lib/session";
import {
  provisionAccount,
  validateUsername,
  usernameTaken,
  verifyTurnstile,
  generatePassword,
} from "@/lib/admin";
import {
  consumeInviteCode,
  releaseInviteCode,
  hashIp,
  isRateLimited,
  recordAttempt,
  clearAttempts,
} from "@/lib/db";

const DOMAIN = process.env.MAIL_DOMAIN || "hypamail.me";

// Brute-force limits, keyed by hashed client IP.
const LOGIN_MAX = 8;
const LOGIN_WINDOW = 600; // 10 min
const SIGNUP_MAX = 10;
const SIGNUP_WINDOW = 600;

export type FormState = { error?: string; ok?: boolean; email?: string; password?: string } | null;

// Real client IP. We trust ONLY Cloudflare's CF-Connecting-IP, which Cloudflare
// sets authoritatively and a client cannot override. We deliberately do NOT fall
// back to X-Forwarded-For: a client can pre-set that header and Cloudflare merely
// appends to it, so `xff.split(",")[0]` is attacker-controlled — trusting it would
// let anyone rotate the rate-limit key on every request and defeat brute-force /
// credential-stuffing protection (even through Cloudflare). Requests arriving
// without the CF header (i.e. not via the proxy) collapse to one "unknown" bucket,
// which fails closed. Keep the origin firewalled to Cloudflare IP ranges so this
// header is always present and trustworthy.
function clientIp(h: Headers): string | null {
  return h.get("cf-connecting-ip")?.trim() || null;
}

async function clientIpHash(): Promise<string> {
  const h = await headers();
  return hashIp(clientIp(h) || "unknown");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!id || !password) return { error: "Enter your username and password." };
  const email = id.includes("@") ? id : `${id}@${DOMAIN}`;

  // The app talks to Stalwart over localhost, so the mail server can't see the
  // real client IP — rate-limit here (hashed IP) to stop password brute-force.
  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "login", LOGIN_MAX, LOGIN_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  let accountId: string | null;
  try {
    accountId = await authenticate(email, password);
  } catch {
    return { error: "Server error. Please try again." };
  }
  if (!accountId) {
    await recordAttempt(ipHash, "login");
    return { error: "Wrong username or password." };
  }

  await clearAttempts(ipHash, "login");
  await createSession({ email, password, accountId });
  redirect("/mail");
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const invite = String(formData.get("invite") || "").trim();
  const token = String(formData.get("cf-turnstile-response") || "");

  const ipHash = await clientIpHash();
  if (await isRateLimited(ipHash, "signup", SIGNUP_MAX, SIGNUP_WINDOW)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const vErr = validateUsername(username);
  if (vErr) return { error: vErr };
  if (!invite) return { error: "An invite code is required." };

  const ip = clientIp(await headers()) ?? undefined;
  if (!(await verifyTurnstile(token, ip))) {
    await recordAttempt(ipHash, "signup");
    return { error: "Bot check failed. Please retry." };
  }

  if (await usernameTaken(username)) {
    await recordAttempt(ipHash, "signup");
    return { error: "That username is already taken." };
  }

  // Password is generated for the user, never chosen.
  const password = generatePassword();
  const email = `${username}@${DOMAIN}`;
  if (!(await consumeInviteCode(invite, email))) {
    await recordAttempt(ipHash, "signup");
    return { error: "Invalid or already-used invite code." };
  }

  try {
    await provisionAccount(username, password);
  } catch {
    await releaseInviteCode(invite);
    // Most likely cause is a concurrent signup that claimed the same username
    // between our check and the create — surface that precisely.
    if (await usernameTaken(username)) return { error: "That username is already taken." };
    return { error: "Could not create the account. Please try again." };
  }

  try {
    const accountId = await authenticate(email, password);
    if (accountId) await createSession({ email, password, accountId });
  } catch {
    // Account exists; session just couldn't be established. Still show the
    // credentials so the user can sign in manually.
  }
  // Don't redirect — return the credentials so the user can save the generated password.
  return { ok: true, email, password };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

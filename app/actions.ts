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
import { consumeInviteCode, releaseInviteCode } from "@/lib/db";

const DOMAIN = process.env.MAIL_DOMAIN || "hypamail.me";

export type FormState = { error?: string; ok?: boolean; email?: string; password?: string } | null;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!id || !password) return { error: "Enter your username and password." };
  const email = id.includes("@") ? id : `${id}@${DOMAIN}`;

  let accountId: string | null;
  try {
    accountId = await authenticate(email, password);
  } catch {
    return { error: "Server error. Please try again." };
  }
  if (!accountId) return { error: "Wrong username or password." };

  await createSession({ email, password, accountId });
  redirect("/mail");
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const invite = String(formData.get("invite") || "").trim();
  const token = String(formData.get("cf-turnstile-response") || "");

  const vErr = validateUsername(username);
  if (vErr) return { error: vErr };
  if (!invite) return { error: "An invite code is required." };

  const ip = (await headers()).get("cf-connecting-ip") || undefined;
  if (!(await verifyTurnstile(token, ip))) return { error: "Bot check failed. Please retry." };

  if (await usernameTaken(username)) return { error: "That username is already taken." };

  // Password is generated for the user, never chosen.
  const password = generatePassword();
  const email = `${username}@${DOMAIN}`;
  if (!(await consumeInviteCode(invite, email))) {
    return { error: "Invalid or already-used invite code." };
  }

  try {
    await provisionAccount(username, password);
  } catch {
    await releaseInviteCode(invite);
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

"use server";

// Access and erasure: the two rights the privacy policy promises, done in-app
// instead of by hand. Both sit behind the same gate as every other credential
// change — a live session alone shouldn't be able to hand out a dossier or
// delete a mailbox.
import { deleteAccount } from "@/lib/admin";
import { destroySession } from "@/lib/session";
import { deleteUser, getAccountExport } from "@/lib/db";
import { manageGate } from "./shared";

export async function exportAccountData(payload: {
  recoveryAuthKey: string;
  totpCode: string;
}): Promise<{ error?: string; filename?: string; json?: string }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };

  const data = await getAccountExport(gate.user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `hypamail-${gate.user.username}-${stamp}.json`,
    json: JSON.stringify(data, null, 2),
  };
}

export async function deleteAccountForever(payload: {
  recoveryAuthKey: string;
  totpCode: string;
  confirmUsername: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const gate = await manageGate(payload.recoveryAuthKey, payload.totpCode);
  if ("error" in gate) return { error: gate.error };
  const { user } = gate;

  if (payload.confirmUsername.trim().toLowerCase() !== user.username) {
    return { error: "That username doesn't match this account." };
  }

  // Mailbox first. If it fails nothing is lost and the account still works; if
  // it succeeds the mail is gone and the DB row is only bookkeeping.
  try {
    await deleteAccount(user.username);
  } catch {
    return { error: "Could not delete the mailbox. Nothing was removed — please try again." };
  }

  try {
    await deleteUser(user.id, user.email, user.username);
  } catch {
    return { error: "The mailbox is gone but the account record wasn't removed. Contact us." };
  }

  await destroySession();
  return { ok: true };
}

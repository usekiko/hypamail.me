// Legacy migration window: accounts created in the password era can sign in at
// /login/legacy with their old password and move to a passkey until this
// moment. After it closes the page and its server actions both refuse, and the
// only way back into an unmigrated account is asking an admin.
//
// The server actions enforce this and the pages only reflect it, so both read
// this one constant and can't drift apart (same pattern as constants/invite.ts).
export const LEGACY_LOGIN_UNTIL = new Date("2026-10-01T00:00:00Z");

// Rendered in the migration notice. Hardcoded rather than formatted from the
// Date: toLocaleDateString resolves differently on the server and the client,
// which would trip a hydration mismatch.
export const LEGACY_LOGIN_LABEL = "1 October";

/** True while password-era accounts can still migrate at /login/legacy. */
export function legacyLoginAvailable(now: Date = new Date()): boolean {
  return now < LEGACY_LOGIN_UNTIL;
}

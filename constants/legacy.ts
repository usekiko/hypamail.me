// Migration window: password-era accounts can move to a passkey at
// /login/legacy until this moment. After it closes the page and the actions
// both refuse, and the only way into an unmigrated account is an admin. Same
// pattern as constants/invite.ts — one constant, both sides read it.
export const LEGACY_LOGIN_UNTIL = new Date("2026-10-01T00:00:00Z");

// Rendered in the migration notice. Hardcoded rather than formatted from the
// Date: toLocaleDateString resolves differently on the server and the client,
// which would trip a hydration mismatch.
export const LEGACY_LOGIN_LABEL = "1 October";

/** True while password-era accounts can still migrate at /login/legacy. */
export function legacyLoginAvailable(now: Date = new Date()): boolean {
  return now < LEGACY_LOGIN_UNTIL;
}

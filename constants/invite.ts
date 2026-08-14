// Open-signup window: invite codes aren't required until this moment.
//
// The server action enforces this and the register form only reflects it (a
// greyed-out field stops nobody who crafts their own POST), so both read this
// one constant and can't drift apart.
export const INVITE_FREE_UNTIL = new Date("2026-08-30T00:00:00Z");

// Rendered in the register form's notice. Hardcoded rather than formatted from
// the Date: toLocaleDateString resolves differently on the server and the
// client, which would trip a hydration mismatch.
export const INVITE_FREE_LABEL = "30 August";

/** True once the open-signup window has closed and a code is needed again. */
export function inviteRequired(now: Date = new Date()): boolean {
  return now >= INVITE_FREE_UNTIL;
}

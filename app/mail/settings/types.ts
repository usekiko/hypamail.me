export interface Passkey {
  id: string;
  nickname: string | null;
  isOriginal: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export type Mode =
  | { kind: "view" }
  | { kind: "add" }
  | { kind: "remove"; id: string }
  | { kind: "totp-on" }
  | { kind: "totp-off" };

// The recovery-code + authenticator inputs are shared by every change on this
// page, so they ride along as one object rather than eight props per card.
// hasTotp is false for accounts that never enrolled one — the gate then asks
// for the recovery code alone, matching what the server accepts.
export interface GateState {
  words: string;
  setWords: (v: string) => void;
  totpCode: string;
  setTotpCode: (v: string) => void;
  hasTotp: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
}

/** Row inside a card: slightly raised against the surface, hairline border. */
export const ROW_CLASS =
  "flex items-center justify-between gap-3 rounded-lg border border-border bg-white/[0.04] px-3 py-2.5";

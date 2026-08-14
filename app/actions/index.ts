// Barrel so callers keep importing from "@/app/actions". The actual actions
// live in the files next to this one, grouped by flow.
export { signupBegin, signupComplete } from "./signup";
export type { SignupBeginResult, SignupCompleteResult } from "./signup";

export { loginBegin, loginBeginForDevice, loginComplete, loginTotp } from "./login";
export type { LoginCompleteResult } from "./login";

export { recoveryLogin } from "./recovery";
export type { RecoveryLoginResult } from "./recovery";

export { passwordSalt, passwordLogin } from "./password";
export type { PasswordLoginResult } from "./password";

export { legacyLoginBegin, legacyMigrateComplete } from "./legacy";

export { listPasskeys, addPasskeyBegin, addPasskeyComplete, removePasskey } from "./passkeys";
export type { AccountSecurity } from "./passkeys";

export { enrollTotpBegin, enrollTotpComplete, removeTotp, setLoginTotpRequired } from "./totp";

export {
  getWrappedKeys,
  setPrfWrap,
  setAccountPassword,
  removeAccountPassword,
  logoutAction,
} from "./account";

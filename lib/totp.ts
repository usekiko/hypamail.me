// TOTP (RFC 6238). Optional per account; when set it gates recovery, password
// sign-in, and any passkey added after signup. Auth only — the secret plays no
// part in mail encryption, so adding or dropping it never rewraps a key.
import { TOTP, Secret } from "otpauth";
import { randomBytes } from "crypto";

const ISSUER = "hypamail";

function totpFor(base32Secret: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32Secret),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ buffer: randomBytes(20).buffer as ArrayBuffer }).base32;
}

export function totpUri(base32Secret: string, label: string): string {
  return totpFor(base32Secret, label).toString();
}

// Accept the previous/next 30s step to absorb clock drift.
export function verifyTotp(base32Secret: string, token: string, label = "account"): boolean {
  const t = token.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  return totpFor(base32Secret, label).validate({ token: t, window: 1 }) !== null;
}

// Browser-side crypto. Nothing derived here leaves the device — only wrapped
// blobs and the auth halves do. Three ways to unlock the same PGP private key:
//
//   recovery words (128-bit)
//     ├─ HKDF "recovery-auth" → authKey → server, stored hashed
//     └─ HKDF "recovery-wrap" → wrapKey → encrypts the private key
//
//   passkey PRF output (per credential, fixed app salt)
//     └─ HKDF "prf-wrap"      → wrapKey
//
//   password (optional, per-user salt)
//     └─ PBKDF2-SHA256 → master
//         ├─ HKDF "password-auth" → authKey → server, stored hashed
//         └─ HKDF "password-wrap" → wrapKey
//
// Only the password branch needs PBKDF2 — the other two inputs are already
// uniformly random. Splitting auth from wrap with different info strings is what
// keeps the server's copy useless for decryption.
import * as openpgp from "openpgp";
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const HKDF_SALT = new TextEncoder().encode("hypamail-v1");
const INFO_AUTH = "hypamail/recovery-auth/v1";
const INFO_RECOVERY_WRAP = "hypamail/recovery-wrap/v1";
const INFO_PRF_WRAP = "hypamail/prf-wrap/v1";
const INFO_PASSWORD_AUTH = "hypamail/password-auth/v1";
const INFO_PASSWORD_WRAP = "hypamail/password-wrap/v1";

// OWASP's floor for PBKDF2-SHA256. ~1s on a mid-range phone; it runs once at
// sign-in, so the cost lands on an attacker guessing offline against a stolen
// password_auth_hash, which is the point.
const PASSWORD_KDF_ITERATIONS = 600_000;
export const PASSWORD_MIN_LENGTH = 10;

// One fixed PRF salt for the whole app (see lib/webauthn.ts for why this is
// safe). SHA-256("hypamail.me/prf/v1").
export const PRF_SALT = new Uint8Array([
  0xb3, 0x55, 0xa0, 0x56, 0x72, 0xc7, 0xc9, 0x2c, 0x82, 0xfb, 0x13, 0x3a, 0xf4, 0xc0, 0x63, 0x5b,
  0x4e, 0x4d, 0x4e, 0xfd, 0x56, 0x6f, 0x80, 0xdc, 0xab, 0xd2, 0x07, 0xe7, 0x1a, 0xb2, 0x17, 0xb4,
]);

// ---------- small helpers ----------

export function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hkdf(ikm: Uint8Array, info: string, bits = 256): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT as BufferSource, info: new TextEncoder().encode(info) },
    key,
    bits
  );
}

async function aesKeyFromBits(bits: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// ---------- recovery code (12 BIP39 words = 128-bit entropy + checksum) ----------

export function generateRecoveryWords(): string {
  const entropy = crypto.getRandomValues(new Uint8Array(16));
  return entropyToMnemonic(entropy, wordlist);
}

export function normalizeWords(words: string): string {
  return words.trim().toLowerCase().split(/\s+/).join(" ");
}

export function recoveryWordsValid(words: string): boolean {
  return validateMnemonic(normalizeWords(words), wordlist);
}

const WORDSET = new Set(wordlist);

export function isRecoveryWord(word: string): boolean {
  return WORDSET.has(word.trim().toLowerCase());
}

// Slot indices (0-based) of filled-in words that aren't on the BIP39 list.
// Pointing at the bad word is fine: the check is local and the wordlist public,
// so this leaks nothing an attacker couldn't run offline — it just saves hunting
// a typo across twelve rows. The server's own answers stay vague on purpose.
export function invalidRecoveryWordIndices(words: string): number[] {
  return words
    .split(" ")
    .map((w, i) => {
      const c = w.trim().toLowerCase();
      return c && !WORDSET.has(c) ? i : -1;
    })
    .filter((i) => i >= 0);
}

// A specific, actionable message for a locally-invalid recovery code, or null
// when the twelve words are well-formed.
export function recoveryWordsError(words: string): string | null {
  const bad = invalidRecoveryWordIndices(words);
  if (bad.length) {
    const nums = bad.map((i) => i + 1).join(", ");
    return bad.length === 1
      ? `Word ${nums} isn't from the recovery word list. Check it for a typo.`
      : `Words ${nums} aren't from the recovery word list. Check them for typos.`;
  }
  const filled = normalizeWords(words).split(" ").filter(Boolean);
  if (filled.length < 12) {
    return `Enter all 12 words, ${filled.length} of 12 so far.`;
  }
  if (!recoveryWordsValid(words)) {
    // Every word is real but the checksum fails: usually a swapped/wrong word.
    return "These 12 words aren't a valid recovery code. Check the spelling and the order.";
  }
  return null;
}

function wordsEntropy(words: string): Uint8Array {
  return mnemonicToEntropy(normalizeWords(words), wordlist);
}

// The login proof sent to the server (which stores only its hash). Deriving it
// from the entropy with a *different* HKDF info than the wrap key means the
// server can verify logins yet learns nothing that decrypts mail.
export async function deriveRecoveryAuthKey(words: string): Promise<string> {
  return b64urlEncode(await hkdf(wordsEntropy(words), INFO_AUTH));
}

async function deriveRecoveryWrapKey(words: string): Promise<CryptoKey> {
  return aesKeyFromBits(await hkdf(wordsEntropy(words), INFO_RECOVERY_WRAP));
}

async function derivePrfWrapKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  return aesKeyFromBits(await hkdf(new Uint8Array(prfOutput), INFO_PRF_WRAP));
}

// ---------- AES-GCM wrapping of the PGP private key ----------

async function wrap(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return b64urlEncode(out);
}

async function unwrap(key: CryptoKey, blob: string): Promise<string> {
  const buf = b64urlDecode(blob);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf.slice(0, 12) as BufferSource },
    key,
    buf.slice(12) as BufferSource
  );
  return new TextDecoder().decode(pt);
}

export async function wrapWithRecovery(words: string, armoredPrivateKey: string): Promise<string> {
  return wrap(await deriveRecoveryWrapKey(words), armoredPrivateKey);
}

export async function unwrapWithRecovery(words: string, blob: string): Promise<string> {
  return unwrap(await deriveRecoveryWrapKey(words), blob);
}

export async function wrapWithPrf(prfOutput: ArrayBuffer, armoredPrivateKey: string): Promise<string> {
  return wrap(await derivePrfWrapKey(prfOutput), armoredPrivateKey);
}

// ---------- optional password ----------

/** Fresh per-user salt. Stored server-side and handed out before sign-in. */
export function generatePasswordSalt(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export function passwordError(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters, ${password.length} so far.`;
  }
  if (password.length > 512) return "That password is too long.";
  return null;
}

// Slow step, shared by both branches below. Everything after this is cheap, so
// signing in derives this once and splits it two ways.
async function derivePasswordMaster(password: string, salt: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: b64urlDecode(salt) as BufferSource,
      iterations: PASSWORD_KDF_ITERATIONS,
    },
    key,
    256
  );
  return new Uint8Array(bits);
}

/** The login proof sent to the server. Cannot decrypt anything (different info). */
export async function derivePasswordAuthKey(password: string, salt: string): Promise<string> {
  return b64urlEncode(await hkdf(await derivePasswordMaster(password, salt), INFO_PASSWORD_AUTH));
}

async function derivePasswordWrapKey(password: string, salt: string): Promise<CryptoKey> {
  return aesKeyFromBits(await hkdf(await derivePasswordMaster(password, salt), INFO_PASSWORD_WRAP));
}

/** Both halves in one PBKDF2 pass — used at sign-in, where we need each once. */
export async function derivePasswordKeys(
  password: string,
  salt: string
): Promise<{ authKey: string; wrapKey: CryptoKey }> {
  const master = await derivePasswordMaster(password, salt);
  return {
    authKey: b64urlEncode(await hkdf(master, INFO_PASSWORD_AUTH)),
    wrapKey: await aesKeyFromBits(await hkdf(master, INFO_PASSWORD_WRAP)),
  };
}

export async function wrapWithPassword(
  password: string,
  salt: string,
  armoredPrivateKey: string
): Promise<string> {
  return wrap(await derivePasswordWrapKey(password, salt), armoredPrivateKey);
}

export async function unwrapWithPassword(
  password: string,
  salt: string,
  blob: string
): Promise<string> {
  return unwrap(await derivePasswordWrapKey(password, salt), blob);
}

/** Unwrap with a wrapKey already derived by derivePasswordKeys(). */
export async function unwrapWithPasswordKey(wrapKey: CryptoKey, blob: string): Promise<string> {
  return unwrap(wrapKey, blob);
}

export async function unwrapWithPrf(prfOutput: ArrayBuffer, blob: string): Promise<string> {
  return unwrap(await derivePrfWrapKey(prfOutput), blob);
}

// ---------- PGP mail keypair ----------

export async function generateMailKeypair(
  email: string
): Promise<{ privateKey: string; publicKey: string }> {
  // v4 X25519 keys: the most widely supported profile, incl. Stalwart's
  // encryption-at-rest implementation.
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email }],
    format: "armored",
  });
  return { privateKey, publicKey };
}

// ---------- unlocked-key store (per tab) ----------
// sessionStorage: survives reloads within the tab, gone when the tab closes.
// Never localStorage — the unlocked key must not persist on disk.

const MAILKEY_SLOT = "hm_mailkey";

export function storeMailKey(armoredPrivateKey: string): void {
  sessionStorage.setItem(MAILKEY_SLOT, armoredPrivateKey);
}

export function loadMailKey(): string | null {
  return sessionStorage.getItem(MAILKEY_SLOT);
}

export function clearMailKey(): void {
  sessionStorage.removeItem(MAILKEY_SLOT);
}

// ---------- WebAuthn ceremonies (native JSON APIs + PRF extension) ----------

type PrfCapableCredential = PublicKeyCredential & {
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs & {
    prf?: { enabled?: boolean; results?: { first?: BufferSource } };
  };
};

function toArrayBuffer(v: BufferSource | null | undefined): ArrayBuffer | null {
  if (!v) return null;
  if (v instanceof ArrayBuffer) return v;
  return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
}

export interface CreateResult {
  responseJSON: unknown; // RegistrationResponseJSON for the server
  credentialId: string;
  prfEnabled: boolean;
  prfOutput: ArrayBuffer | null;
}

export async function webauthnCreate(optionsJSON: unknown): Promise<CreateResult> {
  const options = PublicKeyCredential.parseCreationOptionsFromJSON(
    optionsJSON as PublicKeyCredentialCreationOptionsJSON
  );
  options.extensions = {
    ...options.extensions,
    prf: { eval: { first: PRF_SALT as BufferSource } },
  } as AuthenticationExtensionsClientInputs;
  const cred = (await navigator.credentials.create({ publicKey: options })) as PrfCapableCredential;
  const ext = cred.getClientExtensionResults();
  return {
    responseJSON: cred.toJSON(),
    credentialId: cred.id,
    prfEnabled: !!ext.prf?.enabled || !!ext.prf?.results?.first,
    prfOutput: toArrayBuffer(ext.prf?.results?.first),
  };
}

// Evaluate PRF without a server round-trip — the assertion is thrown away, so a
// self-generated challenge is fine (PRF output depends only on the credential
// and our fixed salt). Re-unlocks the mail key in a fresh tab.
export async function localPrfGet(): Promise<{ credentialId: string; prfOutput: ArrayBuffer | null }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      rpId: location.hostname,
      userVerification: "required",
      extensions: { prf: { eval: { first: PRF_SALT as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PrfCapableCredential;
  const ext = cred.getClientExtensionResults();
  return { credentialId: cred.id, prfOutput: toArrayBuffer(ext.prf?.results?.first) };
}

export interface GetResult {
  responseJSON: unknown; // AuthenticationResponseJSON for the server
  credentialId: string;
  prfOutput: ArrayBuffer | null;
}

export async function webauthnGet(
  optionsJSON: unknown,
  allowCredentialId?: string
): Promise<GetResult> {
  const options = PublicKeyCredential.parseRequestOptionsFromJSON(
    optionsJSON as PublicKeyCredentialRequestOptionsJSON
  );
  if (allowCredentialId) {
    options.allowCredentials = [
      { type: "public-key", id: b64urlDecode(allowCredentialId) as BufferSource },
    ];
  }
  options.extensions = {
    ...options.extensions,
    prf: { eval: { first: PRF_SALT as BufferSource } },
  } as AuthenticationExtensionsClientInputs;
  const cred = (await navigator.credentials.get({ publicKey: options })) as PrfCapableCredential;
  const ext = cred.getClientExtensionResults();
  return {
    responseJSON: cred.toJSON(),
    credentialId: cred.id,
    prfOutput: toArrayBuffer(ext.prf?.results?.first),
  };
}

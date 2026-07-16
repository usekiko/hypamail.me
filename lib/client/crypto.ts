// Browser-side cryptography. Everything in this file runs on the user's device;
// none of the derived keys here ever leave it (only *wrapped* blobs and the
// recovery *auth* key do). This is the heart of the zero-access design:
//
//   recovery entropy (12 words, 128-bit)
//     ├─ HKDF "recovery-auth" → authKey   → sent to server, stored hashed
//     │                                     (login proof; useless for decryption)
//     └─ HKDF "recovery-wrap" → wrapKey   → encrypts the PGP private key locally
//
//   passkey PRF output (per credential, fixed app salt)
//     └─ HKDF "prf-wrap"      → wrapKey   → same private key, wrapped per passkey
//
// The PGP private key decrypts mail that Stalwart encrypted on arrival with the
// matching public key. The server holds only ciphertext + wrapped blobs.
import * as openpgp from "openpgp";
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const HKDF_SALT = new TextEncoder().encode("hypamail-v1");
const INFO_AUTH = "hypamail/recovery-auth/v1";
const INFO_RECOVERY_WRAP = "hypamail/recovery-wrap/v1";
const INFO_PRF_WRAP = "hypamail/prf-wrap/v1";

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

// Evaluate PRF locally without a server round-trip. The assertion is discarded
// — PRF output depends only on the credential and our fixed salt, so a random
// self-generated challenge is fine. Used to re-unlock the mail key in a fresh
// tab when a server session already exists.
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

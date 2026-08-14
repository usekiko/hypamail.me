// WebAuthn server side, over @simplewebauthn/server.
//
// Every credential registers PRF with one app-wide salt. That's safe because
// the authenticator keys PRF output per credential anyway, and it lets
// usernameless login evaluate PRF without knowing which passkey the user picks.
// The browser turns that output into an AES key and unwraps the mail key
// locally; the server only ever stores the wrapped blob.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/server";
import { headers } from "next/headers";
import type { CredentialRow } from "./db";

const RP_NAME = "hypamail";

// The relying-party ID (domain) and expected origin. In production these come
// from env; in dev they fall back to the request host (localhost is a valid,
// secure WebAuthn context).
export async function rpContext(): Promise<{ rpID: string; origin: string }> {
  const envRp = process.env.WEBAUTHN_RP_ID;
  const envOrigin = process.env.WEBAUTHN_ORIGIN;
  if (envRp && envOrigin) return { rpID: envRp, origin: envOrigin };
  const h = await headers();
  const host = h.get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

export async function registrationOptions(
  username: string,
  exclude: CredentialRow[] = []
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = await rpContext();
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required", // discoverable → usernameless login
      userVerification: "required", // the second factor: biometric/PIN
    },
    excludeCredentials: exclude.map((c) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransport[],
    })),
  });
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
) {
  const { rpID, origin } = await rpContext();
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!v.verified || !v.registrationInfo) return null;
  const info = v.registrationInfo;
  return {
    id: info.credential.id,
    publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
  };
}

export async function authenticationOptions(
  allow: CredentialRow[] = []
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = await rpContext();
  return generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: allow.length
      ? allow.map((c) => ({ id: c.id, transports: c.transports as AuthenticatorTransport[] }))
      : undefined,
  });
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: CredentialRow
): Promise<number | null> {
  const { rpID, origin } = await rpContext();
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: credential.id,
      publicKey: new Uint8Array(Buffer.from(credential.publicKey, "base64url")),
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransport[],
    },
  });
  return v.verified ? v.authenticationInfo.newCounter : null;
}

// Browser-side mail decryption + sanitization.
//
// Stalwart stores deliveries as PGP/MIME: cleartext headers, encrypted body. We
// pull the raw blob, decrypt the octet-stream part, and parse the inner MIME.
// Anything predating encryption parses as ordinary MIME and skips the decrypt.
//
// The allowlist is text-formatting tags only — no images, scripts, styles or
// embeds — so tracking pixels are gone before the DOM ever sees them.
import * as openpgp from "openpgp";
import PostalMime, { type Email } from "postal-mime";
import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a", "b", "i", "em", "strong", "u", "p", "br", "ul", "ol", "li",
  "blockquote", "pre", "code", "span", "div", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "table", "thead", "tbody", "tr", "td", "th",
];

let hooked = false;
function sanitizer(): typeof DOMPurify {
  if (!hooked) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        if (node.getAttribute("href")) {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer nofollow");
        }
      }
    });
    hooked = true;
  }
  return DOMPurify;
}

export function sanitize(html: string): string {
  return sanitizer().sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    ALLOW_DATA_ATTR: false,
  });
}

export interface DecryptedMail {
  html: string | null; // sanitized — safe to render
  text: string | null;
  encrypted: boolean; // false → message was stored in cleartext (pre-encryption legacy)
}

function looksEncrypted(parsed: Email): boolean {
  return (parsed.attachments || []).some(
    (a) =>
      a.mimeType === "application/pgp-encrypted" ||
      (a.mimeType === "application/octet-stream" &&
        typeof a.filename === "string" &&
        a.filename.endsWith(".asc"))
  );
}

export async function decryptMail(
  raw: ArrayBuffer,
  armoredPrivateKey: string
): Promise<DecryptedMail> {
  const outer = await PostalMime.parse(raw);
  if (!looksEncrypted(outer)) {
    return {
      html: outer.html ? sanitize(outer.html) : null,
      text: outer.text ?? null,
      encrypted: false,
    };
  }

  const part = (outer.attachments || []).find((a) => a.mimeType === "application/octet-stream");
  if (!part) throw new Error("encrypted part missing");
  const armoredMessage = new TextDecoder().decode(part.content as ArrayBuffer);

  const privateKey = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey });
  const message = await openpgp.readMessage({ armoredMessage });
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });

  const inner = await PostalMime.parse(data as string);
  return {
    html: inner.html ? sanitize(inner.html) : null,
    text: inner.text ?? null,
    encrypted: true,
  };
}

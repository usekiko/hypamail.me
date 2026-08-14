// Files a copy of an outgoing message into the user's Sent mailbox, encrypted
// to their own PGP key.
//
// Encrypting here rather than in the browser is not a downgrade: the server
// necessarily handles the plaintext to relay it at all. What matters is that
// nothing readable is *stored* — the copy at rest is ciphertext only the user
// can open, exactly like their incoming mail.
import * as openpgp from "openpgp";
import { importEmail, mailboxByRole } from "./jmap";

// PGP/MIME (RFC 3156), matching the shape Stalwart writes for inbound mail so
// the existing reader in lib/client/mail.ts decrypts a Sent copy unchanged.
function pgpMime(headers: string, ciphertext: string): Buffer {
  const boundary = `hm-${crypto.randomUUID()}`;
  return Buffer.from(
    `${headers}` +
      `Content-Type: multipart/encrypted; protocol="application/pgp-encrypted";\r\n` +
      ` boundary="${boundary}"\r\n` +
      `MIME-Version: 1.0\r\n` +
      `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/pgp-encrypted\r\n` +
      `Content-Description: PGP/MIME version identification\r\n` +
      `\r\n` +
      `Version: 1\r\n` +
      `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream; name="encrypted.asc"\r\n` +
      `Content-Disposition: inline; filename="encrypted.asc"\r\n` +
      `\r\n` +
      `${ciphertext}\r\n` +
      `--${boundary}--\r\n`,
    "utf8"
  );
}

// Envelope headers stay in the clear, like every other message in the mailbox —
// the inbox list has to render sender, subject and date without a key.
function outerHeaders(raw: Buffer): string {
  const text = raw.toString("utf8");
  const end = text.search(/\r?\n\r?\n/);
  const head = end === -1 ? text : text.slice(0, end);
  const keep = /^(From|To|Cc|Subject|Date|Message-ID|In-Reply-To|References):/i;
  return (
    head
      .split(/\r?\n/)
      // Keep folded continuation lines with the header they belong to.
      .reduce<string[]>((acc, line) => {
        if (/^\s/.test(line) && acc.length) acc[acc.length - 1] += `\r\n${line}`;
        else acc.push(line);
        return acc;
      }, [])
      .filter((l) => keep.test(l))
      .join("\r\n") + "\r\n"
  );
}

export async function fileSentCopy(opts: {
  email: string;
  mailPassword: string;
  accountId: string;
  pgpPublicKey: string;
  raw: Buffer;
}): Promise<void> {
  const sent = await mailboxByRole(opts.email, opts.mailPassword, opts.accountId, "sent");
  if (!sent) throw new Error("no Sent mailbox on this account");

  const key = await openpgp.readKey({ armoredKey: opts.pgpPublicKey });
  const ciphertext = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: opts.raw.toString("utf8") }),
    encryptionKeys: key,
    format: "armored",
  });

  await importEmail(
    opts.email,
    opts.mailPassword,
    opts.accountId,
    sent,
    pgpMime(outerHeaders(opts.raw), String(ciphertext))
  );
}

import type { Metadata } from "next";
import { LegalPage, Section } from "../ui/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Hypamail",
  description: "What Hypamail stores, what is encrypted, and how that encryption works.",
};

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="14 August 2026">
      <Section heading="Who is responsible for your data">
        <p>
          Hypamail is run by{" "}
          <a
            href="https://usekiko.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline"
          >
            usekiko
          </a>
          , an individual based in Poland — not a company. For the purposes of the EU General Data
          Protection Regulation (GDPR), that individual is the data controller.
        </p>
        <p>
          As a private individual rather than a registered business, we do not publish a postal
          address. Doing so would mean publishing a home address, which carries a real risk of
          doxxing and harassment. Contact by email reaches us reliably and is the channel we use for
          every request under this policy, including those where the GDPR sets a deadline.
        </p>
        <p>
          Write to <strong className="text-foreground">usekiko@hypamail.me</strong>. If you get no
          reply, use <strong className="text-foreground">id4rp02s@gmail.com</strong> as a fallback —
          please try the first address first.
        </p>
        <p>
          We have not appointed a Data Protection Officer, as we are not required to under Article 37
          GDPR.
        </p>
      </Section>

      <Section heading="A note on what counts as personal data">
        <p>
          Under the GDPR, personal data is anything that can identify you directly or indirectly.
          That is broader than most people expect: your username, your {DOMAIN} address, your
          internal account ID and user ID, and any identifier tied to your account are all personal
          data, even though none of them are your legal name. We treat them as such throughout this
          policy. A hashed or pseudonymised identifier is still personal data if it can be linked
          back to you; it is only outside the GDPR when it is genuinely anonymous.
        </p>
      </Section>

      <Section heading="What we store, and why">
        <p>
          Hypamail is invite-only and currently receive-only. We collect what the service needs to
          function and nothing else. Specifically:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-foreground">Account record</strong> — your username, your{" "}
            {DOMAIN} address, an internal account identifier, and the time the account was created.
            Legal basis: performance of a contract (Art. 6(1)(b)).
          </li>
          <li>
            <strong className="text-foreground">Authentication data</strong> — public keys and
            metadata for each passkey you register (credential ID, signature counter, transport
            types, a nickname if you set one, creation and last-used timestamps); a verifier derived
            from your recovery code; if you set a password, a random salt and a verifier derived
            from it; and, if you enable two-factor authentication, your authenticator secret. Legal
            basis: contract, and our legitimate interest in securing accounts (Art. 6(1)(f)).
          </li>
          <li>
            <strong className="text-foreground">Wrapped key material</strong> — your mail
            encryption key, encrypted separately by each credential you have set up. See the
            encryption section below for what we can and cannot do with these. Legal basis:
            contract.
          </li>
          <li>
            <strong className="text-foreground">Your public encryption key</strong>, used to encrypt
            incoming mail as it is written to disk. Legal basis: contract.
          </li>
          <li>
            <strong className="text-foreground">An internal mailbox credential</strong>, generated
            by us, never shown to you, and stored encrypted. Legal basis: contract.
          </li>
          <li>
            <strong className="text-foreground">Sessions</strong> — an opaque session identifier,
            your address, and creation and expiry timestamps, so that you can stay signed in and so
            that you can revoke sessions. Legal basis: contract.
          </li>
          <li>
            <strong className="text-foreground">Abuse and rate-limiting records</strong> — a keyed
            hash of your IP address and the type of action attempted. We do not store your IP
            address in readable form for this purpose. Legal basis: legitimate interest in
            preventing brute-force attacks and abuse.
          </li>
          <li>
            <strong className="text-foreground">Invite codes</strong> — a hash of the code, when it
            was created, how many times it may be used, how many times it has been used, and the
            address that most recently redeemed it. Legal basis: legitimate interest in controlling
            access during a closed beta.
          </li>
          <li>
            <strong className="text-foreground">Your mail</strong> — the messages sent to your
            address, including their content, attachments, and headers such as sender, recipients,
            subject and timestamps. Legal basis: contract.
          </li>
        </ul>
        <p>
          We do not run analytics, advertising, tracking pixels, or any third-party script that
          profiles you. We do not sell or share your data with anyone for their own purposes.
        </p>
      </Section>

      <Section heading="Encryption: what is protected, and from whom">
        <p>
          This is the part most privacy policies are vague about, so we are going to be specific.
          Different data is protected in different ways, and one of those ways still leaves us
          technically able to read the data.
        </p>

        <p className="text-foreground">Encrypted so that we cannot read it</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-foreground">Your stored mail.</strong> When a message is written
            to your mailbox it is encrypted with your public key. The matching private key is
            generated in your browser and never reaches us in usable form.
          </li>
          <li>
            <strong className="text-foreground">Your private key.</strong> It is encrypted in your
            browser before it is ever sent to us, once for each way you can sign in — your passkey,
            your recovery code, and your password if you set one. We store only those encrypted
            blobs. The values that unwrap them (your passkey&apos;s hardware-held secret, your
            12-word recovery code, your password) never leave your device. We cannot unwrap them,
            and neither can anyone who obtains a copy of our database.
          </li>
        </ul>

        <p className="text-foreground">Encrypted, but we hold the keys</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-foreground">The internal mailbox credential</strong> and{" "}
            <strong className="text-foreground">your two-factor authentication secret</strong> are
            encrypted with AES-256-GCM using a key held by our server. This protects them if the
            database alone is exposed, but it is not zero-access: we can decrypt them. The mailbox
            credential only grants access to the encrypted mail described above, so it does not let
            us read your messages.
          </li>
        </ul>

        <p className="text-foreground">Hashed, and not reversible by us</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            IP addresses used for rate limiting, invite codes, and the verifiers derived from your
            recovery code and password. These are one-way; we store them to check a value you
            present, not to recover the original.
          </li>
        </ul>

        <p className="text-foreground">What this is not</p>
        <p>
          <strong className="text-foreground">
            Hypamail is not end-to-end encrypted email in the strict sense, and we will not claim it
            is.
          </strong>{" "}
          Mail arrives from the outside world over SMTP. Unless the sender independently encrypted
          the message to your key, it reaches our server as plaintext and is processed in memory
          before it is encrypted to disk. During that window it is technically readable, and whether
          it was encrypted in transit to us depends on the sending server supporting TLS — which we
          do not control. What we can honestly say is that your mail is encrypted once stored, with
          a key we cannot unwrap.
        </p>
        <p>
          The practical consequence of this design cuts both ways: because we cannot unwrap your
          key, we cannot reset it for you. If you lose every credential and your recovery code, your
          stored mail is unrecoverable by anyone, including us.
        </p>
      </Section>

      <Section heading="Who else processes your data">
        <p>
          We use Cloudflare as a network proxy in front of the site and for the bot check on the
          signup form. Cloudflare therefore processes your IP address and connection metadata on our
          behalf, and receives your IP address when a bot check is verified. Our servers and their
          backups are hosted with <strong className="text-foreground">OVHcloud</strong>, in{" "}
          <strong className="text-foreground">Germany</strong>, so your mail and account data are
          stored inside the EEA.
        </p>
        <p>
          Where a processor handles data outside the EEA, that transfer relies on the European
          Commission&apos;s Standard Contractual Clauses or an adequacy decision. Mail you receive
          necessarily comes from senders and servers we have no relationship with, anywhere in the
          world; we cannot control how they handled it before it reached us.
        </p>
      </Section>

      <Section heading="How long we keep things">
        <ul className="ml-5 list-disc space-y-2">
          <li>Account, credential and key data: until you delete your account.</li>
          <li>Mail: until you delete it, or until your account is deleted.</li>
          <li>Sessions: a maximum of 7 days, and immediately on sign-out or revocation.</li>
          <li>Rate-limiting records: automatically deleted after 24 hours.</li>
          <li>
            Backups: deleted data may persist in encrypted backups for a limited period before
            being overwritten on the ordinary backup cycle.
          </li>
        </ul>
      </Section>

      <Section heading="Your rights">
        <p>
          Under the GDPR you have the right to access your data, to have it corrected, to have it
          erased, to restrict or object to processing, to data portability, and to withdraw consent
          where processing is based on it.
        </p>
        <p>
          Two of these you can exercise yourself, immediately, without asking us. In{" "}
          <strong className="text-foreground">Settings</strong> you can download everything our
          database holds about your account as a JSON file, and you can delete your account outright
          — which erases the mailbox, its messages, your passkeys and your account record. For
          anything else, or if you would rather we did it, write to{" "}
          <strong className="text-foreground">usekiko@hypamail.me</strong> (or{" "}
          <strong className="text-foreground">id4rp02s@gmail.com</strong> if you get no reply). We
          will respond within one month, as Article 12(3) requires.
        </p>
        <p>
          One honest limitation on the right of access and to portability: the export covers the
          data we hold, which does not include readable mail. Your messages are ciphertext to us and
          we cannot decrypt them, so a readable copy has to be produced from your own signed-in
          session, where your key is available. For the same reason, deleting your account destroys
          your mail permanently — we hold no key that could bring it back.
        </p>
        <p>
          You also have the right to lodge a complaint with a supervisory authority, in the EU
          member state where you live, work, or where you believe an infringement occurred. As we
          are established in Poland, that also includes the Polish authority, the Urząd Ochrony
          Danych Osobowych (UODO).
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Sessions are held in an encrypted, HTTP-only, secure cookie that contains only an opaque
          identifier, so a stolen cookie can be revoked server-side. Sign-in attempts are rate
          limited. Passwords, where used, are stretched in your browser before anything derived from
          them is sent to us, so we never receive the password itself. No system is perfectly
          secure, and Hypamail is in active development — please treat it accordingly.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          Hypamail is not directed at children, and we do not knowingly create accounts for anyone
          under the age of 16, or the lower age set by their member state under Article 8(1) GDPR.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change this policy we will update the date at the top of this page. If a change
          materially affects how we handle your data, we will tell you before it takes effect.
        </p>
      </Section>
    </LegalPage>
  );
}

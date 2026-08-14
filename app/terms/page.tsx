import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "../ui/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — Hypamail",
  description: "The terms you agree to when using Hypamail.",
};

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="14 August 2026">
      <Section heading="Who you are agreeing with">
        <p>
          These terms are between you and{" "}
          <a
            href="https://usekiko.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline"
          >
            usekiko
          </a>{" "}
          (&quot;we&quot;, &quot;us&quot;) — an individual based in Poland running Hypamail as a
          personal project, not a company. By creating a {DOMAIN} address or using the service, you
          accept these terms. If you do not, please do not use Hypamail.
        </p>
        <p>
          We do not publish a postal address, because that would mean publishing a home address. You
          can reach us at <strong className="text-foreground">usekiko@hypamail.me</strong>, or at{" "}
          <strong className="text-foreground">id4rp02s@gmail.com</strong> if you get no reply.
        </p>
      </Section>

      <Section heading="What Hypamail currently is">
        <p>
          Hypamail is an invite-only, <strong className="text-foreground">receive-only</strong> mail
          service: you can receive and read mail at your {DOMAIN} address, but there is no way to
          send mail from it. That is a deliberate limitation of the current product, not a fault.
        </p>
        <p>
          The service is in active development. Features may change or be removed, and it is
          provided free of charge. Please do not use it as your only copy of anything you cannot
          afford to lose, and do not rely on it for anything critical — password resets, financial
          accounts, or legal correspondence.
        </p>
      </Section>

      <Section heading="Eligibility">
        <p>
          You must be at least 16 years old, or the lower age set by your member state under Article
          8(1) GDPR, and legally able to enter into these terms. One person may not create accounts
          in bulk or use automated means to obtain addresses.
        </p>
      </Section>

      <Section heading="Your credentials, and what we cannot do for you">
        <p>
          You are responsible for keeping your passkey, password and recovery code safe, and for
          activity carried out through your account. Your recovery code is generated in your browser
          and shown to you exactly once; we never receive it.
        </p>
        <p>
          Because your mail is encrypted with a key we cannot unwrap, losing every credential
          together with your recovery code means your stored mail is permanently unrecoverable. We
          cannot reset it, restore it, or read it on your behalf. This is the direct trade-off for
          us not being able to read your mail either — see the{" "}
          <Link href="/privacy" className="text-foreground hover:underline">
            Privacy Policy
          </Link>{" "}
          for exactly what that does and does not cover.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>You agree not to use Hypamail to:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>break the law, or receive or store material that is illegal to possess;</li>
          <li>
            infringe anyone&apos;s rights, or harass, threaten or abuse another person;
          </li>
          <li>
            attack, probe or disrupt the service or its infrastructure, or attempt to access
            accounts, data or systems that are not yours;
          </li>
          <li>
            evade invite limits, register addresses in bulk, or resell addresses; or
          </li>
          <li>impersonate another person or organisation in a way likely to deceive.</li>
        </ul>
      </Section>

      <Section heading="Availability, suspension and termination">
        <p>
          We do not promise any particular level of availability, and there may be downtime for
          maintenance or for reasons outside our control.
        </p>
        <p>
          You may stop using Hypamail and delete your account at any time. We may suspend or
          terminate an account that breaches these terms, or where we are legally required to. Where
          it is reasonable and lawful to do so, we will give you notice and an opportunity to
          retrieve your mail first. If we discontinue the service, we will give reasonable advance
          notice so that you can move elsewhere.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          Hypamail is provided &quot;as is&quot;, without warranties of any kind, to the fullest
          extent permitted by law. Given that the service is free and in development, we are not
          liable for lost or undelivered mail, data loss, or any indirect or consequential loss.
        </p>
        <p>
          Nothing in these terms limits liability that cannot be limited by law — including
          liability for death or personal injury caused by negligence, for fraud, and any
          non-excludable rights you have as a consumer under EU or national law. If you are a
          consumer in the EU, your statutory rights are unaffected by anything written here.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by Polish law, and the Polish courts have jurisdiction. If you
          are a consumer, you keep the protection of the mandatory rules of the country where you
          live, and you may bring proceedings in your local courts — nothing here takes that away.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms. The date at the top of this page shows the current version, and
          we will give notice of material changes before they take effect. Continuing to use
          Hypamail after that means you accept the new terms.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms:{" "}
          <strong className="text-foreground">usekiko@hypamail.me</strong>, or{" "}
          <strong className="text-foreground">id4rp02s@gmail.com</strong> if you get no reply.
        </p>
      </Section>
    </LegalPage>
  );
}

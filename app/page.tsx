import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ShineLink, SecondaryLink } from "@/components/ui/link-button";
import { MIcon } from "@/components/ui/material-icon";
import { Navbar, PAGE_WIDTH } from "@/components/navbar";
import { Footer } from "@/components/footer";

const DISPLAY_FONT = "'SF Pro Display', var(--font-inter), Inter, sans-serif";
const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";

const FEATURES = [
  {
    icon: "block",
    title: "No tracking",
    body: "Images and scripts are stripped from every email, so senders can't tell when you opened it.",
  },
  {
    icon: "report",
    title: "Spam gets a label",
    body: "Junk stays in your inbox with a warning on it, so a code you needed never goes missing.",
  },
  {
    icon: "key",
    title: "A password you don't pick",
    body: "One is made for you at signup and shown once. Save it somewhere safe.",
  },
  {
    icon: "mail_lock",
    title: "Quiet by design",
    body: "Invite-only, so it stays small. No ads, no profiling.",
  },
];

const STEPS = [
  {
    title: "Get an invite",
    body: "One code makes one address.",
  },
  {
    title: "Pick a username",
    body: `Claim you@${DOMAIN} and save the password you're given.`,
  },
  {
    title: "Read your mail",
    body: "Sign in from any browser.",
  },
];

const LIMITS = [
  {
    title: "Sending",
    body: "You can receive mail, but not send it.",
  },
  {
    title: "Attachments",
    body: "You can read messages, but attachments aren't downloadable yet.",
  },
  {
    title: "Early build",
    body: "Things may change, or break, while we're building it.",
  },
];

export default async function Home() {
  if (await getSession()) redirect("/mail");

  return (
    <div className="min-h-screen bg-[#151515]">
      <Navbar />

      <main className={`mx-auto ${PAGE_WIDTH} px-6`}>
        <section className="pt-36 pb-28 lg:pt-48 lg:pb-40">
          <h1
            className="max-w-[880px] text-[clamp(36px,6vw,64px)] leading-[1.05] tracking-tight text-[#f7f8f8]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            Your own private inbox
          </h1>
          <p className="mt-5 max-w-[620px] text-[16px] leading-relaxed text-[#898e97]">
            A clean email address on {DOMAIN}. Pick a username, get an inbox, and read it from
            anywhere.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ShineLink href="/signup">Create your address</ShineLink>
            <SecondaryLink href="/login" size="lg">
              Sign in
            </SecondaryLink>
          </div>
        </section>

        <section className="py-28 lg:py-36">
          <h2
            className="text-[13px] uppercase tracking-widest text-[#898e97]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            What you get
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-[12px] border border-[rgba(255,255,255,0.1)] bg-[#0a0b0c] p-5"
              >
                <MIcon name={f.icon} size={20} className="text-[#f7f8f8]" />
                <h3
                  className="mt-3 text-[15px] tracking-tight text-[#f7f8f8]"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#898e97]">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-28 lg:py-36">
          <h2
            className="text-[13px] uppercase tracking-widest text-[#898e97]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            How it works
          </h2>
          <ol className="mt-10 grid gap-8 list-none p-0 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="text-[13px] text-[#898e97] tabular-nums">0{i + 1}</span>
                <h3
                  className="mt-2 text-[15px] tracking-tight text-[#f7f8f8]"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  {s.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#898e97]">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="py-28 lg:py-36">
          <h2
            className="text-[13px] uppercase tracking-widest text-[#898e97]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            What it doesn&apos;t do
          </h2>
          <dl className="mt-10 flex flex-col gap-6">
            {LIMITS.map((l) => (
              <div key={l.title} className="flex flex-col gap-1 sm:flex-row sm:gap-8">
                <dt
                  className="w-[160px] shrink-0 text-[14px] tracking-tight text-[#f7f8f8]"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  {l.title}
                </dt>
                <dd className="m-0 text-[13px] leading-relaxed text-[#898e97]">{l.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="py-28 lg:py-36">
          <h2
            className="text-[clamp(22px,3vw,30px)] tracking-tight text-[#f7f8f8]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            Ready when you are
          </h2>
          <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-[#898e97]">
            Bring an invite code and you&apos;ll have an address in under a minute.
          </p>
          <div className="mt-6">
            <ShineLink href="/signup">Create your address</ShineLink>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

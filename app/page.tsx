import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ShineLink, SecondaryLink } from "@/components/ui/link-button";
import { MIcon } from "@/components/ui/material-icon";
import { Navbar } from "@/components/navbar";

const DISPLAY_FONT = "'SF Pro Display', var(--font-inter), Inter, sans-serif";
const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";

const FEATURES = [
  {
    icon: "block",
    title: "Nothing loads from the sender",
    body: "Images, scripts, and every other kind of remote content are stripped out before a message renders. Tracking pixels have nothing to phone home with.",
  },
  {
    icon: "report",
    title: "Spam is labelled, not hidden",
    body: "Junk arrives in your inbox with a warning on it instead of disappearing into a folder you forget to check. The confirmation code you needed is still there.",
  },
  {
    icon: "key",
    title: "A password you don't pick",
    body: "One is generated for you at signup and shown once. It's stored encrypted, and it never reaches your browser after that.",
  },
  {
    icon: "mail_lock",
    title: "Quiet by design",
    body: "Invite-only, so it stays small. No ads, no profiling, no third parties reading your mail.",
  },
];

const STEPS = [
  {
    title: "Get an invite",
    body: "Hypamail is invite-only while it's early. One code creates one address.",
  },
  {
    title: "Pick a username",
    body: `Claim you@${DOMAIN}. A password is generated for you, so save it. It's shown once.`,
  },
  {
    title: "Read your mail",
    body: "Sign in from any browser. Your inbox is there, stripped clean and ready.",
  },
];

const LIMITS = [
  {
    title: "Sending",
    body: "Hypamail receives mail only. There's no compose window, and the server can't send at all. It's firewalled off, not just hidden in the UI.",
  },
  {
    title: "Attachments",
    body: "Messages render as text and formatted HTML. Attachments aren't downloadable from the web app yet.",
  },
  {
    title: "It's an early build",
    body: "Things may change, and occasionally break, while we're building it.",
  },
];

export default async function Home() {
  if (await getSession()) redirect("/mail");

  return (
    <div className="min-h-screen bg-[#151515]">
      <Navbar />

      <main className="mx-auto max-w-[880px] px-6">
        <section className="pt-32 pb-20 lg:pt-40 lg:pb-24">
          <h1
            className="max-w-[760px] text-[clamp(34px,6vw,56px)] leading-[1.05] tracking-tight text-[#f7f8f8]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            Your own private inbox
          </h1>
          <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed text-[#898e97]">
            A clean email address on {DOMAIN}. Pick a username, get an inbox, and read it from
            anywhere, without the sender learning when you opened it, where you were, or what
            you clicked.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ShineLink href="/signup">Create your address</ShineLink>
            <SecondaryLink href="/login" size="lg">
              Sign in
            </SecondaryLink>
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <h2
            className="text-[13px] uppercase tracking-widest text-[#898e97]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            What you get
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
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

        <section className="py-16 lg:py-20">
          <h2
            className="text-[13px] uppercase tracking-widest text-[#898e97]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 list-none p-0 sm:grid-cols-3">
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

        <section className="py-16 lg:py-20">
          <h2
            className="text-[13px] uppercase tracking-widest text-[#898e97]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            What it doesn&apos;t do
          </h2>
          <dl className="mt-8 flex flex-col gap-6">
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

        <section className="py-16 lg:py-24">
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

      <footer>
        <div className="mx-auto flex max-w-[880px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-[12px] text-[#898e97]">
          <span>{DOMAIN}</span>
          <span>Early access, invite-only.</span>
        </div>
      </footer>
    </div>
  );
}

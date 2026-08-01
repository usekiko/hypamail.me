import { redirect } from "next/navigation";
import { Instrument_Sans } from "next/font/google";
import { getSession } from "@/lib/session";
import { buttonVariants } from "@heroui/react";
import { Navbar } from "@/components/navbar";
import Link from "next/link";
import Beams from "./ui/BeamsClient";
import "./heroui.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";

export default async function Home() {
  if (await getSession()) redirect("/mail");

  return (
    <div className={`${instrumentSans.className} heroui-scope bg-background text-foreground flex h-dvh flex-col overflow-hidden`}>
      <Navbar />

      <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <div className="absolute inset-0 h-full w-full">
          <Beams
            beamWidth={2.7}
            beamHeight={30}
            beamNumber={13}
            lightColor="#89b6ff"
            speed={2}
            noiseIntensity={3}
            scale={0.11}
            rotation={0}
          />
        </div>
        {/* Only fade the last sliver into solid black so the hero meets the
            footer cleanly -- the beams should stay visible everywhere else. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(to_bottom,transparent,var(--background))]" />

        <div className="relative z-10 mx-auto flex w-full flex-col items-center px-6 text-center">
          {/* The single-line headline is a desktop rule. Holding it to one line
              on a phone would size it off the viewport width (~15px at 375px),
              smaller than the body copy under it, so below sm it wraps. The
              size is picked to fit "Finally, an inbox that" on one line but not
              the whole sentence, which drops "shuts up" onto the second row.
              No text-balance: balancing would even the lines out and break
              after "inbox" instead. */}
          <h1 className="text-[clamp(22px,6.8vw,30px)] font-semibold tracking-tight text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.6)] sm:whitespace-nowrap sm:text-[clamp(24px,4.6vw,52px)]">
            Finally, an inbox that <span className="text-white/50 underline">shuts up</span>
          </h1>
          <p className="mt-3 max-w-[480px] text-base leading-relaxed text-white/60 sm:mt-2">
            Grab a <span className="text-white/80">@{DOMAIN}</span> and start using it today
          </p>
          {/* One row at every width. .button--lg is px-4/text-base, and two of
              them overflow a 320px screen, so they trim down below sm. */}
          <div className="mt-8 flex flex-row items-center justify-center gap-2.5 sm:mt-9 sm:gap-3">
            <Link
              href="/signup"
              className={`${buttonVariants({ variant: "primary", size: "lg" })} px-3.5 text-sm sm:px-4 sm:text-base`}
            >
              Create your address
            </Link>
            <Link
              href="/login"
              className={`${buttonVariants({ variant: "outline", size: "lg" })} px-3.5 text-sm sm:px-4 sm:text-base`}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="shrink-0 py-4 text-center text-sm text-muted">
        In development, held together with duct tape and spite by{" "}
        <a href="https://usekiko.com" target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
          usekiko
        </a>
      </footer>
    </div>
  );
}

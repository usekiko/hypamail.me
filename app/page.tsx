import { redirect } from "next/navigation";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import { getSession } from "@/lib/session";
import { buttonVariants } from "@heroui/react";
import Link from "next/link";
import HeroBackdrop from "./ui/HeroBackdrop";
import "./heroui.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic" });

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";

export default async function Home() {
  if (await getSession()) redirect("/mail");

  return (
    <div className={`${instrumentSans.className} heroui-scope bg-background text-foreground flex h-dvh flex-col overflow-hidden`}>
      <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <HeroBackdrop />
        {/* Only fade the last sliver into solid black so the hero meets the
            footer cleanly -- the beams should stay visible everywhere else. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(to_bottom,transparent,var(--background))]" />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-6 text-center lg:flex-row lg:justify-between lg:gap-10 lg:text-left">
          <div className="flex flex-col items-center lg:items-start">
            {/* One line each from lg up, where the column is wide enough for it.
                Below lg both wrap -- holding "Finally, an inbox that shuts up"
                on one line at phone width would size it smaller than the body
                copy under it. */}
            <h1 className="text-[clamp(24px,7.4vw,34px)] font-semibold tracking-tight text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.6)] sm:text-[clamp(28px,3.6vw,46px)] lg:whitespace-nowrap">
              Finally, an{" "}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://r2.hypastack.com/cdn/hypamail-logos/hypamail.webp"
                alt="Hypamail"
                width={500}
                height={500}
                draggable={false}
                className="inline-block h-[1.3em] w-auto -mx-[0.08em] select-none align-[-0.28em]"
              />{" "}
              inbox that is{" "}
              <span className={`${instrumentSerif.className} font-normal italic`}>actually</span>{" "}
              private.
            </h1>
            <p className="mt-3 max-w-[480px] text-lg leading-relaxed text-white/60 sm:mt-2 sm:text-xl lg:max-w-none lg:whitespace-nowrap">
              Grab a <span className="text-white/80">@{DOMAIN}</span> and start using it today
            </p>
            {/* One row at every width. .button--lg is px-4/text-base, and two of
                them overflow a 320px screen, so they trim down below sm. */}
            <div className="mt-5 flex flex-row items-center justify-center gap-2.5 sm:mt-6 sm:gap-3 lg:justify-start">
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
                Log in
              </Link>
            </div>
          </div>

        </div>
      </section>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 py-4 text-center text-sm text-muted">
        <span>
          In development, held together with duct tape and spite by{" "}
          <a href="https://usekiko.com" target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
            usekiko
          </a>
        </span>
        <span className="flex items-center gap-x-4">
          <Link href="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
        </span>
      </footer>
    </div>
  );
}

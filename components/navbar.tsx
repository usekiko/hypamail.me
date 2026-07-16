import Link from "next/link";
import { ShineLink, SecondaryLink } from "@/components/ui/link-button";

/**
 * The page's content width. The navbar pill and the sections below it must use
 * the same value or the pill visibly misaligns with the content, so it lives
 * here (the navbar is what makes the width legible) and pages import it.
 * Kept as a literal so Tailwind's scanner still sees the class.
 */
export const PAGE_WIDTH = "max-w-[1100px]";

/** Floating pill navbar, matching hypastack's. Fixed, so give the page top padding. */
export function Navbar() {
  return (
    <header
      className={`fixed z-[9999] top-3 sm:top-4 left-0 right-0 mx-auto w-[calc(100%-1.5rem)] ${PAGE_WIDTH} bg-[rgba(8,9,10,0.55)] backdrop-blur-2xl rounded-2xl border border-[rgba(255,255,255,0.08)] py-2 px-4 sm:px-5`}
    >
      <div className="w-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            decoding="async"
            src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
            alt="hypamail"
            className="w-[32px] h-[32px] object-contain select-none pointer-events-none"
            draggable={false}
          />
        </Link>
        <div className="flex items-center gap-2">
          <SecondaryLink href="/login" size="sm">
            Sign in
          </SecondaryLink>
          <ShineLink href="/signup" size="sm">
            Create address
          </ShineLink>
        </div>
      </div>
    </header>
  );
}

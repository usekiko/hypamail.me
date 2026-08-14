import Link from "next/link";
import { buttonVariants } from "@heroui/react";

/**
 * The page's content width. The navbar pill and the sections below it must use
 * the same value or the pill visibly misaligns with the content, so it lives
 * here (the navbar is what makes the width legible) and pages import it.
 * Kept as a literal so Tailwind's scanner still sees the class.
 */
export const PAGE_WIDTH = "max-w-[1100px]";

/** Floating pill navbar. Fixed, so give the page top padding. */
export function Navbar() {
  return (
    <header
      className={`fixed z-[9999] top-3 sm:top-4 left-0 right-0 mx-auto w-[calc(100%-1.5rem)] ${PAGE_WIDTH} bg-surface/70 backdrop-blur-2xl rounded-2xl border border-border py-2 px-4 sm:px-5`}
    >
      <div className="w-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            decoding="async"
            src="https://r2.hypastack.com/cdn/hypamail-logos/hypamail.webp"
            alt="hypamail"
            className="w-[32px] h-[32px] object-contain select-none pointer-events-none"
            draggable={false}
          />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants({ variant: "primary", size: "sm" })}>
            Create address
          </Link>
        </div>
      </div>
    </header>
  );
}

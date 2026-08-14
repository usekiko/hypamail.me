import { redirect } from "next/navigation";
import Link from "next/link";
import { Instrument_Sans } from "next/font/google";
import { buttonVariants } from "@heroui/react";
import { getSession } from "@/lib/session";
import { MIcon } from "@/components/ui/material-icon";
import SignOut from "../ui/SignOut";
import "../heroui.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <main className={`${instrumentSans.className} heroui-scope bg-background min-h-dvh p-4 sm:p-6`}>
      <div className="mx-auto w-full max-w-[900px]">
        <header className="mb-6 flex items-center justify-between gap-2 sm:gap-4">
          <Link href="/mail" className="flex shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://r2.hypastack.com/cdn/hypamail-logos/hypamail.webp"
              alt="hypamail"
              draggable={false}
              className="block h-7 w-auto select-none sm:h-8"
            />
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="truncate text-[13px] text-muted">{session.email}</span>
            {/* Only for accounts granted allow_send. The server action checks
                again on every send — this is presentation, not protection. */}
            {session.user.allowSend && (
              <Link
                href="/mail/compose"
                aria-label="New message"
                title="New message"
                className={`${buttonVariants({ variant: "outline", size: "sm", isIconOnly: true })} shrink-0`}
              >
                <MIcon name="edit" size={16} />
              </Link>
            )}
            <Link
              href="/mail/settings"
              aria-label="Settings"
              title="Settings"
              className={`${buttonVariants({ variant: "outline", size: "sm", isIconOnly: true })} shrink-0`}
            >
              <MIcon name="settings" size={16} />
            </Link>
            {/* SignOut (not a bare logout form): it wipes the unlocked mail key
                from sessionStorage before the server session is revoked. */}
            <SignOut />
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

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
    <main className={`${instrumentSans.className} heroui-scope bg-background min-h-dvh p-6`}>
      <div className="mx-auto w-full max-w-[900px]">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link href="/mail" className="flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
              alt="hypamail"
              className="block h-8 w-auto"
            />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-[13px] text-muted">{session.email}</span>
            <Link
              href="/mail/settings"
              aria-label="Settings"
              title="Settings"
              className={buttonVariants({ variant: "outline", size: "sm", isIconOnly: true })}
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

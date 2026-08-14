import Link from "next/link";
import { Instrument_Sans } from "next/font/google";
import { MIcon } from "@/components/ui/material-icon";
import "../heroui.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${instrumentSans.className} heroui-scope bg-background text-foreground min-h-screen`}>
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <MIcon name="arrow_back" size={16} />
          Back
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-10 flex flex-col gap-8 text-[15px] leading-relaxed text-white/70">{children}</div>
      </main>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}

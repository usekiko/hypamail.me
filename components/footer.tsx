import Link from "next/link";
import { FOOTER_COLUMNS } from "@/constants/footer";

const linkClass =
  "text-white/55 hover:text-white text-[13px] font-light transition-colors duration-200 hover:bg-[#1c1c1c] rounded-lg px-2 py-1.5 w-fit relative right-2";

export function Footer() {
  return (
    <footer className="w-full max-w-[1200px] p-2 mx-auto">
      <div className="rounded-2xl bg-[rgba(15,15,15,0.65)] border border-[rgba(38,38,38,0.6)] px-5 py-6 sm:px-7 sm:py-7 lg:px-9 lg:py-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          {/* Brand */}
          <div className="flex flex-col items-start gap-3 max-w-[300px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
              alt="hypamail"
              className="h-8 w-auto object-contain select-none pointer-events-none"
              draggable={false}
            />
            <p className="text-white/50 text-[13px] font-light leading-relaxed max-w-[240px]">
              A private inbox on hypamail.me. Invite-only, and nothing loads from the sender.
            </p>
            <div className="text-white/40 text-[11px] font-light leading-relaxed">
              © 2026 Hypamail
            </div>
          </div>

          {/* Link columns — grouped on the right, close together */}
          <div className="flex gap-12 sm:gap-16">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col">
                <h3 className="text-[13px] font-medium text-white/90 mb-3">{col.title}</h3>
                {col.links.map((link) =>
                  link.href.startsWith("http") ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                      title={link.label}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.label} href={link.href} className={linkClass} title={link.label}>
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

import { MIcon } from "@/components/ui/material-icon";

const DISPLAY_FONT = "'SF Pro Display', var(--font-inter), Inter, sans-serif";

const FEATURES = [
  { icon: "block", label: "Images and scripts stripped from every email" },
  { icon: "visibility_off", label: "No tracking pixels, ever" },
  { icon: "report", label: "Spam surfaced, not silently hidden" },
  { icon: "mail_lock", label: "Invite-only. Receive-only." },
];

/** Right-hand marketing panel. Hidden below lg, matching hypastack's auth pages. */
export function AuthPanel() {
  return (
    <div className="hidden lg:flex w-[440px] xl:w-[540px] shrink-0 flex-col justify-center items-start p-10 xl:p-14 bg-[#1e1e20] border-l border-[rgba(255,255,255,0.1)] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)] pointer-events-none" />
      <div className="w-full relative z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
          alt="hypamail"
          className="h-[96px] w-auto mb-6 object-contain"
        />
        <h2
          className="text-[18px] font-medium tracking-wide text-[#f7f8f8] mb-5 leading-snug text-left"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          A private inbox that doesn&apos;t leak.
        </h2>
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {FEATURES.map((f) => (
            <li key={f.icon} className="flex items-center gap-3 text-[13px] text-[#898e97]">
              <MIcon name={f.icon} size={16} />
              {f.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Left-hand column: logo, heading, and the form itself. */
export function AuthColumn({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center lg:items-start lg:pl-[12%] xl:pl-[16%] justify-center px-8 py-12">
      <div className="relative z-10 w-full max-w-[360px]">
        <div className="mb-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
            alt="hypamail"
            className="w-[44px] h-[44px] object-contain"
          />
        </div>
        <h1
          className={`text-[28px] font-semibold tracking-tight text-[#f7f8f8] ${subtitle ? "mb-1" : "mb-6"}`}
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {title}
        </h1>
        {subtitle && <p className="text-[14px] text-[#898e97] mb-8">{subtitle}</p>}
        {children}
        <p className="mt-4 text-[13px] text-[#898e97] pl-1">{footer}</p>
      </div>
    </div>
  );
}

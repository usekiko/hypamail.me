// Pitch-black / HeroUI-token variant of components/auth-panel.tsx's
// AuthColumn, used only by login and signup. Deliberately a separate
// component rather than a variant prop on the shared one: recover and
// login/legacy keep the original light-panel look untouched.

/** Centred column: logo, heading, and the form itself. */
export function DarkAuthColumn({
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
    <div className="relative flex flex-1 flex-col items-center justify-center px-8 py-12">
      <div className="relative z-10 w-full max-w-[360px]">
        <div className="mb-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://r2.hypastack.com/cdn/fepvmb5y0u31/hypamail.webp"
            alt="hypamail"
            className="w-[44px] h-[44px] object-contain"
          />
        </div>
        <h1 className={`text-[28px] font-semibold tracking-tight text-foreground ${subtitle ? "mb-1" : "mb-6"}`}>
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted mb-8">{subtitle}</p>}
        {children}
        <p className="mt-4 text-sm text-muted pl-1">{footer}</p>
      </div>
    </div>
  );
}

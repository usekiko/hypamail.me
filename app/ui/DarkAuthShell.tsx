// Pitch-black / HeroUI-token auth shell, shared by login, signup, recover and
// login/legacy. Separate from components/auth-panel.tsx (which is shared with
// hypastack) rather than a variant prop on it.
import LoadingCover from "./LoadingCover";

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
      <LoadingCover showText={false} minShowMs={350} />
      <div className="relative z-10 w-full max-w-[360px]">
        <div className="mb-2 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://r2.hypastack.com/cdn/hypamail-logos/hypamail.webp"
            alt="hypamail"
            draggable={false}
            className="w-[72px] h-[72px] select-none object-contain"
          />
        </div>
        <h1 className={`text-center text-[28px] font-semibold tracking-tight text-foreground ${subtitle ? "mb-1" : "mb-6"}`}>
          {title}
        </h1>
        {subtitle && <p className="text-center text-sm text-muted mb-8">{subtitle}</p>}
        {children}
        <p className="mt-4 text-sm text-muted pl-1">{footer}</p>
      </div>
    </div>
  );
}

"use client";

// Collapsible help shown on the passkey steps, for users who can't create or use
// a passkey on their current device.
export default function PasskeyHelp() {
  return (
    <details className="mt-4 text-xs text-muted">
      <summary className="cursor-pointer hover:text-foreground">
        Struggling with passkeys?
      </summary>
      <div className="mt-2 flex flex-col gap-2 leading-[1.6]">
        <p className="m-0">
          <b className="text-foreground">Security key — most secure.</b> A{" "}
          <a
            href="https://solokeys.com/"
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-foreground underline"
          >
            SoloKey 2
          </a>{" "}
          is open-source and cheap. Plug it in, tap it, done.
        </p>
        <p className="m-0">
          <b className="text-foreground">Your phone — easiest.</b> Pick &ldquo;use a phone or
          tablet&rdquo;, scan the QR code, approve with Face ID or your fingerprint.{" "}
          <b className="text-foreground">Bluetooth must be on</b> for both devices, and they need
          to be near each other — that proximity check is what makes passkeys unphishable.
        </p>
      </div>
    </details>
  );
}

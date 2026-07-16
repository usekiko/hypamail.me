"use client";

// Collapsible help shown on the passkey steps, for users who can't create or use
// a passkey on their current device.
export default function PasskeyHelp() {
  return (
    <details className="mt-4 text-[13px] text-[#898e97]">
      <summary className="cursor-pointer text-[#b9bec6] hover:text-[#f7f8f8]">
        Struggling to make or sign in with a passkey?
      </summary>
      <div className="mt-3 leading-[1.7]">
        <p className="m-0 mb-3">
          <b className="text-[#f7f8f8]">Most secure — a security key.</b> We recommend the{" "}
          <a
            href="https://solokeys.com/"
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-[#f7f8f8] underline"
          >
            SoloKey 2
          </a>
          : fully open-source hardware and firmware, and cheap. Plug it in and tap it —
          nothing to install, and your key never leaves the device.
        </p>
        <p className="m-0">
          <b className="text-[#f7f8f8]">Easiest — your phone.</b>{" "}
          On the passkey prompt choose
          &ldquo;use a phone or tablet&rdquo; and scan the QR code with your phone&apos;s camera,
          then approve with Face ID or your fingerprint.{" "}
          <b className="text-[#f7f8f8]">Bluetooth must be switched on</b> on both your phone and
          this computer, and the two need to be near each other — that proximity check is part of
          what makes a passkey impossible to phish. The passkey is saved on your phone and syncs
          to your other devices.
        </p>
      </div>
    </details>
  );
}

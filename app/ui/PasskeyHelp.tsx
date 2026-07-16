"use client";

// Collapsible help shown on the passkey steps, for users who can't create or use
// a passkey on their current device.
export default function PasskeyHelp() {
  return (
    <details style={{ marginTop: "1rem", fontSize: "13px", color: "#9a9a9a" }}>
      <summary style={{ cursor: "pointer", color: "#bbb" }}>
        Struggling to make or sign in with a passkey?
      </summary>
      <div style={{ marginTop: "0.75rem", lineHeight: 1.7 }}>
        <p style={{ margin: "0 0 0.75rem" }}>
          <b style={{ color: "#ddd" }}>Most secure — a security key.</b> We recommend the{" "}
          <a href="https://solokeys.com/" target="_blank" rel="noopener noreferrer nofollow">
            SoloKey 2
          </a>
          : fully open-source hardware and firmware, and cheap. Plug it in and tap it —
          nothing to install, and your key never leaves the device.
        </p>
        <p style={{ margin: 0 }}>
          <b style={{ color: "#ddd" }}>Easiest — your phone.</b>{" "}
          On the passkey prompt choose
          &ldquo;use a phone or tablet&rdquo; and scan the QR code with your phone&apos;s camera,
          then approve with Face ID or your fingerprint.{" "}
          <b style={{ color: "#ddd" }}>Bluetooth must be switched on</b> on both your phone and
          this computer, and the two need to be near each other — that proximity check is part of
          what makes a passkey impossible to phish. The passkey is saved on your phone and syncs
          to your other devices.
        </p>
      </div>
    </details>
  );
}

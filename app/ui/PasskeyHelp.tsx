"use client";

// Collapsible help shown on the passkey steps. Guides users who can't create or
// use a passkey on their current device toward the options that actually give
// the full (PRF-backed) experience, in order of security.
export default function PasskeyHelp() {
  return (
    <details style={{ marginTop: "1rem", fontSize: "13px", color: "#9a9a9a" }}>
      <summary style={{ cursor: "pointer", color: "#bbb" }}>
        Struggling to make or sign in with a passkey?
      </summary>
      <div style={{ marginTop: "0.75rem", lineHeight: 1.7 }}>
        <p style={{ margin: "0 0 0.75rem" }}>
          <b style={{ color: "#ddd" }}>Most secure — a hardware security key.</b> We recommend a{" "}
          <a href="https://www.yubico.com/products/security-key/" target="_blank" rel="noopener noreferrer nofollow">
            Yubico Security Key NFC
          </a>{" "}
          (USB-A/NFC). Prefer fully open-source hardware? The{" "}
          <a href="https://www.nitrokey.com/products/nitrokeys" target="_blank" rel="noopener noreferrer nofollow">Nitrokey 3</a>{" "}
          and{" "}
          <a href="https://solokeys.com/" target="_blank" rel="noopener noreferrer nofollow">SoloKey 2</a>{" "}
          work identically. Plug it in, tap it — nothing to install.
        </p>
        <p style={{ margin: "0 0 0.75rem" }}>
          <b style={{ color: "#ddd" }}>Easiest — your phone.</b> On the passkey prompt choose
          &ldquo;use a phone or tablet&rdquo; and scan the QR code; the passkey is saved to your
          phone (iCloud Keychain or Google Password Manager) and syncs to your other devices.
        </p>
        <p style={{ margin: 0 }}>
          <b style={{ color: "#ddd" }}>On desktop Linux / Firefox</b> there&apos;s no built-in
          passkey store, so use a security key or your phone. You can always get in with your
          recovery code + authenticator code and add a passkey afterwards.
        </p>
      </div>
    </details>
  );
}

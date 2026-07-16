"use client";

// Firefox can't reach a passkey stored on a phone: it doesn't implement the
// hybrid (caBLE) transport that draws the QR code, and on Linux it has no
// platform passkey store at all — Mozilla supports only USB security keys there.
// Nothing we send changes that, so tell affected users instead of letting them
// stare at a prompt that never offers their phone.
//
// Rendered from an effect so the markup matches on the server (where there is no
// user agent) and only appears for the browsers that actually have the problem.
import { useEffect, useState } from "react";

export default function FirefoxNote() {
  const [isFirefox, setIsFirefox] = useState(false);
  const [isLinux, setIsLinux] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsFirefox(/firefox\//i.test(ua) && !/seamonkey/i.test(ua));
    setIsLinux(/linux|x11/i.test(ua) && !/android/i.test(ua));
  }, []);

  if (!isFirefox) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
        padding: "9px 12px",
        marginTop: "1rem",
        borderRadius: 6,
        background: "rgba(216,166,87,0.12)",
        color: "#d8a657",
        fontSize: "13px",
        lineHeight: 1.6,
      }}
    >
      <span className="icon" style={{ fontSize: "18px", marginTop: "1px" }}>info</span>
      <span>
        <b>Firefox can&apos;t show the QR code</b> for signing in with a passkey on your phone
        {isLinux ? " — on Linux it only supports USB security keys" : ""}. Open hypamail in{" "}
        <b>Chrome or Brave</b> to use your phone, plug in a security key, or use your recovery
        code.
      </span>
    </div>
  );
}

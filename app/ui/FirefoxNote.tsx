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
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";

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
    <AlertMessage
      tone="warning"
      icon={<MIcon name="info" size={16} style={{ flexShrink: 0, marginRight: 8, marginTop: 2 }} />}
      style={{ marginTop: "1rem", marginBottom: 0, fontSize: 13 }}
    >
      <b>Firefox can&apos;t show the QR code</b> for signing in with a passkey on your phone
      {isLinux ? " — on Linux it only supports USB security keys" : ""}. Open hypamail in{" "}
      <b>Chrome or Brave</b> to use your phone, plug in a security key, or use your recovery
      code.
    </AlertMessage>
  );
}

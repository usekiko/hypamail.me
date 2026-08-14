"use client";

// Firefox can't reach a passkey on a phone — no hybrid (caBLE) transport, and
// on Linux no platform passkey store at all, only USB keys. Nothing we send
// changes that, so say so rather than let people stare at a prompt that never
// offers their phone. Rendered from an effect so the server markup matches.
import { useEffect, useState } from "react";
import { Alert } from "./Alert";
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
    <Alert
      tone="warning"
      icon={<MIcon name="info" size={16} style={{ flexShrink: 0, marginRight: 8, marginTop: 2 }} />}
      style={{ marginTop: "1rem", marginBottom: 0, fontSize: 13 }}
    >
      <b>Firefox can&apos;t show the QR code</b> for signing in with a passkey on your phone
      {isLinux ? " (on Linux it only supports USB security keys)" : ""}. Open hypamail in{" "}
      <b>Chrome or Brave</b> to use your phone, plug in a security key, or use your recovery
      code.
    </Alert>
  );
}

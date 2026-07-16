"use client";

// Explicitly-rendered Cloudflare Turnstile widget. The implicit (auto-scan)
// mode only renders on a full page load, so reaching the signup page via a
// client-side navigation left the widget missing and the token empty. Explicit
// render on mount works every time, and re-mounts (wizard restarts) get a
// fresh widget. The widget injects the hidden `cf-turnstile-response` input
// into the surrounding form, so callers keep reading it from FormData.
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export default function Turnstile({ siteKey }: { siteKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Script may already be present from an earlier mount — next/script won't
  // re-fire onLoad in that case.
  useEffect(() => {
    if (window.turnstile) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || !window.turnstile) return;
    const id = window.turnstile.render(ref.current, { sitekey: siteKey, theme: "dark" });
    return () => {
      try {
        window.turnstile?.remove(id);
      } catch {}
    };
  }, [ready, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onLoad={() => setReady(true)}
      />
      <div ref={ref} />
    </>
  );
}

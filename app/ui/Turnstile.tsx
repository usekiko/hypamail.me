"use client";

// Explicitly-rendered Turnstile. The auto-scan mode only fires on a full page
// load, so arriving at signup via client-side navigation left the token empty.
// Rendering on mount works every time, and a wizard restart gets a fresh widget.
// It injects the hidden cf-turnstile-response input into the surrounding form.
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

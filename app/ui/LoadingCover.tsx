"use client";

import { useEffect, useState } from "react";

const MIN_SHOW_MS = 900;
const FALLBACK_MS = 6000;

/** `extraReady` lets a page hold the cover for its own work (e.g. WebGL). */
export default function LoadingCover({
  extraReady = true,
  showText = true,
  minShowMs = MIN_SHOW_MS,
}: {
  extraReady?: boolean;
  showText?: boolean;
  minShowMs?: number;
}) {
  const [pageReady, setPageReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [gone, setGone] = useState(false);

  // window `load` covers images and subresources; fonts.ready covers webfonts,
  // which would otherwise swap in behind the cover and reflow on reveal.
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setPageReady(true);
      }
    };
    const onLoad = () => {
      const fonts = document.fonts;
      if (fonts) fonts.ready.then(finish).catch(finish);
      else finish();
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), minShowMs);
    const bail = setTimeout(() => setTimedOut(true), FALLBACK_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(bail);
    };
  }, [minShowMs]);

  const leaving = timedOut || (pageReady && extraReady && minElapsed);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(t);
  }, [leaving]);

  if (gone) return null;

  return (
    <>
      <div
        {...(showText ? { role: "status", "aria-live": "polite" as const } : { "aria-hidden": true })}
        className={`hm-cover fixed inset-0 z-50 flex items-center justify-center bg-black ${
          leaving ? "hm-cover--out pointer-events-none" : ""
        }`}
      >
        <div className="hm-intro flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://r2.hypastack.com/cdn/hypamail-logos/hypamail.webp"
            alt=""
            width={500}
            height={500}
            draggable={false}
            className="hm-mark h-[84px] w-[84px] select-none object-contain"
          />
          {showText && (
            <p className="hm-status mt-5 text-sm text-white/55">
              We&apos;re getting things ready for you
              <span className="hm-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          )}
        </div>
      </div>

      <style>{`
        .hm-cover { transition: opacity 600ms cubic-bezier(.4,0,.2,1); }
        .hm-cover--out { opacity: 0; }
        .hm-cover--out .hm-intro { animation: hm-lift 600ms cubic-bezier(.7,0,.3,1) forwards; }

        .hm-mark {
          opacity: 0;
          animation: hm-mark-in 900ms cubic-bezier(.16,1,.3,1) forwards;
          filter: drop-shadow(0 0 18px rgba(255,255,255,.35));
        }

        .hm-status { opacity: 0; animation: hm-fade-in 600ms ease 320ms forwards; }

        /* Fixed width so the growing dots can't shift the centred line. */
        .hm-dots { display: inline-block; width: 1.2em; text-align: left; }
        .hm-dots span { opacity: 0; animation: hm-dot 1.5s infinite; }
        .hm-dots span:nth-child(2) { animation-delay: .25s; }
        .hm-dots span:nth-child(3) { animation-delay: .5s; }

        @keyframes hm-mark-in {
          0%   { opacity: 0; transform: scale(.82); filter: blur(12px) drop-shadow(0 0 0 rgba(255,255,255,0)); }
          60%  { opacity: 1; filter: blur(0) drop-shadow(0 0 26px rgba(255,255,255,.45)); }
          100% { opacity: 1; transform: scale(1); filter: blur(0) drop-shadow(0 0 18px rgba(255,255,255,.35)); }
        }
        @keyframes hm-fade-in { to { opacity: 1; } }
        @keyframes hm-dot {
          0%, 12%  { opacity: 0; }
          22%, 88% { opacity: 1; }
          100%     { opacity: 0; }
        }
        @keyframes hm-lift {
          to { opacity: 0; transform: scale(1.18); filter: blur(6px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hm-mark, .hm-status, .hm-cover--out .hm-intro { animation: none; }
          .hm-mark, .hm-status { opacity: 1; filter: none; }
          .hm-dots span { animation: none; opacity: 1; }
        }
      `}</style>
    </>
  );
}

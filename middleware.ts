import { NextRequest, NextResponse } from "next/server";

// Security headers for the whole site. The CSP carries a per-request nonce —
// Next applies it to its own scripts once it sees the CSP on the request — so
// scripts never need 'unsafe-inline'.
//
// img-src is our own origin plus the R2 CDN the logo lives on. Email images
// can't load either way: the sanitizer strips every <img> before render.
//
// Next 16.2 warns that this file should be called proxy.ts. Renaming it tripped
// a Turbopack detection bug, so it stays middleware.ts until that's fixed.
export default function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' https://r2.hypastack.com`,
    // r2 serves the SF Pro Display cuts (@font-face in globals.css).
    `font-src 'self' https://fonts.gstatic.com https://r2.hypastack.com`,
    `connect-src 'self' https://challenges.cloudflare.com`,
    `frame-src https://challenges.cloudflare.com`,
    `media-src 'none'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const h = res.headers;
  h.set("Content-Security-Policy", csp);
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  // NOT "no-referrer". Per the Fetch spec that sends non-GET requests with
  // `Origin: null`, which trips Next's server-action CSRF check and kills every
  // form action. "same-origin" still leaks nothing to external sites but keeps
  // a valid Origin on our own POSTs.
  h.set("Referrer-Policy", "same-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("X-XSS-Protection", "0");
  return res;
}

export const config = {
  // Apply to all routes except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextRequest, NextResponse } from "next/server";

// Strict security headers for the whole site (Next 16 proxy). The CSP uses a
// per-request nonce (Next applies it to its own scripts automatically when it
// sees the CSP on the request) so we never need 'unsafe-inline' for scripts.
//
// img-src allows only our own origin + the hypastack R2 CDN (landing logo).
// Email images can never load regardless: the email sanitizer strips every
// <img> before render, so tracking pixels are blocked even though the app
// itself may show a logo.
export default function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' https://r2.hypastack.com`,
    `font-src 'self'`,
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
  h.set("Referrer-Policy", "no-referrer");
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

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Hypamail",
  description: "Private email on hypamail.me",
};

// Render every route per-request so the CSP nonce (set in middleware.ts) is injected
// into the page's inline scripts. Static prerendering would bake the HTML at
// build time with no nonce, and the strict CSP would then block hydration.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` marks the app dark-only: the shared UI primitives resolve their
    // theme from this class, so they never follow prefers-color-scheme to light.
    <html lang="en" className={`dark ${inter.variable}`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,500,1,200&amp;display=block" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}

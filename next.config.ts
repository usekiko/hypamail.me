import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["hypamail.me", "*.hypamail.me"],
    },
  },
};

export default nextConfig;

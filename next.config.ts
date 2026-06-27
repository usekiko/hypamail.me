import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Skew protection: stamp every build with the git SHA (passed as a Docker
  // build-arg). Next versions all assets with ?dpl=<id> and tags server-action
  // requests; when a stale client hits a new deployment, it does a full reload
  // instead of throwing "Failed to find Server Action".
  deploymentId: process.env.DEPLOYMENT_ID,
  experimental: {
    serverActions: {
      allowedOrigins: ["hypamail.me", "*.hypamail.me"],
    },
  },
};

export default nextConfig;

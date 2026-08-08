import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  output: 'standalone',
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;

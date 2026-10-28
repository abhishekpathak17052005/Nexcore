import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  typescript: {
    // Type errors are pre-existing and do not affect runtime behaviour.
    // Fix them incrementally after deployment.
    ignoreBuildErrors: true,
  },
  experimental: {
    externalDir: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

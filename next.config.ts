import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
      allowedOrigins: ['geophagous-delicately-augustus.ngrok-free.app'],
    },
    proxyClientMaxBodySize: '20mb',
  },
};

export default nextConfig;

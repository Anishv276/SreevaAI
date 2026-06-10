import type { NextConfig } from "next";

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['geophagous-delicately-augustus.ngrok-free.app'];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  webpack: (config, { dev }) => {
    if (!dev) {
      config.cache = false;
    }
    return config;
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
    serverActions: {
      bodySizeLimit: '20mb',
      allowedOrigins,
    },
    proxyClientMaxBodySize: '20mb',
  },
};

export default nextConfig;

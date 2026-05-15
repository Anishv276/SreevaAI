import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['geophagous-delicately-augustus.ngrok-free.app'];

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  webpack: (config, { dev }) => {
    if (!dev) {
      config.cache = false;
    }
    return config;
  },
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    turbopackFileSystemCacheForDev: false,
    serverActions: {
      bodySizeLimit: '20mb',
      allowedOrigins,
    },
    proxyClientMaxBodySize: '20mb',
  },
};

export default nextConfig;

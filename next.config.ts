import type { NextConfig } from "next";
// Fail closed: if ALLOWED_ORIGINS isn't set, allow no extra origins rather
// than falling back to a specific (stale, dev-only) ngrok hostname.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [];
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-67307f9b6269400eb31764dc43d0a2ce.r2.dev',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    'bcryptjs',
    'bullmq',
    'ioredis',
    'openai',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'livekit-server-sdk',
    'sharp',
  ],
  webpack: (config, { dev }) => {
    if (!dev) {
      config.cache = false;
    }
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
      allowedOrigins,
    },
    proxyClientMaxBodySize: '20mb',
  },
};
export default nextConfig;

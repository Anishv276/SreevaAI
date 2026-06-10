import type { NextConfig } from "next";

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['geophagous-delicately-augustus.ngrok-free.app'];

const nextConfig: NextConfig = {
  poweredByHeader: false,
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

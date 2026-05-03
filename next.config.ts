import type { NextConfig } from "next";

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) 
  : ['geophagous-delicately-augustus.ngrok-free.app'];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
      allowedOrigins,
    },
    middlewareClientMaxBodySize: '20mb',
    proxyClientMaxBodySize: '20mb',
  },
};

export default nextConfig;

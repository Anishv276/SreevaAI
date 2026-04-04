import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // COOP/COEP headers are ONLY needed on the assessment page for WASM SharedArrayBuffer
        // Applying globally breaks Next.js image optimization and third-party resources
        source: "/careers/assess/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;

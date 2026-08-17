import type { NextConfig } from "next";

const nextConfig: any = {
  compress: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
  },
  allowedDevOrigins: ['127.0.0.1:3000', 'localhost:3000', '127.0.0.1', 'localhost'],
  // Proxy Firebase auth handler paths so academy.prabhupadaworld.com can be used as authDomain
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://bvpw108.firebaseapp.com/__/auth/:path*',
      },
      {
        source: '/__/firebase/:path*',
        destination: 'https://bvpw108.firebaseapp.com/__/firebase/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep production builds from replacing a running development server's modules.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Enable standalone output for Docker optimization
  output: 'standalone',
};

export default nextConfig;

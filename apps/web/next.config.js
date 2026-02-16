/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting runs in dedicated turbo tasks.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type-checking runs in dedicated turbo tasks.
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["bcrypt"],
  },
};

module.exports = nextConfig;

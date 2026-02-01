/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@sme-studio/db",
    "@sme-studio/sme-engine",
    "@sme-studio/stt",
    "@sme-studio/subtitle-parser",
    "@sme-studio/pdf-generator",
  ],
};

module.exports = nextConfig;

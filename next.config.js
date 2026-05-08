/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;

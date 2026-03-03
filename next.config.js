/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 👇 This silences the error and tells Next you’re OK with Turbopack
  turbopack: {},

  // keep your existing webpack config if you have one
  webpack: (config) => {
    return config;
  },
};

module.exports = nextConfig;

experimental: {
  serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core']
}
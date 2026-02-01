/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      '@data': './data'  // maps @data → root/data/
    }
  }
};

module.exports = nextConfig;

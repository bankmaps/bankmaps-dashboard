/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove or comment out the turbopack block to disable Turbopack
  // turbopack: { ... }  ← delete or comment this entire object

  // If you still want the @data alias (works in both Webpack and Turbopack via tsconfig.json paths)
  // Best: Add this to your tsconfig.json "compilerOptions" instead:
  // "paths": {
  //   "@data/*": ["./data/*"]
  // }
  // But if you prefer keeping it here for Turbopack compatibility later:
  webpack: (config) => {
    config.resolve.alias['@data'] = './data';
    return config;
  },
  // OR for Turbopack future-proofing (but since we're disabling now, optional):
  // turbopack: {
  //   resolveAlias: {
  //     '@data': './data',
  //   }
  // }
};

module.exports = nextConfig;

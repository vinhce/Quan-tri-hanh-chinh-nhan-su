import path from 'path';

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  ...(isProd ? { output: 'export' } : {}),
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@vladmandic/human': path.resolve(
        process.cwd(),
        'node_modules/@vladmandic/human/dist/human.esm.js'
      ),
    };
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/out/**',
          '**/models/**',
          '**/training_data/**',
          '**/data/**',
          '**/.data/**',
          '**/services/periocular-onnx/.venv/**',
          '**/scratch/**',
          '**/logs/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;

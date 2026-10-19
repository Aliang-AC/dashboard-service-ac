import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  /* foto bukti kerja dikirim lewat server action (sudah dikecilkan di HP, ±200–400 KB) */
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

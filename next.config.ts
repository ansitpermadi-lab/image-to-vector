import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Diisi mis. "/image-to-vector" saat deploy ke GitHub Pages (project site).
  basePath: process.env.BASE_PATH ?? "",
};

export default nextConfig;

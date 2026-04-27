import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@mui/material",
    "@mui/system",
    "@mui/utils",
    "@mui/icons-material",
    "@mui/x-data-grid",
    "@mui/x-date-pickers",
  ],
  experimental: {
    optimizePackageImports: [],
    webpackBuildWorker: false,
  },
};

export default nextConfig;

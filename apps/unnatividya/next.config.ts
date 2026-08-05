import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const appRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: appRoot,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "commons.wikimedia.org",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/sitemap-index.xml",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }],
      },
      {
        source: "/sitemaps/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/universities/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=600, stale-while-revalidate=86400" }],
      },
      {
        source: "/courses/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;

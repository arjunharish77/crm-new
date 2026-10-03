import type { MetadataRoute } from "next";

// Installable app details and icons (brand assets in public/brand).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unnatify",
    short_name: "Unnatify",
    description: "Secure, multi-tenant CRM SaaS",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1b6c31",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

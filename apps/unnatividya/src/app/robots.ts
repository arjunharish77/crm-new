import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const host = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/lead"],
      },
    ],
    sitemap: [`${host}/sitemap-index.xml`, `${host}/sitemap.xml`],
  };
}

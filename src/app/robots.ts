import type { MetadataRoute } from "next";

// This is an internal, authenticated CRM -- nothing here should be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}

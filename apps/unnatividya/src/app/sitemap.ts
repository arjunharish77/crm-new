import type { MetadataRoute } from "next";
import { blogSitemapUrls, courseSitemapUrls, feeGuideSitemapUrls, staticSitemapUrls, universitySitemapUrls } from "@/lib/sitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return [...staticSitemapUrls(), ...courseSitemapUrls(), ...universitySitemapUrls(), ...blogSitemapUrls(), ...feeGuideSitemapUrls()].map((entry) => ({
    url: entry.loc,
    lastModified: entry.lastmod ? new Date(entry.lastmod) : new Date(),
    changeFrequency: entry.changefreq,
    priority: entry.priority,
  }));
}

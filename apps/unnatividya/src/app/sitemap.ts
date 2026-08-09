import type { MetadataRoute } from "next";
import {
  blogSitemapUrls,
  careerScopeGuideSitemapUrls,
  comparisonSitemapUrls,
  courseSitemapUrls,
  eligibilityGuideSitemapUrls,
  feeGuideSitemapUrls,
  specializationSitemapUrls,
  staticSitemapUrls,
  ugcApprovalGuideSitemapUrls,
  universitySitemapUrls,
} from "@/lib/sitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...staticSitemapUrls(),
    ...courseSitemapUrls(),
    ...universitySitemapUrls(),
    ...blogSitemapUrls(),
    ...feeGuideSitemapUrls(),
    ...eligibilityGuideSitemapUrls(),
    ...careerScopeGuideSitemapUrls(),
    ...ugcApprovalGuideSitemapUrls(),
    ...comparisonSitemapUrls(),
    ...specializationSitemapUrls(),
  ].map((entry) => ({
    url: entry.loc,
    lastModified: entry.lastmod ? new Date(entry.lastmod) : new Date(),
    changeFrequency: entry.changefreq,
    priority: entry.priority,
  }));
}

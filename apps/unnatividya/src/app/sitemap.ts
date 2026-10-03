export const dynamic = "force-dynamic";

import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getPublishedCatalog();
  return [
    ...staticSitemapUrls(),
    ...courseSitemapUrls(catalog),
    ...universitySitemapUrls(catalog),
    ...blogSitemapUrls(),
    ...feeGuideSitemapUrls(catalog),
    ...eligibilityGuideSitemapUrls(),
    ...careerScopeGuideSitemapUrls(),
    ...ugcApprovalGuideSitemapUrls(),
    ...comparisonSitemapUrls(catalog),
    ...specializationSitemapUrls(catalog),
  ].map((entry) => ({
    url: entry.loc,
    lastModified: entry.lastmod ? new Date(entry.lastmod) : undefined,
    changeFrequency: entry.changefreq,
    priority: entry.priority,
  }));
}

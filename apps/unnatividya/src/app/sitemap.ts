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
import { getPublishedArticles } from "@/lib/articles-server";
import { isCompleteEligibilityRule } from "@/lib/eligibility-rules";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getPublishedCatalog();
  const hasEligibilityRules = catalog.courses.some(course => isCompleteEligibilityRule(catalog.courseWithUniversity(course).eligibilityRules));
  return [
    ...staticSitemapUrls(hasEligibilityRules, catalog.courses.some(course => Boolean(catalog.courseWithUniversity(course).recognition))),
    ...courseSitemapUrls(catalog),
    ...universitySitemapUrls(catalog),
    ...blogSitemapUrls(await getPublishedArticles()),
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

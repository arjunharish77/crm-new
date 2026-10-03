import { catalogLastModified } from "@/lib/catalog-snapshot";

import type { CatalogReader } from "@/lib/catalog-snapshot";

import { blogPosts } from "@/data/blog";
import { feeGuides } from "@/lib/fee-guides";
import { allComparisonPairs } from "@/lib/comparisons";
import { allCareerScopeGuides, allEligibilityGuides, allUgcApprovalGuides } from "@/data/guide-content";
import { allSpecializationPages } from "@/lib/specializations";
import { siteUrl } from "@/lib/seo-config";

export const staticSitemapRoutes = [
  "",
  "/courses",
  "/universities",
  "/compare",
  "/recommender",
  "/blog",
  "/online-degree-guides",
  "/specializations",
  "/tools/emi-calculator",
  "/how-we-verify",
  "/about",
  "/authors/content-team",
  "/privacy",
  "/terms",
  "/refund-policy",
];

export function sitemapXml(
  urls: Array<{
    loc: string;
    lastmod?: string;
    changefreq?: "daily" | "weekly" | "monthly";
    priority?: number;
  }>,
) {
  const body = urls
    .map((url) => {
      const parts = [`<loc>${escapeXml(url.loc)}</loc>`];
      if (url.lastmod) parts.push(`<lastmod>${escapeXml(url.lastmod)}</lastmod>`);
      if (url.changefreq) parts.push(`<changefreq>${url.changefreq}</changefreq>`);
      if (url.priority != null) parts.push(`<priority>${url.priority.toFixed(2)}</priority>`);
      return `<url>${parts.join("")}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function sitemapIndexXml(paths: string[]) {
  const host = siteUrl();
  const body = paths
    .map((path) => `<sitemap><loc>${escapeXml(`${host}${path}`)}</loc></sitemap>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

export function staticSitemapUrls() {
  const host = siteUrl();
  return staticSitemapRoutes.map((route) => ({
    loc: `${host}${route}`,
    lastmod: undefined,
    changefreq: "weekly" as const,
    priority: route === "" ? 1 : 0.7,
  }));
}

export function courseSitemapUrls(catalog: CatalogReader) {
  const { courses } = catalog;
  const host = siteUrl();
  return courses.map((course) => ({
    loc: `${host}/courses/${course.slug}`,
    lastmod: catalogLastModified(catalog, [course.id]),
    changefreq: "weekly" as const,
    priority: 0.85,
  }));
}

export function universitySitemapUrls(catalog: CatalogReader) {
  const { universities } = catalog;
  const host = siteUrl();
  return universities.map((university) => ({
    loc: `${host}/universities/${university.slug}`,
    lastmod: catalogLastModified(catalog, coursesForUniversity(catalog, university.id), [university.id]),
    changefreq: "weekly" as const,
    priority: 0.8,
  }));
}

export function blogSitemapUrls() {
  const host = siteUrl();
  return blogPosts.map((post) => ({
    loc: `${host}/blog/${post.slug}`,
    lastmod: new Date(post.publishedDate).toISOString(),
    changefreq: "monthly" as const,
    priority: 0.6,
  }));
}

export function feeGuideSitemapUrls(catalog: CatalogReader) {
  const host = siteUrl();
  return feeGuides(catalog).map((guide) => ({
    loc: `${host}/online-degree-guides/${guide.slug}`,
    lastmod: catalogLastModified(catalog, guide.courses.map(course=>course.id)),
    changefreq: "monthly" as const,
    priority: 0.75,
  }));
}

export function eligibilityGuideSitemapUrls() {
  const host = siteUrl();
  return allEligibilityGuides().map((guide) => ({
    loc: `${host}/online-degree-guides/${guide.slug}`,
    lastmod: undefined,
    changefreq: "monthly" as const,
    priority: 0.75,
  }));
}

export function careerScopeGuideSitemapUrls() {
  const host = siteUrl();
  return allCareerScopeGuides().map((guide) => ({
    loc: `${host}/online-degree-guides/${guide.slug}`,
    lastmod: undefined,
    changefreq: "monthly" as const,
    priority: 0.7,
  }));
}

export function ugcApprovalGuideSitemapUrls() {
  const host = siteUrl();
  return allUgcApprovalGuides().map((guide) => ({
    loc: `${host}/online-degree-guides/${guide.slug}`,
    lastmod: undefined,
    changefreq: "monthly" as const,
    priority: 0.7,
  }));
}

export function comparisonSitemapUrls(catalog: CatalogReader) {
  const host = siteUrl();
  return allComparisonPairs(catalog).map((pair) => ({
    loc: `${host}/compare/${pair.key}/${pair.slug}`,
    lastmod: catalogLastModified(catalog, [pair.left.id,pair.right.id]),
    changefreq: "monthly" as const,
    priority: 0.7,
  }));
}

export function specializationSitemapUrls(catalog: CatalogReader) {
  const host = siteUrl();
  return allSpecializationPages(catalog).map((page) => ({
    loc: `${host}/specializations/${page.slug}`,
    lastmod: catalogLastModified(catalog, page.courses.map(course=>course.id)),
    changefreq: "monthly" as const,
    priority: 0.6,
  }));
}

export function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function coursesForUniversity(catalog:CatalogReader,id:string) { return catalog.courses.filter(course=>course.universityId===id).map(course=>course.id); }

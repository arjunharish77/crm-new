import { courses, universities } from "@/data/catalog";
import { blogPosts } from "@/data/blog";
import { feeGuides } from "@/lib/fee-guides";
import { siteUrl } from "@/lib/seo-config";

export const staticSitemapRoutes = [
  "",
  "/courses",
  "/universities",
  "/compare",
  "/recommender",
  "/blog",
  "/online-degree-guides",
  "/about",
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
  const now = new Date().toISOString();
  const body = paths
    .map((path) => `<sitemap><loc>${escapeXml(`${host}${path}`)}</loc><lastmod>${now}</lastmod></sitemap>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

export function staticSitemapUrls() {
  const host = siteUrl();
  const now = new Date().toISOString();
  return staticSitemapRoutes.map((route) => ({
    loc: `${host}${route}`,
    lastmod: now,
    changefreq: "weekly" as const,
    priority: route === "" ? 1 : 0.7,
  }));
}

export function courseSitemapUrls() {
  const host = siteUrl();
  const now = new Date().toISOString();
  return courses.map((course) => ({
    loc: `${host}/courses/${course.slug}`,
    lastmod: now,
    changefreq: "weekly" as const,
    priority: 0.85,
  }));
}

export function universitySitemapUrls() {
  const host = siteUrl();
  const now = new Date().toISOString();
  return universities.map((university) => ({
    loc: `${host}/universities/${university.slug}`,
    lastmod: now,
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

export function feeGuideSitemapUrls() {
  const host = siteUrl();
  const now = new Date().toISOString();
  return feeGuides().map((guide) => ({
    loc: `${host}/online-degree-guides/${guide.slug}`,
    lastmod: now,
    changefreq: "monthly" as const,
    priority: 0.75,
  }));
}

export function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
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

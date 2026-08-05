import { sitemapIndexXml, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-static";

export function GET() {
  return xmlResponse(
    sitemapIndexXml([
      "/sitemaps/static.xml",
      "/sitemaps/courses.xml",
      "/sitemaps/universities.xml",
      "/sitemaps/blog.xml",
      "/sitemaps/guides.xml",
    ]),
  );
}

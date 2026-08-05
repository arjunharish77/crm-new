import { sitemapXml, staticSitemapUrls, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-static";

export function GET() {
  return xmlResponse(sitemapXml(staticSitemapUrls()));
}

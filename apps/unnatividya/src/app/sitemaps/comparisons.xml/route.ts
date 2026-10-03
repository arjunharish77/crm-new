import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { comparisonSitemapUrls, sitemapXml, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getPublishedCatalog();
  return xmlResponse(sitemapXml(comparisonSitemapUrls(catalog)));
}

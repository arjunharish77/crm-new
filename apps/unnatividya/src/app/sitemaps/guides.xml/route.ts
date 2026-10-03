import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { feeGuideSitemapUrls, sitemapXml, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getPublishedCatalog();
  return xmlResponse(sitemapXml(feeGuideSitemapUrls(catalog)));
}

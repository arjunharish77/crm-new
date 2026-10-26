import { blogSitemapUrls, sitemapXml, xmlResponse } from "@/lib/sitemap";
import { getPublishedArticles } from "@/lib/articles-server";

// Published articles live in the CMS database now (decision 8), so this is rendered per request.
export const dynamic = "force-dynamic";

export async function GET() {
  return xmlResponse(sitemapXml(blogSitemapUrls(await getPublishedArticles())));
}

import { sitemapXml, staticSitemapUrls, xmlResponse } from "@/lib/sitemap";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { isCompleteEligibilityRule } from "@/lib/eligibility-rules";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getPublishedCatalog();
  const hasRules = catalog.courses.some(course => isCompleteEligibilityRule(catalog.courseWithUniversity(course).eligibilityRules));
  const hasRecognition = catalog.courses.some(course => Boolean(catalog.courseWithUniversity(course).recognition));
  return xmlResponse(sitemapXml(staticSitemapUrls(hasRules, hasRecognition)));
}

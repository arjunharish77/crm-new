import type { CatalogReader } from "@/lib/catalog-snapshot";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
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
import { indexNowConfig, siteUrl } from "@/lib/seo-config";

const schema = z.object({
  urls: z.array(z.string().url()).max(10000).optional(),
});

function defaultUrls(catalog: CatalogReader) {
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
  ].map((entry) => entry.loc);
}

export async function POST(request: Request) {
  const catalog = await getPublishedCatalog();
  // F26 fix (WP16): DB-backed session check -- see getAdminSession in src/lib/admin-auth.ts for
  // why proxy.ts's cookie-only check on /api/admin/* isn't sufficient by itself.
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "CMS admin login required" }, { status: 401 });
  }

  const config = indexNowConfig();
  if (!config.enabled || !config.key) {
    return NextResponse.json({ error: "IndexNow is not configured" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid IndexNow payload" }, { status: 400 });
  }

  const host = new URL(siteUrl()).hostname;
  const urlList = parsed.data.urls?.length ? parsed.data.urls : defaultUrls(catalog);
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: config.key,
      keyLocation: config.keyLocation || `${siteUrl()}/indexnow-key`,
      urlList,
    }),
  });

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    submitted: urlList.length,
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { courseSitemapUrls, staticSitemapUrls, universitySitemapUrls } from "@/lib/sitemap";
import { indexNowConfig, siteUrl } from "@/lib/seo-config";

const schema = z.object({
  urls: z.array(z.string().url()).max(10000).optional(),
});

function defaultUrls() {
  return [...staticSitemapUrls(), ...courseSitemapUrls(), ...universitySitemapUrls()].map((entry) => entry.loc);
}

export async function POST(request: Request) {
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
  const urlList = parsed.data.urls?.length ? parsed.data.urls : defaultUrls();
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

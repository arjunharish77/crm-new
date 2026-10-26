import { cache } from "react";
import type { CareerScopeGuide, EligibilityGuide } from "@/data/guide-content";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { mergeGuide, parseGuideContent, type GuideContent, type GuideKind } from "@/lib/guide-cms";

// Wave 5 C3: the published CMS text for every guide, read once per request. A guide with no row
// (before the one-time import) or a row that fails validation keeps its code text; a database
// failure keeps the code text too, so a guide page never breaks because the CMS is unavailable.
export const getGuideContents = cache(async (): Promise<Map<string, GuideContent>> => {
  const contents = new Map<string, GuideContent>();
  let rows: Array<{ kind: GuideKind; guide_key: string; content: unknown }>;
  try { rows = (await query<{ kind: GuideKind; guide_key: string; content: unknown }>("select kind, guide_key, content from guide")).rows; }
  catch (error) { console.error(`[guides] Using the code text: ${error instanceof Error ? error.message : "database error"}`); return contents; }
  for (const row of rows) {
    try { contents.set(`${row.kind}:${row.guide_key}`, parseGuideContent(row.kind, row.guide_key, row.content)); }
    catch (error) { console.error(`[guides] Skipping invalid ${row.kind} guide ${row.guide_key}: ${error instanceof Error ? error.message : "invalid"}`); }
  }
  return contents;
});

export async function publishedGuide<T extends EligibilityGuide | CareerScopeGuide>(kind: GuideKind, guide: T): Promise<T> {
  return mergeGuide(guide, (await getGuideContents()).get(`${kind}:${guide.key}`) || null);
}

// Admin preview (Wave 5 C3): a signed-in CMS user can open any revision of a guide on the public
// guide URL with ?preview=<revision id>. Anyone else, or a revision of another guide, gets null and
// the normal page.
export async function guidePreview(kind: GuideKind, key: string, revisionId: string | undefined): Promise<GuideContent | null> {
  if (!revisionId || !z.string().uuid().safeParse(revisionId).success) return null;
  if (!(await getAdminSession())) return null;
  const row = (await query<{ content: unknown }>("select r.content from guide_revision r join guide g on g.id=r.guide_id where r.id=$1 and g.kind=$2 and g.guide_key=$3", [revisionId, kind, key])).rows[0];
  if (!row) return null;
  try { return parseGuideContent(kind, key, row.content); } catch { return null; }
}

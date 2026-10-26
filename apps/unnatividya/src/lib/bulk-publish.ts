import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { articleContentSchema } from "@/lib/article-content";
import { reviewRevision, type ArticleRevisionRow, type ArticleRow } from "@/lib/article-revisions";
import { entityTypeSchema, revisionContentSchemas, type CatalogRevision } from "@/lib/catalog-revisions";
import { validatePublishedCatalog } from "@/lib/catalog-write";
import { applyCatalogRevision } from "@/lib/catalog-apply";
import { codeGuide, parseGuideContent, type GuideKind } from "@/lib/guide-cms";
import { reviewGuideRevision, type GuideRevisionRow } from "@/lib/guide-revisions";

type CatalogRow = CatalogRevision & { proposed_content: Record<string, unknown> };
type ArticleProposal = ArticleRevisionRow & { article_slug: string | null; article_status: ArticleRow["status"] | null; current_content: ArticleRow["content"] | null };
type GuideProposal = GuideRevisionRow & { guide_kind: GuideKind; guide_key: string; current_content: unknown };
export type PublishItem = { kind: "catalog" | "article" | "guide"; id: string; label: string; href: string };
export type SkippedItem = PublishItem & { reason: string };
export type PublishPreview = { ready: PublishItem[]; skipped: SkippedItem[]; workingCatalogDrafts: number; workingArticleDrafts: number; workingGuideDrafts: number };

// Both the preview and the write use these checks. The write repeats them inside one locked
// transaction; a stale page can never publish a different batch silently.
export async function getPublishPreview(db: PoolClient, lock = false): Promise<PublishPreview> {
  // A PoolClient is one connection: issue its queries in order, especially inside the write transaction.
  const catalogResult = await db.query<CatalogRow>(`select * from catalog_revision where status='NEEDS_REVIEW' order by created_at, id${lock ? " for update" : ""}`);
  const articleResult = await db.query<ArticleProposal>(`select r.*, a.slug as article_slug, a.status as article_status, a.content as current_content
      from article_revision r left join article a on a.id=r.article_id
      where r.status='NEEDS_REVIEW' order by r.created_at, r.id${lock ? " for update of r" : ""}`);
  const guideResult = await db.query<GuideProposal>(`select r.*, g.kind as guide_kind, g.guide_key, g.content as current_content
      from guide_revision r join guide g on g.id=r.guide_id
      where r.status='NEEDS_REVIEW' order by r.created_at, r.id${lock ? " for update of r" : ""}`);
  const draftsResult = await db.query<{ catalog: number; article: number; guide: number }>(`select
      (select count(*)::int from catalog_working_draft) as catalog,
      (select count(*)::int from article_revision where status='DRAFT') as article,
      (select count(*)::int from guide_revision where status='DRAFT') as guide`);
  const catalogCounts = new Map<string, number>();
  const articleCounts = new Map<string, number>();
  for (const row of catalogResult.rows) {
    const key = `${row.entity_type}:${row.entity_id}`;
    catalogCounts.set(key, (catalogCounts.get(key) || 0) + 1);
  }
  for (const row of articleResult.rows) articleCounts.set(row.article_id, (articleCounts.get(row.article_id) || 0) + 1);
  const guideCounts = new Map<string, number>();
  for (const row of guideResult.rows) guideCounts.set(row.guide_id, (guideCounts.get(row.guide_id) || 0) + 1);

  const ready: PublishItem[] = [];
  const skipped: SkippedItem[] = [];
  for (const row of catalogResult.rows) {
    const item: PublishItem = { kind: "catalog", id: row.id, label: `${row.entity_type}: ${String(row.proposed_content?.name || row.entity_id)}`, href: `/admin/catalog-revisions?type=${row.entity_type}&id=${encodeURIComponent(row.entity_id)}` };
    const type = entityTypeSchema.safeParse(row.entity_type);
    let reason = "";
    if (!type.success) reason = "Unknown catalog record type.";
    else if ((catalogCounts.get(`${row.entity_type}:${row.entity_id}`) || 0) > 1) reason = "Multiple submitted revisions for this record; choose one manually.";
    else if (!revisionContentSchemas[type.data].safeParse(row.proposed_content).success) reason = "Proposed content no longer passes validation.";
    else {
      const current = (await db.query<{ snapshot: Record<string, unknown> }>(`select to_jsonb(t) as snapshot from ${type.data} t where id=$1${lock ? " for update" : ""}`, [row.entity_id])).rows[0]?.snapshot;
      if (!current || !isDeepStrictEqual(current, row.base_snapshot)) reason = "The live record changed since submission.";
      else if (current.status !== "PUBLISHED" || current.is_published !== true) reason = "This catalog record is not live; publish the record separately first.";
      else if (current.is_published && current.slug !== row.proposed_content.slug) reason = "A published URL change needs its own redirect review.";
    }
    if (reason) skipped.push({ ...item, reason }); else ready.push(item);
  }
  for (const row of articleResult.rows) {
    const item: PublishItem = { kind: "article", id: row.id, label: `Article: ${String(row.content?.title || row.article_slug || row.article_id)}`, href: `/admin/articles/${row.article_id}` };
    let reason = "";
    if ((articleCounts.get(row.article_id) || 0) > 1) reason = "Multiple submitted revisions for this article; choose one manually.";
    else if (!row.article_slug) reason = "Article no longer exists.";
    else if (row.scheduled_for) reason = `Scheduled to publish at ${new Date(row.scheduled_for).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST; unschedule it to publish now.`;
    else if (row.article_status === "ARCHIVED") reason = "Article is unpublished; review republishing separately.";
    else if (!articleContentSchema.safeParse(row.content).success) reason = "Proposed article no longer passes validation.";
    else if (!isDeepStrictEqual(row.current_content ?? null, row.base_content ?? null)) reason = "The live article changed since this draft was started.";
    if (reason) skipped.push({ ...item, reason }); else ready.push(item);
  }
  for (const row of guideResult.rows) {
    const code = codeGuide(row.guide_kind, row.guide_key);
    const item: PublishItem = { kind: "guide", id: row.id, label: `Guide: ${code ? code.label : row.guide_key} ${row.guide_kind === "eligibility" ? "eligibility" : "career scope"}`, href: `/admin/guides/${row.guide_id}` };
    let reason = "";
    if ((guideCounts.get(row.guide_id) || 0) > 1) reason = "Multiple submitted revisions for this guide; choose one manually.";
    else if (!isDeepStrictEqual(row.current_content ?? null, row.base_content ?? null)) reason = "The live guide changed since this draft was started.";
    else { try { parseGuideContent(row.guide_kind, row.guide_key, row.content); } catch { reason = "Proposed guide no longer passes validation."; } }
    if (reason) skipped.push({ ...item, reason }); else ready.push(item);
  }
  return { ready, skipped, workingCatalogDrafts: draftsResult.rows[0]?.catalog || 0, workingArticleDrafts: draftsResult.rows[0]?.article || 0, workingGuideDrafts: draftsResult.rows[0]?.guide || 0 };
}

export async function applyPublishBatch(db: PoolClient, preview: PublishPreview, adminId: string) {
  const note = "Published together using the CMS bulk publish action.";
  for (const item of preview.ready.filter(item => item.kind === "catalog")) await applyCatalogRevision(db, item.id, adminId, note, { metadata: { bulk: true }, validate: false });
  if (preview.ready.some(item => item.kind === "catalog")) await validatePublishedCatalog(db);
  for (const item of preview.ready.filter(item => item.kind === "article")) await reviewRevision(db, adminId, item.id, "APPLY", note);
  for (const item of preview.ready.filter(item => item.kind === "guide")) await reviewGuideRevision(db, adminId, item.id, "APPLY", note);
  await db.query(`insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CMS_BULK_PUBLISH_APPLIED','cms_publish',null,$2)`,
    [adminId, { ...publishCounts(preview), revisionIds: preview.ready.map(item => item.id) }]);
}

export function publishCounts(preview: PublishPreview) {
  return { catalog: preview.ready.filter(item => item.kind === "catalog").length, articles: preview.ready.filter(item => item.kind === "article").length, guides: preview.ready.filter(item => item.kind === "guide").length };
}

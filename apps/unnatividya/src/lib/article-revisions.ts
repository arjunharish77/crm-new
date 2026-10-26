import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { z } from "zod";
import { articleContentSchema, type ArticleContent } from "@/lib/article-content";

// The article workflow (decision 8), mirroring catalog revisions: an editor keeps one open draft
// per article, submits it for review, and an administrator applies or rejects it. Applying is
// refused if the published article changed after the draft was started.
export type ArticleRow = { id: string; slug: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; content: ArticleContent | null; published_at: string | null; updated_at: string; created_at: string };
export type ArticleRevisionRow = { id: string; article_id: string; status: "DRAFT" | "NEEDS_REVIEW" | "APPLIED" | "REJECTED"; content: ArticleContent; base_content: ArticleContent | null; reason: string; restored_from: string | null; created_by: string | null; reviewed_by: string | null; review_note: string | null; created_at: string; updated_at: string; submitted_at: string | null; reviewed_at: string | null; scheduled_for?: string | null; scheduled_by?: string | null; schedule_note?: string | null; schedule_error?: string | null };

export const slugSchema = z.string().trim().min(3).max(90).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case words joined by hyphens");
export const reasonSchema = z.string().trim().max(500).default("");
export class ArticleError extends Error { constructor(message: string, public status = 400) { super(message); } }

const LOCK = 714083292; // serialises article writes, like the catalog's advisory lock

export async function lockArticles(db: PoolClient) { await db.query("select pg_advisory_xact_lock($1)", [LOCK]); }

export async function audit(db: PoolClient, userId: string, action: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await db.query("insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,$2,'article',$3,$4)", [userId, action, entityId, metadata]);
}

export function parseContent(input: unknown) {
  const parsed = articleContentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ArticleError(`${issue.path.join(".") || "content"}: ${issue.message}`);
  }
  return parsed.data;
}

export async function createArticle(db: PoolClient, userId: string, slug: string, content: ArticleContent, reason: string) {
  const existing = (await db.query("select 1 from article where slug=$1", [slug])).rowCount;
  if (existing) throw new ArticleError("An article with this URL already exists.", 409);
  const article = (await db.query<ArticleRow>("insert into article (slug, status) values ($1, 'DRAFT') returning *", [slug])).rows[0];
  const revision = (await db.query<ArticleRevisionRow>("insert into article_revision (article_id, status, content, base_content, reason, created_by) values ($1,'DRAFT',$2,null,$3,$4) returning *",
    [article.id, content, reason, userId])).rows[0];
  await audit(db, userId, "ARTICLE_CREATED", article.id, { slug });
  return { article, revision };
}

export async function saveDraft(db: PoolClient, userId: string, articleId: string, content: ArticleContent, reason: string) {
  const article = (await db.query<ArticleRow>("select * from article where id=$1 for update", [articleId])).rows[0];
  if (!article) throw new ArticleError("Article not found.", 404);
  const draft = (await db.query<ArticleRevisionRow>("select * from article_revision where article_id=$1 and created_by=$2 and status='DRAFT' for update", [articleId, userId])).rows[0];
  if (draft) return (await db.query<ArticleRevisionRow>("update article_revision set content=$2, reason=$3, updated_at=now() where id=$1 returning *", [draft.id, content, reason])).rows[0];
  return (await db.query<ArticleRevisionRow>("insert into article_revision (article_id, status, content, base_content, reason, created_by) values ($1,'DRAFT',$2,$3,$4,$5) returning *",
    [articleId, content, article.content, reason, userId])).rows[0];
}

export async function submitDraft(db: PoolClient, userId: string, articleId: string) {
  const draft = (await db.query<ArticleRevisionRow>("update article_revision set status='NEEDS_REVIEW', submitted_at=now(), updated_at=now() where article_id=$1 and created_by=$2 and status='DRAFT' returning *", [articleId, userId])).rows[0];
  if (!draft) throw new ArticleError("Save a draft before submitting it.", 409);
  if (!draft.reason.trim()) throw new ArticleError("Explain the change (what and why) before submitting.", 400);
  parseContent(draft.content);
  await audit(db, userId, "ARTICLE_REVISION_SUBMITTED", draft.id, { articleId });
  return draft;
}

export async function reviewRevision(db: PoolClient, adminId: string, revisionId: string, action: "APPLY" | "REJECT", note: string) {
  const revision = (await db.query<ArticleRevisionRow>("select * from article_revision where id=$1 for update", [revisionId])).rows[0];
  if (!revision) throw new ArticleError("Revision not found.", 404);
  if (revision.status !== "NEEDS_REVIEW") throw new ArticleError("This revision isn't waiting for review.", 409);
  if (action === "APPLY") {
    const content = parseContent(revision.content);
    const article = (await db.query<ArticleRow>("select * from article where id=$1 for update", [revision.article_id])).rows[0];
    if (!article) throw new ArticleError("Article not found.", 404);
    if (!isDeepStrictEqual(article.content ?? null, revision.base_content ?? null))
      throw new ArticleError("The article changed after this draft was started. Restore the draft onto the latest version and submit it again; nothing was published.", 409);
    await db.query(`update article set content=$2, status=case when status='ARCHIVED' then 'ARCHIVED' else 'PUBLISHED' end,
      published_at=coalesce(published_at, now()), updated_at=now() where id=$1`, [article.id, content]);
  }
  const status = action === "APPLY" ? "APPLIED" : "REJECTED";
  await db.query("update article_revision set status=$2, reviewed_by=$3, review_note=$4, reviewed_at=now(), updated_at=now() where id=$1", [revisionId, status, adminId, note]);
  await audit(db, adminId, `ARTICLE_REVISION_${status}`, revisionId, { articleId: revision.article_id });
  return status;
}

// An administrator's "Save and publish": submit their saved draft and apply it in the same
// transaction, with the same validation, stale-article check and history as a reviewed revision. A
// new article goes live; an unpublished (archived) one stays unpublished.
export async function publishDraft(db: PoolClient, adminId: string, articleId: string) {
  const draft = await submitDraft(db, adminId, articleId);
  await reviewRevision(db, adminId, draft.id, "APPLY", "Published directly by an administrator.");
  return draft;
}

// Scheduled publishing (Wave 5 C2). Scheduling runs the same checks as applying now (the content is
// valid and the article hasn't changed since the draft started), so a schedule never stores a
// revision that would be refused today. The revision stays NEEDS_REVIEW until it goes live.
export const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000;
export const SCHEDULE_MAX_LEAD_MS = 366 * 24 * 60 * 60 * 1000;

export async function scheduleRevision(db: PoolClient, adminId: string, revisionId: string, publishAt: Date, note: string, now = new Date()) {
  const lead = publishAt.getTime() - now.getTime();
  if (!Number.isFinite(lead) || lead < SCHEDULE_MIN_LEAD_MS) throw new ArticleError("Choose a time at least 5 minutes from now.");
  if (lead > SCHEDULE_MAX_LEAD_MS) throw new ArticleError("Choose a time within the next year.");
  const revision = (await db.query<ArticleRevisionRow>("select * from article_revision where id=$1 for update", [revisionId])).rows[0];
  if (!revision) throw new ArticleError("Revision not found.", 404);
  if (revision.status !== "NEEDS_REVIEW") throw new ArticleError("This revision isn't waiting for review.", 409);
  parseContent(revision.content);
  const article = (await db.query<ArticleRow>("select * from article where id=$1 for update", [revision.article_id])).rows[0];
  if (!article) throw new ArticleError("Article not found.", 404);
  if (!isDeepStrictEqual(article.content ?? null, revision.base_content ?? null))
    throw new ArticleError("The article changed after this draft was started. Restore the draft onto the latest version and submit it again; nothing was scheduled.", 409);
  await db.query("update article_revision set scheduled_for=$2, scheduled_by=$3, schedule_note=$4, schedule_error=null, updated_at=now() where id=$1", [revisionId, publishAt.toISOString(), adminId, note]);
  await audit(db, adminId, "ARTICLE_REVISION_SCHEDULED", revisionId, { articleId: revision.article_id, publishAt: publishAt.toISOString() });
}

export async function unscheduleRevision(db: PoolClient, adminId: string, revisionId: string) {
  const revision = (await db.query<ArticleRevisionRow>("select * from article_revision where id=$1 for update", [revisionId])).rows[0];
  if (!revision) throw new ArticleError("Revision not found.", 404);
  if (revision.status !== "NEEDS_REVIEW" || !revision.scheduled_for) throw new ArticleError("This revision isn't scheduled.", 409);
  await db.query("update article_revision set scheduled_for=null, scheduled_by=null, schedule_note=null, updated_at=now() where id=$1", [revisionId]);
  await audit(db, adminId, "ARTICLE_REVISION_UNSCHEDULED", revisionId, { articleId: revision.article_id });
}

// Applies every due revision through reviewRevision, as the administrator who scheduled it. A
// revision that is refused (the article changed, or the content no longer validates) stays waiting
// for review with the reason recorded, and is not retried until someone schedules it again.
export async function publishDueRevisions(db: PoolClient, now = new Date()) {
  await lockArticles(db);
  const due = (await db.query<ArticleRevisionRow>("select * from article_revision where status='NEEDS_REVIEW' and scheduled_for is not null and scheduled_for <= $1 order by scheduled_for, created_at", [now.toISOString()])).rows;
  const applied: string[] = [], failed: Array<{ id: string; error: string }> = [];
  for (const revision of due) {
    await db.query("savepoint scheduled_publish");
    try {
      if (!revision.scheduled_by) throw new ArticleError("The administrator who scheduled this revision no longer exists. Schedule or apply it again.");
      await reviewRevision(db, revision.scheduled_by, revision.id, "APPLY", `Scheduled publication${revision.schedule_note ? `: ${revision.schedule_note}` : ""}`);
      await db.query("release savepoint scheduled_publish");
      applied.push(revision.id);
    } catch (error) {
      await db.query("rollback to savepoint scheduled_publish");
      if (!(error instanceof ArticleError)) throw error;
      await db.query("update article_revision set scheduled_for=null, schedule_error=$2, updated_at=now() where id=$1", [revision.id, error.message]);
      if (revision.scheduled_by) await audit(db, revision.scheduled_by, "ARTICLE_REVISION_SCHEDULE_FAILED", revision.id, { articleId: revision.article_id, error: error.message });
      failed.push({ id: revision.id, error: error.message });
    }
  }
  return { applied, failed };
}

// Restoring an old version never publishes it: it becomes the editor's draft, based on what is
// live now, and goes through review like any other change.
export async function restoreRevision(db: PoolClient, userId: string, revisionId: string) {
  const source = (await db.query<ArticleRevisionRow>("select * from article_revision where id=$1", [revisionId])).rows[0];
  if (!source) throw new ArticleError("Revision not found.", 404);
  const article = (await db.query<ArticleRow>("select * from article where id=$1 for update", [source.article_id])).rows[0];
  await db.query("delete from article_revision where article_id=$1 and created_by=$2 and status='DRAFT'", [source.article_id, userId]);
  const draft = (await db.query<ArticleRevisionRow>(`insert into article_revision (article_id, status, content, base_content, reason, restored_from, created_by)
    values ($1,'DRAFT',$2,$3,$4,$5,$6) returning *`, [source.article_id, source.content, article.content, `Restore the version from ${new Date(source.created_at).toISOString().slice(0, 10)}`, source.id, userId])).rows[0];
  await audit(db, userId, "ARTICLE_REVISION_RESTORED_AS_DRAFT", draft.id, { articleId: source.article_id, restoredFrom: source.id });
  return draft;
}

export async function setArticleStatus(db: PoolClient, adminId: string, articleId: string, status: "PUBLISHED" | "ARCHIVED") {
  const article = (await db.query<ArticleRow>("select * from article where id=$1 for update", [articleId])).rows[0];
  if (!article) throw new ArticleError("Article not found.", 404);
  if (status === "PUBLISHED" && !article.content) throw new ArticleError("Apply a reviewed revision before publishing.", 409);
  await db.query("update article set status=$2, updated_at=now() where id=$1", [articleId, status]);
  await audit(db, adminId, status === "ARCHIVED" ? "ARTICLE_UNPUBLISHED" : "ARTICLE_REPUBLISHED", articleId, { slug: article.slug });
}

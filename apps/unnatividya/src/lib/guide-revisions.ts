import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { z } from "zod";
import { GuideContentError, parseGuideContent, type GuideContent, type GuideKind } from "@/lib/guide-cms";

// Wave 5 C3: the guide workflow, the same as articles. An editor keeps one open draft per guide,
// submits it for review, and an administrator publishes or sends it back. Publishing is refused
// if the guide changed after the draft was started.
export type GuideRow = { id: string; kind: GuideKind; guide_key: string; content: GuideContent; created_at: string; updated_at: string };
export type GuideRevisionRow = { id: string; guide_id: string; status: "DRAFT" | "NEEDS_REVIEW" | "APPLIED" | "REJECTED"; content: GuideContent; base_content: GuideContent | null; reason: string; restored_from: string | null; created_by: string | null; reviewed_by: string | null; review_note: string | null; created_at: string; updated_at: string; submitted_at: string | null; reviewed_at: string | null };

export const guideReasonSchema = z.string().trim().max(500).default("");
export class GuideError extends Error { constructor(message: string, public status = 400) { super(message); } }

const LOCK = 714083293; // serialises guide writes, next to the article lock

export async function lockGuides(db: PoolClient) { await db.query("select pg_advisory_xact_lock($1)", [LOCK]); }

export async function guideAudit(db: PoolClient, userId: string, action: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await db.query("insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,$2,'guide',$3,$4)", [userId, action, entityId, metadata]);
}

function validate(guide: GuideRow, content: unknown) {
  try { return parseGuideContent(guide.kind, guide.guide_key, content); }
  catch (error) { if (error instanceof GuideContentError) throw new GuideError(error.message); throw error; }
}

async function guideById(db: PoolClient, guideId: string, lock = false) {
  const guide = (await db.query<GuideRow>(`select * from guide where id=$1${lock ? " for update" : ""}`, [guideId])).rows[0];
  if (!guide) throw new GuideError("Guide not found.", 404);
  return guide;
}

export async function saveGuideDraft(db: PoolClient, userId: string, guideId: string, content: unknown, reason: string) {
  const guide = await guideById(db, guideId, true);
  const parsed = validate(guide, content);
  const draft = (await db.query<GuideRevisionRow>("select * from guide_revision where guide_id=$1 and created_by=$2 and status='DRAFT' for update", [guideId, userId])).rows[0];
  if (draft) return (await db.query<GuideRevisionRow>("update guide_revision set content=$2, reason=$3, updated_at=now() where id=$1 returning *", [draft.id, parsed, reason])).rows[0];
  return (await db.query<GuideRevisionRow>("insert into guide_revision (guide_id, status, content, base_content, reason, created_by) values ($1,'DRAFT',$2,$3,$4,$5) returning *",
    [guideId, parsed, guide.content, reason, userId])).rows[0];
}

export async function submitGuideDraft(db: PoolClient, userId: string, guideId: string) {
  const guide = await guideById(db, guideId);
  const draft = (await db.query<GuideRevisionRow>("update guide_revision set status='NEEDS_REVIEW', submitted_at=now(), updated_at=now() where guide_id=$1 and created_by=$2 and status='DRAFT' returning *", [guideId, userId])).rows[0];
  if (!draft) throw new GuideError("Save a draft before submitting it.", 409);
  if (!draft.reason.trim()) throw new GuideError("Explain the change (what and why) before submitting.", 400);
  validate(guide, draft.content);
  await guideAudit(db, userId, "GUIDE_REVISION_SUBMITTED", draft.id, { guideId });
  return draft;
}

export async function reviewGuideRevision(db: PoolClient, adminId: string, revisionId: string, action: "APPLY" | "REJECT", note: string) {
  const revision = (await db.query<GuideRevisionRow>("select * from guide_revision where id=$1 for update", [revisionId])).rows[0];
  if (!revision) throw new GuideError("Revision not found.", 404);
  if (revision.status !== "NEEDS_REVIEW") throw new GuideError("This revision isn't waiting for review.", 409);
  if (action === "APPLY") {
    const guide = await guideById(db, revision.guide_id, true);
    const content = validate(guide, revision.content);
    if (!isDeepStrictEqual(guide.content ?? null, revision.base_content ?? null))
      throw new GuideError("The guide changed after this draft was started. Restore the draft onto the latest version and submit it again; nothing was published.", 409);
    await db.query("update guide set content=$2, updated_at=now() where id=$1", [guide.id, content]);
  }
  const status = action === "APPLY" ? "APPLIED" : "REJECTED";
  await db.query("update guide_revision set status=$2, reviewed_by=$3, review_note=$4, reviewed_at=now(), updated_at=now() where id=$1", [revisionId, status, adminId, note]);
  await guideAudit(db, adminId, `GUIDE_REVISION_${status}`, revisionId, { guideId: revision.guide_id });
  return status;
}

// An administrator's "Save and publish": submit their saved draft and apply it in the same
// transaction, with the same validation, stale-guide check and history as a reviewed revision.
export async function publishGuideDraft(db: PoolClient, adminId: string, guideId: string) {
  const draft = await submitGuideDraft(db, adminId, guideId);
  await reviewGuideRevision(db, adminId, draft.id, "APPLY", "Published directly by an administrator.");
  return draft;
}

// Restoring an earlier version makes it the editor's draft, based on what is live now; it goes
// through review like any other change.
export async function restoreGuideRevision(db: PoolClient, userId: string, revisionId: string) {
  const source = (await db.query<GuideRevisionRow>("select * from guide_revision where id=$1", [revisionId])).rows[0];
  if (!source) throw new GuideError("Revision not found.", 404);
  const guide = await guideById(db, source.guide_id, true);
  await db.query("delete from guide_revision where guide_id=$1 and created_by=$2 and status='DRAFT'", [source.guide_id, userId]);
  const draft = (await db.query<GuideRevisionRow>(`insert into guide_revision (guide_id, status, content, base_content, reason, restored_from, created_by)
    values ($1,'DRAFT',$2,$3,$4,$5,$6) returning *`, [source.guide_id, source.content, guide.content, `Restore the version from ${new Date(source.created_at).toISOString().slice(0, 10)}`, source.id, userId])).rows[0];
  await guideAudit(db, userId, "GUIDE_REVISION_RESTORED_AS_DRAFT", draft.id, { guideId: source.guide_id, restoredFrom: source.id });
  return draft;
}

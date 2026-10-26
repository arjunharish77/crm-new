import type { PoolClient } from "pg";
import preparedFees from "@/data/prepared-category-fees.json";
import { revisionContent, revisionContentSchemas } from "@/lib/catalog-revisions";
import { loadPreparedCategoryFees, type PreparedCategoryFees } from "@/lib/prepared-category-fees";

const drafts = preparedFees as PreparedCategoryFees[];

export type FeeBatchItem = {
  courseId: string;
  name: string;
  sourceUrl: string;
  programUrl: string;
  categories: string[];
  reason: string | null;
};

type CourseRecord = {
  id: string;
  name: string;
  fee_inr: number | null;
  status: string;
  is_published: boolean;
  data: Record<string, unknown>;
};

export class CategoryFeeBatchChangedError extends Error {}

function draftIssue(draft: PreparedCategoryFees) {
  const rows = draft.categoryFees.rows;
  if (!rows.length || new Set(rows.map(row => row.category)).size !== rows.length) return "Prepared applicant categories are incomplete or repeated.";
  if (rows.some(row => !Number.isSafeInteger(row.total) || !Number.isSafeInteger(row.perSemester) || !Number.isSafeInteger(row.semesters) || row.total <= 0 || row.perSemester <= 0 || row.semesters <= 0 || row.total !== row.perSemester * row.semesters)) return "A prepared tuition schedule does not reconcile.";
  if (!rows.some(row => row.category === "Indian applicants" && row.currency === "INR" && row.total === draft.expectedFee)) return "The prepared Indian fee does not match the base amount.";
  return null;
}

// Preview and submission share the same checks. A working draft or another submitted proposal
// is never silently replaced by a batch action.
export async function getCategoryFeeBatchPreview(db: PoolClient, lock = false): Promise<FeeBatchItem[]> {
  const ids = drafts.map(draft => draft.courseId).sort();
  const courses = await db.query<CourseRecord>(`select id,name,fee_inr,status,is_published,data from course where id=any($1) order by id${lock ? " for update" : ""}`, [ids]);
  const pending = await db.query<{ entity_id: string }>("select entity_id from catalog_revision where entity_type='course' and status='NEEDS_REVIEW' and entity_id=any($1)", [ids]);
  const working = await db.query<{ entity_id: string }>("select entity_id from catalog_working_draft where entity_type='course' and entity_id=any($1)", [ids]);
  const courseById = new Map(courses.rows.map(course => [course.id, course]));
  const pendingIds = new Set(pending.rows.map(row => row.entity_id));
  const workingIds = new Set(working.rows.map(row => row.entity_id));
  return drafts.map(draft => {
    const course = courseById.get(draft.courseId);
    const reason = draftIssue(draft) ||
      (!course ? "Course no longer exists." :
      course.status !== "PUBLISHED" || !course.is_published ? "Course is not published." :
      course.fee_inr !== draft.expectedFee ? "Current Indian fee differs from the prepared amount." :
      course.data?.categoryFees ? "Applicant-category fees already exist; review them individually." :
      pendingIds.has(draft.courseId) ? "A submitted revision already exists for this course." :
      workingIds.has(draft.courseId) ? "An editor has a working draft for this course." : null);
    return { courseId: draft.courseId, name: course?.name || draft.courseId,
      sourceUrl: draft.categoryFees.sourceUrl, programUrl: draft.programUrl,
      categories: draft.categoryFees.rows.map(row => row.category), reason };
  });
}

export async function stageCategoryFeeBatch(db: PoolClient, adminId: string, expectedIds: string[]) {
  const preview = await getCategoryFeeBatchPreview(db, true);
  const readyIds = preview.filter(item => !item.reason).map(item => item.courseId).sort();
  if (!readyIds.length || JSON.stringify(readyIds) !== JSON.stringify([...expectedIds].sort())) {
    throw new CategoryFeeBatchChangedError("The fee review list changed. Refresh the checklist before staging proposals.");
  }
  const staged: string[] = [];
  for (const id of readyIds) {
    const draft = drafts.find(item => item.courseId === id)!;
    const current = (await db.query<{ snapshot: Record<string, unknown> }>("select to_jsonb(t) as snapshot from course t where id=$1", [id])).rows[0].snapshot;
    const content = revisionContentSchemas.course.parse(loadPreparedCategoryFees(revisionContent("course", current), draft));
    const row = await db.query<{ id: string }>(`insert into catalog_revision(entity_type,entity_id,base_snapshot,proposed_content,reason,created_by)
      values('course',$1,$2,$3,$4,$5) returning id`, [id, current, content,
      `Source-reviewed applicant-category base tuition from the 2026–27 ${id.endsWith("-muj") ? "MUJ" : "SMU"} prospectus; confirm the current admission session and charge exclusions before publishing.`, adminId]);
    staged.push(row.rows[0].id);
    await db.query(`insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata)
      values($1,'CATALOG_REVISION_PROPOSED','catalog_revision',$2,$3)`,
      [adminId, row.rows[0].id, { entityType: "course", entityId: id, preparedFeeBatch: true }]);
  }
  return staged;
}

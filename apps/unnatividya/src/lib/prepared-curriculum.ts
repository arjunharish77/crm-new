import { updateEditorialField } from "./catalog-editor";

export type PreparedCurriculumDraft = {
  courseId: string;
  checkedAt: string;
  sourceUrl: string;
  scope: string;
  notes: string[];
  curriculum: Array<{ term: string; subjects: string[] }>;
};

// Only the unsaved outline and its source context change. Publication is separate.
export function loadPreparedCurriculum(content: Record<string, unknown>, draft: PreparedCurriculumDraft) {
  const updated = updateEditorialField(content, "curriculum", draft.curriculum.map(term => ({ ...term, subjects: [...term.subjects] })), true);
  const data = updated.data as Record<string, unknown>;
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...updated, data: { ...data,
    sourceUrls: [...new Set([...sources, draft.sourceUrl])],
    curriculumReview: { status: "NEEDS_REVIEW", sourceUrl: draft.sourceUrl, checkedAt: draft.checkedAt, scope: draft.scope, notes: draft.notes },
  } };
}

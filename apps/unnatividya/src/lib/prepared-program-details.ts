import type { ProgramDetails } from "@/data/catalog";

export type PreparedProgramDetails = { courseId: string; notes: string[]; programDetails: ProgramDetails };

// Copies sourced facts into the unsaved proposal. The CMS review and publish steps stay separate.
export function loadPreparedProgramDetails(content: Record<string, unknown>, draft: PreparedProgramDetails) {
  const data = content.data && typeof content.data === "object" && !Array.isArray(content.data) ? content.data as Record<string, unknown> : {};
  const existing = data.programDetails && typeof data.programDetails === "object" && !Array.isArray(data.programDetails) ? data.programDetails as Record<string, unknown> : {};
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...content, data: {
    ...data,
    programDetails: { ...existing, ...draft.programDetails },
    sourceUrls: [...new Set([...sources, ...Object.values(draft.programDetails).filter(Boolean).map(detail => detail!.sourceUrl)])],
  } };
}

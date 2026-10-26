import type { EligibilityRules } from "@/lib/eligibility-rules";

export type PreparedEligibilityRules = { courseId: string; rules: EligibilityRules };

export function loadPreparedEligibilityRules(content: Record<string, unknown>, draft: PreparedEligibilityRules) {
  const data = content.data as Record<string, unknown>;
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...content, data: { ...data,
    eligibilityRules: structuredClone(draft.rules),
    sourceUrls: [...new Set([...sources, draft.rules.sourceUrl])],
  } };
}

import { z } from "zod";
import { careerScopeGuides, eligibilityGuides, type CareerScopeGuide, type EligibilityGuide } from "@/data/guide-content";

// Wave 5 C3: the editable text of the eligibility and career-scope guides. Which guides exist (key,
// URL, label) stays in code, because a new guide needs research first; the CMS edits the text.

export type GuideKind = "eligibility" | "career-scope";
export const GUIDE_KINDS: GuideKind[] = ["eligibility", "career-scope"];

const text = (max: number) => z.string().trim().min(1, "Required").max(max);
const httpsUrl = z.string().trim().url().max(500).refine(url => url.startsWith("https://"), "Use an https:// address");
const faqs = z.array(z.tuple([text(300), text(2000)])).min(1, "Add at least one question").max(12);
const common = { faqs, lastReviewed: text(40), sourceUrls: z.array(httpsUrl).min(1, "Add at least one source").max(12) };
const universityId = z.enum(["muj", "smu", "amity"]);

export const eligibilityContentSchema = z.object({
  facts: z.array(z.object({ universityId, fact: text(1500) }).strict()).min(1).max(3),
  differentiatorNote: text(2000),
  ...common,
}).strict();

export const careerScopeContentSchema = z.object({
  universityHighlights: z.array(z.object({ universityId, roles: z.array(text(80)).min(1).max(15), industries: z.array(text(80)).max(15).optional() }).strict()).min(1).max(3),
  unverifiedClaimsNote: text(2000),
  ...common,
}).strict();

export type EligibilityContent = z.infer<typeof eligibilityContentSchema>;
export type CareerScopeContent = z.infer<typeof careerScopeContentSchema>;
export type GuideContent = EligibilityContent | CareerScopeContent;

export function codeGuide(kind: GuideKind, key: string): EligibilityGuide | CareerScopeGuide | null {
  return (kind === "eligibility" ? eligibilityGuides[key] : careerScopeGuides[key]) || null;
}

// Today's text from code, as stored in the CMS (the import and the fallback both use this).
export function codeContent(kind: GuideKind, key: string): GuideContent | null {
  const guide = codeGuide(kind, key);
  if (!guide) return null;
  if (kind === "eligibility") {
    const g = guide as EligibilityGuide;
    return { facts: g.facts.map(({ universityId, fact }) => ({ universityId, fact })), differentiatorNote: g.differentiatorNote, faqs: g.faqs.map(([q, a]) => [q, a]), lastReviewed: g.lastReviewed, sourceUrls: [...g.sourceUrls] } as EligibilityContent;
  }
  const g = guide as CareerScopeGuide;
  return { universityHighlights: g.universityHighlights.map(item => ({ universityId: item.universityId, roles: [...item.roles], ...(item.industries ? { industries: [...item.industries] } : {}) })), unverifiedClaimsNote: g.unverifiedClaimsNote, faqs: g.faqs.map(([q, a]) => [q, a]), lastReviewed: g.lastReviewed, sourceUrls: [...g.sourceUrls] } as CareerScopeContent;
}

export class GuideContentError extends Error {}

// Validates content for a guide: the schema, plus the same universities as the code guide.
export function parseGuideContent(kind: GuideKind, key: string, input: unknown): GuideContent {
  const schema = kind === "eligibility" ? eligibilityContentSchema : careerScopeContentSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) { const issue = parsed.error.issues[0]; throw new GuideContentError(`${issue.path.join(".") || "content"}: ${issue.message}`); }
  const expected = codeContent(kind, key);
  if (!expected) throw new GuideContentError("This guide doesn't exist.");
  const ids = (content: GuideContent) => ("facts" in content ? content.facts : content.universityHighlights).map(item => item.universityId).sort().join(",");
  if (ids(parsed.data) !== ids(expected)) throw new GuideContentError("Keep one entry for each university the guide covers.");
  return parsed.data;
}

// The guide object the public page renders: code identity with the CMS text on top.
export function mergeGuide<T extends EligibilityGuide | CareerScopeGuide>(guide: T, content: GuideContent | null): T {
  return content ? { ...guide, ...content } : guide;
}

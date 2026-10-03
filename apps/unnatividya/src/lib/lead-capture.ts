import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { leadCourseOptions } from "@/lib/lead-course-options";

export { CONTACT_CONSENT_VERSION, CONTACT_CONSENT_TEXT } from "@/lib/lead-consent";
export const contactSchema = z.object({
  submissionKey: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  phone: z.string().regex(/^\+[1-9]\d{5,14}$/),
  consent: z.literal(true),
  intent: z.string().max(80).optional(),
}).strict();
export const preferencesSchema = z.object({
  coursePreference: z.string().min(1).max(150),
  university: z.string().max(100).default(""),
}).strict();

export async function resolvePreferences(input: z.infer<typeof preferencesSchema>) {
  const catalog = await getPublishedCatalog();
  const option = leadCourseOptions(catalog).find(item => item.label === input.coursePreference);
  if (!option) throw new Error("Choose an available course.");
  const university = input.university ? option.universities.find(item => item.id === input.university) : null;
  if (input.university && !university) throw new Error("Choose a university offering this course, or No preference.");
  return { coursePreference: option.label, courseId: university?.courseId || null, universityId: university?.id || null };
}
export function editToken(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function ownsLead(token: string, row: { edit_token_hash: string | null; edit_expires_at: string | Date | null }) {
  if (!row.edit_token_hash || !row.edit_expires_at || new Date(row.edit_expires_at).getTime() <= Date.now()) return false;
  const a = Buffer.from(tokenHash(token));
  const b = Buffer.from(row.edit_token_hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
// Accept same-origin browser writes; non-browser clients still require the capability.
export function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

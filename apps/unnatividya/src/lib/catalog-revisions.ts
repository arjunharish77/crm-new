import { z } from "zod";

export const entityTypeSchema = z.enum(["course", "university"]);
export type CatalogEntityType = z.infer<typeof entityTypeSchema>;
const common = {
  slug: z.string().trim().min(2).max(200).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(300),
  short_name: z.string().trim().min(1).max(100),
  data: z.record(z.string(), z.unknown()),
};
export const revisionContentSchemas = {
  university: z.object({ ...common, city: z.string().max(300).nullable() }).strict(),
  course: z.object({ ...common, university_id: z.string().min(1).max(200), level: z.enum(["UG", "PG"]),
    program_type: z.string().min(1).max(100), ugc_approved: z.boolean(), stream: z.string().min(2).max(200),
    fee_inr: z.number().int().positive().nullable(), duration: z.string().max(200).nullable() }).strict(),
};
// These fixed lists are also the only SQL column names the apply endpoint can write.
export const revisionColumns = {
  university: Object.keys(revisionContentSchemas.university.shape),
  course: Object.keys(revisionContentSchemas.course.shape),
};
export function revisionContent(type: CatalogEntityType, snapshot: Record<string, unknown>) {
  return Object.fromEntries(revisionColumns[type].map(key => [key, snapshot[key]]));
}
export type CatalogRevision = {
  id: string; entity_type: CatalogEntityType; entity_id: string;
  base_snapshot: Record<string, unknown>; proposed_content: Record<string, unknown>;
  reason: string; status: "NEEDS_REVIEW" | "APPLIED" | "REJECTED";
  created_at: string; review_note: string | null; rollback_of: string | null;
};

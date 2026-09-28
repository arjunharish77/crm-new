import { z } from "zod";
export const DUPLICATE_FIELDS = {
 Lead: ["name", "email", "phone", "company", "source", "status"],
 Opportunity: ["title", "leadId", "opportunityTypeId", "stageId", "priority"],
} as const;
export const duplicateRuleInput = z.object({
 id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
 entity: z.enum(["Lead", "Opportunity"]), name: z.string().trim().min(1).max(100),
 fields: z.array(z.string()).min(1).max(5), action: z.enum(["BLOCK", "WARN"]), enabled: z.boolean(),
}).strict().superRefine((value, ctx) => {
 if (new Set(value.fields).size !== value.fields.length || value.fields.some(field => !(DUPLICATE_FIELDS[value.entity] as readonly string[]).includes(field))) ctx.addIssue({ code: "custom", message: "Choose distinct supported fields", path: ["fields"] });
 if (value.id && !value.version) ctx.addIssue({ code: "custom", message: "Version is required when editing", path: ["version"] });
});
export type DuplicateRule = z.infer<typeof duplicateRuleInput> & { id: string; version: number };

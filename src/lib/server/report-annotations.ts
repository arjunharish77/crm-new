import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";

type TenantUser = { id: string; tenantId: string | null };

export type AnnotationCategory = "CAMPAIGN" | "EVENT" | "OUTAGE" | "POLICY_CHANGE" | "INTAKE_DEADLINE" | "FEE_DEADLINE" | "LAUNCH" | "OTHER";

export type AnnotationInput = {
  label: string;
  description?: string | null;
  category: AnnotationCategory;
  occurredAt: string;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

// Analytics annotations (gap checklist Module 17, item 21) -- marks campaigns/events/outages/
// policy changes/intake and fee deadlines/launch dates on charts for context.
export async function listAnnotationsForTenant(user: TenantUser, from?: string | null, to?: string | null) {
  const tenantId = requireTenantId(user);
  const conditions = ['"tenantId" = $1'];
  const values: unknown[] = [tenantId];
  if (from) {
    values.push(from);
    conditions.push(`"occurredAt" >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`"occurredAt" <= $${values.length}`);
  }
  return query<any>(
    `select id, label, description, category, "occurredAt", "createdBy", "createdAt"
     from "ReportAnnotation" where ${conditions.join(" and ")} order by "occurredAt" desc`,
    values,
  );
}

export async function createAnnotationForTenant(user: TenantUser, input: AnnotationInput) {
  const tenantId = requireTenantId(user);
  const label = String(input.label ?? "").trim();
  if (!label) throw new Error("ANNOTATION_LABEL_REQUIRED");
  if (!input.occurredAt) throw new Error("ANNOTATION_DATE_REQUIRED");
  const row = await queryOne<any>(
    `insert into "ReportAnnotation" (id, "tenantId", label, description, category, "occurredAt", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, label, description, category, "occurredAt", "createdBy", "createdAt"`,
    [randomUUID(), tenantId, label, input.description ?? null, input.category, input.occurredAt, user.id, new Date().toISOString()],
  );
  if (!row) throw new Error("ANNOTATION_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "REPORT_ANNOTATION", row.id, null, row, {}).catch(() => undefined);
  return row;
}

export async function deleteAnnotationForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await execute(`delete from "ReportAnnotation" where "tenantId" = $1 and id = $2`, [tenantId, id]);
}

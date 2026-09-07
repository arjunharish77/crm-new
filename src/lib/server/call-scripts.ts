import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { createAuditLog, automationConditionMatches } from "@/lib/server/crm";
import { getLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";
import { listRecommendationsForRecord } from "@/lib/server/next-best-action";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function hasCallScriptAdminAccess(user: TenantUser) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

const SCRIPT_COLUMNS = `id, name, "matchConditions", content, "objectionHandling", "complianceLines", "isActive", "order", version, "createdAt", "updatedAt"`;

export async function listCallScriptsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(`select ${SCRIPT_COLUMNS} from "CallScript" where "tenantId" = $1 order by "order" asc, "createdAt" asc`, [tenantId]);
}

export async function createCallScriptForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  if (!hasCallScriptAdminAccess(user)) throw new Error("FORBIDDEN");
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CallScript" (id, "tenantId", name, "matchConditions", content, "objectionHandling", "complianceLines", "isActive", "order", version, "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $10, $11, $11)
     returning ${SCRIPT_COLUMNS}`,
    [
      randomUUID(),
      tenantId,
      name,
      input.matchConditions ?? { conditions: [], conditionLogic: "AND" },
      String(input.content ?? ""),
      input.objectionHandling ?? [],
      input.complianceLines ?? [],
      input.isActive !== false,
      typeof input.order === "number" ? input.order : 0,
      user.id,
      now,
    ],
  );
  await createAuditLog(user, "CREATE", "CALL_SCRIPT", row!.id, null, row, null).catch(() => undefined);
  return row;
}

export async function updateCallScriptForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  if (!hasCallScriptAdminAccess(user)) throw new Error("FORBIDDEN");

  const existing = await queryOne<any>(`select ${SCRIPT_COLUMNS} from "CallScript" where "tenantId" = $1 and id = $2`, [tenantId, id]);
  if (!existing) throw new Error("CALL_SCRIPT_NOT_FOUND");

  const now = new Date().toISOString();
  // Snapshot the pre-update state into history BEFORE applying the change -- "script
  // versioning" means being able to see what every past version actually said, not just that
  // a version number incremented.
  await execute(
    `insert into "CallScriptVersion" (id, "tenantId", "scriptId", version, name, content, "objectionHandling", "complianceLines", "matchConditions", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      randomUUID(),
      tenantId,
      id,
      existing.version,
      existing.name,
      existing.content,
      existing.objectionHandling,
      existing.complianceLines,
      existing.matchConditions,
      user.id,
      now,
    ],
  );

  const name = "name" in input ? String(input.name ?? "").trim() || existing.name : existing.name;
  const row = await queryOne<any>(
    `update "CallScript"
     set name = $1, "matchConditions" = $2, content = $3, "objectionHandling" = $4, "complianceLines" = $5,
         "isActive" = $6, "order" = $7, version = version + 1, "updatedBy" = $8, "updatedAt" = $9
     where "tenantId" = $10 and id = $11
     returning ${SCRIPT_COLUMNS}`,
    [
      name,
      "matchConditions" in input ? input.matchConditions : existing.matchConditions,
      "content" in input ? String(input.content ?? "") : existing.content,
      "objectionHandling" in input ? input.objectionHandling : existing.objectionHandling,
      "complianceLines" in input ? input.complianceLines : existing.complianceLines,
      "isActive" in input ? input.isActive !== false : existing.isActive,
      "order" in input ? Number(input.order ?? 0) : existing.order,
      user.id,
      now,
      tenantId,
      id,
    ],
  );
  await createAuditLog(user, "UPDATE", "CALL_SCRIPT", id, existing, row, null).catch(() => undefined);
  return row;
}

export async function deleteCallScriptForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  if (!hasCallScriptAdminAccess(user)) throw new Error("FORBIDDEN");
  await execute(`delete from "CallScript" where "tenantId" = $1 and id = $2`, [tenantId, id]);
  await createAuditLog(user, "DELETE", "CALL_SCRIPT", id, null, null, null).catch(() => undefined);
}

export async function listCallScriptVersionsForTenant(user: TenantUser, scriptId: string) {
  const tenantId = requireTenantId(user);
  if (!hasCallScriptAdminAccess(user)) throw new Error("FORBIDDEN");
  return query<any>(
    `select id, version, name, content, "objectionHandling", "complianceLines", "createdBy", "createdAt"
     from "CallScriptVersion" where "tenantId" = $1 and "scriptId" = $2 order by version desc`,
    [tenantId, scriptId],
  );
}

function countMatchedConditions(matchConditions: any): number {
  return Array.isArray(matchConditions?.conditions) ? matchConditions.conditions.length : 0;
}

// Best-match selection: reuses automationConditionMatches (the exact same condition-evaluation
// engine NBA rules and automation workflows already use, including its predictiveScore.*
// field aliasing) rather than writing a second, parallel matching implementation. A script
// with more specific (non-empty) conditions that all match wins over a more generic one; a
// script with zero conditions acts as a catch-all fallback, matching everything but always
// losing to any script with at least one real matching condition.
export async function getBestCallScriptForRecord(user: TenantUser, recordType: "LEAD" | "OPPORTUNITY", recordId: string) {
  const tenantId = requireTenantId(user);
  const record = recordType === "LEAD" ? await getLeadForTenant(user, recordId) : await getOpportunityForTenant(user, recordId);
  if (!record) throw new Error("RECORD_NOT_FOUND");

  const scripts = await query<any>(
    `select ${SCRIPT_COLUMNS} from "CallScript" where "tenantId" = $1 and "isActive" = true order by "order" asc, "createdAt" asc`,
    [tenantId],
  );

  let best: any = null;
  let bestScore = -1;
  for (const script of scripts) {
    if (!automationConditionMatches(record as Record<string, unknown>, script.matchConditions ?? {})) continue;
    const specificity = countMatchedConditions(script.matchConditions);
    if (specificity > bestScore) {
      best = script;
      bestScore = specificity;
    }
  }

  const nbaHints = await listRecommendationsForRecord(user, recordType, recordId).catch(() => []);

  return { script: best, nbaHints: nbaHints.slice(0, 3) };
}

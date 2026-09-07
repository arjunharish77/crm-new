import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

export type ModuleStatus = "ENABLED" | "DISABLED" | "SUSPENDED" | "TRIAL";

const MODULE_COLUMNS = `id, "tenantId", "moduleKey", status, reason, "effectiveAt", "updatedBy", "createdAt", "updatedAt"`;

export async function getModuleCatalog() {
  return query<any>(`select "key", name, description, category, "isCore" from "PlatformModule" order by category, name`, []);
}

export async function getTenantModuleEntitlements(tenantId: string) {
  const [catalog, entitlements] = await Promise.all([
    getModuleCatalog(),
    query<any>(`select ${MODULE_COLUMNS} from "TenantModuleEntitlement" where "tenantId" = $1`, [tenantId]),
  ]);
  const entitlementByKey = new Map(entitlements.map((row) => [row.moduleKey, row]));
  // A module with no explicit row defaults to ENABLED -- matches the same "missing ->
  // enabled" convention already established by TenantFeature's DEFAULT_TENANT_FEATURE_FLAGS,
  // so introducing a new module never silently locks out existing tenants.
  return catalog.map((catalogEntry) => ({
    ...catalogEntry,
    status: (entitlementByKey.get(catalogEntry.key)?.status as ModuleStatus) ?? "ENABLED",
    reason: entitlementByKey.get(catalogEntry.key)?.reason ?? null,
    updatedAt: entitlementByKey.get(catalogEntry.key)?.updatedAt ?? null,
  }));
}

export async function isModuleEnabledForTenant(tenantId: string | null | undefined, moduleKey: string): Promise<boolean> {
  if (!tenantId) return false;
  const row = await queryOne<{ status: ModuleStatus }>(
    `select status from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = $2 limit 1`,
    [tenantId, moduleKey],
  );
  if (!row) return true; // no explicit row -> defaults enabled
  return row.status === "ENABLED" || row.status === "TRIAL";
}

export async function assertModuleEnabled(
  tenantId: string | null | undefined,
  moduleKey: string,
  opts: { isPlatformAdmin?: boolean } = {}
) {
  if (opts.isPlatformAdmin) return;
  if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!(await isModuleEnabledForTenant(tenantId, moduleKey))) throw new Error(`MODULE_DISABLED:${moduleKey}`);
}

// Platform-admin only -- a tenant admin cannot self-enable/disable a module (matches the
// checklist's "tenant users cannot self-enable paid/restricted modules" requirement).
export async function setTenantModuleStatus(
  platformAdminUser: TenantUser,
  tenantId: string,
  moduleKey: string,
  status: ModuleStatus,
  reason?: string | null
) {
  const catalogEntry = await queryOne<{ key: string; isCore: boolean }>(`select "key", "isCore" from "PlatformModule" where "key" = $1 limit 1`, [
    moduleKey,
  ]);
  if (!catalogEntry) throw new Error("MODULE_NOT_FOUND");
  if (catalogEntry.isCore && status !== "ENABLED") throw new Error("CORE_MODULE_CANNOT_BE_DISABLED");

  const now = new Date().toISOString();
  // A select-then-insert-or-update here would race under concurrent calls (two platform
  // admins toggling the same tenant/module at once could both see "no existing row" and
  // both attempt an insert, one failing on the unique constraint). Do it as one atomic
  // upsert against that same ("tenantId", "moduleKey") constraint instead.
  await execute(
    `insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status, reason, "effectiveAt", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $6, $6)
     on conflict ("tenantId", "moduleKey") do update
       set status = excluded.status, reason = excluded.reason, "updatedBy" = excluded."updatedBy", "updatedAt" = excluded."updatedAt"`,
    [randomUUID(), tenantId, moduleKey, status, reason ?? null, now, platformAdminUser.id],
  );

  const auditAction = status === "ENABLED" ? "ENABLED" : status === "DISABLED" ? "DISABLED" : status === "SUSPENDED" ? "SUSPENDED" : "TRIAL_STARTED";
  await execute(
    `insert into "TenantModuleAuditLog" (id, "tenantId", "moduleKey", action, reason, "performedBy", "performedAt")
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), tenantId, moduleKey, auditAction, reason ?? null, platformAdminUser.id, now],
  );

  return { moduleKey, status };
}

export async function listTenantModuleAuditLog(tenantId: string) {
  return query<any>(
    `select id, "moduleKey", action, reason, "performedBy", "performedAt" from "TenantModuleAuditLog"
     where "tenantId" = $1 order by "performedAt" desc limit 200`,
    [tenantId],
  );
}

import { randomUUID } from "crypto";
import { executeAsSystem, queryAsSystem, queryOneAsSystem } from "@/lib/db/query";

const POLICY_COLUMNS =
  'id, "tenantId", "leadRetentionDays", "opportunityRetentionDays", "activityRetentionDays", "auditLogRetentionDays", "deletedRecordsRetentionDays", "marketplaceAppLogRetentionDays", "lastEnforcedAt", "createdAt", "updatedAt"';

// Platform-admin scoped (not per-tenant settings) -- retention is an ops-level policy a
// platform admin configures per tenant (or leaves at the column defaults), matching the
// existing /dashboard/admin/retention page's own design (a cross-tenant list), which was a
// pure dead stub before this pass -- it called /api/platform-admin/retention/policies and
// friends, none of which existed anywhere.
//
// WP07 (F04): every function in this whole file is CROSS_TENANT_ADMIN and/or BACKGROUND_JOB,
// disposition B -- there is no per-tenant/normal-session caller of anything here (confirmed:
// this file's own top comment already documents it as platform-admin-scoped, not per-tenant
// settings), so every query.ts call below runs on the system pool. See
// 25_AUDIT_REMEDIATION_PLAN.md "## WP07 pre-auth/system path inventory".
export async function getOrCreateDataRetentionPolicyForTenantId(tenantId: string) {
  const existing = await queryOneAsSystem(`select ${POLICY_COLUMNS} from "DataRetentionPolicy" where "tenantId" = $1 limit 1`, [tenantId]);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created = await queryOneAsSystem(
    `insert into "DataRetentionPolicy" (id, "tenantId", "createdAt", "updatedAt") values ($1, $2, $3, $3) returning ${POLICY_COLUMNS}`,
    [randomUUID(), tenantId, now],
  );
  if (!created) throw new Error("RETENTION_POLICY_CREATE_FAILED");
  return created;
}

const PATCHABLE_FIELDS = [
  "leadRetentionDays",
  "opportunityRetentionDays",
  "activityRetentionDays",
  "auditLogRetentionDays",
  "deletedRecordsRetentionDays",
  "marketplaceAppLogRetentionDays",
] as const;

export async function updateDataRetentionPolicyForTenantId(tenantId: string, input: Partial<Record<(typeof PATCHABLE_FIELDS)[number], number>>) {
  await getOrCreateDataRetentionPolicyForTenantId(tenantId); // ensure a row exists to update
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const field of PATCHABLE_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 1) throw new Error(`INVALID_${field.toUpperCase()}`);
    patch[field] = Math.round(value);
  }
  const columns = Object.keys(patch);
  const values = columns.map((c) => patch[c]);
  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const row = await queryOneAsSystem(
    `update "DataRetentionPolicy" set ${assignments} where "tenantId" = $${columns.length + 1} returning ${POLICY_COLUMNS}`,
    [...values, tenantId],
  );
  if (!row) throw new Error("RETENTION_POLICY_NOT_FOUND");
  return row;
}

export async function listDataRetentionPoliciesForPlatformAdmin() {
  return queryAsSystem(`select p.*, t.name as "tenantName" from "DataRetentionPolicy" p join "Tenant" t on t.id = p."tenantId" order by t.name asc`, []);
}

// Enforcement deliberately ANONYMIZES rather than hard-deletes Lead/Opportunity/Activity rows
// past their retention window, rather than a literal DELETE. Confirmed by direct schema audit
// this session (during the dedupe/merge work) that Task.leadId and Opportunity.leadId are both
// RESTRICT foreign keys with no ON DELETE clause -- a real DELETE would routinely fail outright
// on any record with live children, and a "delete what's deletable, silently skip what's
// blocked" partial-purge is worse than a predictable, safe anonymization that always succeeds:
// the PII (name/email/phone/notes) is actually removed -- which is the real privacy goal of a
// retention policy -- while relationships, historical aggregates, and reporting stay intact.
// AuditLog is the one exception: it's genuinely deleted, since audit rows are the standard,
// expected thing a retention window actually purges outright.
export async function enforceDataRetentionForTenant(tenantId: string) {
  const policy = await queryOneAsSystem<any>(`select ${POLICY_COLUMNS} from "DataRetentionPolicy" where "tenantId" = $1 limit 1`, [tenantId]);
  if (!policy) return { leadsAnonymized: 0, opportunitiesAnonymized: 0, activitiesAnonymized: 0, auditLogsDeleted: 0, fieldDefinitionsPurged: 0, marketplaceAppLogsPurged: 0 };

  const now = new Date();
  const leadCutoff = new Date(now.getTime() - policy.leadRetentionDays * 86_400_000).toISOString();
  const opportunityCutoff = new Date(now.getTime() - policy.opportunityRetentionDays * 86_400_000).toISOString();
  const activityCutoff = new Date(now.getTime() - policy.activityRetentionDays * 86_400_000).toISOString();
  const auditCutoff = new Date(now.getTime() - policy.auditLogRetentionDays * 86_400_000).toISOString();
  const deletedRecordsCutoff = new Date(now.getTime() - policy.deletedRecordsRetentionDays * 86_400_000).toISOString();
  const marketplaceAppLogCutoff = new Date(now.getTime() - policy.marketplaceAppLogRetentionDays * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  const leads = await executeAsSystem(
    `update "Lead" set name = '[Retained data purged]', email = null, phone = null, company = null, "updatedAt" = $1
     where "tenantId" = $2 and "mergedIntoId" is null and "updatedAt" < $3 and name <> '[Retained data purged]'`,
    [nowIso, tenantId, leadCutoff],
  );
  const opportunities = await executeAsSystem(
    `update "Opportunity" set title = '[Retained data purged]', "updatedAt" = $1
     where "tenantId" = $2 and "mergedIntoId" is null and "updatedAt" < $3 and title <> '[Retained data purged]'`,
    [nowIso, tenantId, opportunityCutoff],
  );
  const activities = await executeAsSystem(
    `update "Activity" set notes = null, "updatedAt" = $1
     where "tenantId" = $2 and "updatedAt" < $3 and notes is not null`,
    [nowIso, tenantId, activityCutoff],
  );
  // "Retention exceptions / legal hold" (gap checklist: "audit review workflows") -- a row an
  // admin has flagged legalHold=true (audit-review.ts's setAuditLogLegalHold) survives this
  // purge regardless of age, until the hold is explicitly lifted.
  const auditLogs = await executeAsSystem(
    `delete from "AuditLog" where "tenantId" = $1 and "createdAt" < $2 and "legalHold" = false`,
    [tenantId, auditCutoff],
  );
  const fieldDefinitions = await executeAsSystem(
    `delete from "FieldDefinition" where "tenantId" = $1 and "deletedAt" is not null and "deletedAt" < $2`,
    [tenantId, deletedRecordsCutoff],
  );
  // Marketplace "retained logs policy": only purges delivery history for apps that have
  // actually been uninstalled (and past this window since uninstall) -- a live, installed
  // app's delivery log is operational data this policy has no business touching.
  const marketplaceAppLogs = await executeAsSystem(
    `delete from "TenantAppDelivery" where "tenantId" = $1 and "appId" in (
       select "appId" from "TenantAppInstall" where "tenantId" = $1 and status = 'UNINSTALLED' and "uninstalledAt" < $2
     )`,
    [tenantId, marketplaceAppLogCutoff],
  );

  await executeAsSystem(`update "DataRetentionPolicy" set "lastEnforcedAt" = $1 where "tenantId" = $2`, [nowIso, tenantId]);

  return {
    leadsAnonymized: leads,
    opportunitiesAnonymized: opportunities,
    activitiesAnonymized: activities,
    auditLogsDeleted: auditLogs,
    fieldDefinitionsPurged: fieldDefinitions,
    marketplaceAppLogsPurged: marketplaceAppLogs,
  };
}

export async function processDueDataRetentionEnforcement(limit = 25) {
  const tenants = await queryAsSystem<{ tenantId: string }>(`select "tenantId" from "DataRetentionPolicy" where "tenantId" is not null limit $1`, [limit]);
  const results = [];
  for (const row of tenants) {
    const result = await enforceDataRetentionForTenant(row.tenantId);
    results.push({ tenantId: row.tenantId, ...result });
  }
  return { processed: results };
}

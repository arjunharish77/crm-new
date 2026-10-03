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

// A period of null, "" or 0 switches that clean-up off (decision 2026-10-01); otherwise a whole
// number of days >= 1.
export async function updateDataRetentionPolicyForTenantId(tenantId: string, input: Partial<Record<(typeof PATCHABLE_FIELDS)[number], number | string | null>>) {
  await getOrCreateDataRetentionPolicyForTenantId(tenantId); // ensure a row exists to update
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const field of PATCHABLE_FIELDS) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (raw === null || raw === "" || raw === 0) {
      patch[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) throw new Error(`INVALID_${field.toUpperCase()}`);
    patch[field] = value;
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
  return queryAsSystem(`select ${POLICY_COLUMNS.split(", ").map((column) => `p.${column}`).join(", ")}, t.name as "tenantName" from "DataRetentionPolicy" p join "Tenant" t on t.id = p."tenantId" order by t.name asc`, []);
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
//
// Decisions confirmed 2026-10-01: each clean-up runs only when its period is set (NULL = off),
// and only closed/inactive records are anonymized -- open records never are, however old.
// "Closed" means: a lead whose status is in the Converted or Lost category (the tenant's own
// statuses; LOST / CONVERTED / DISQUALIFIED when undefined) or that was deleted; an
// opportunity in a closed stage or deleted; an activity whose linked records are all closed
// (an activity linked to no lead or opportunity is left alone).
const PURGED = "[Retained data purged]";
// The status category (tenant-configurable, UI/UX plan decision 6): anything not Open is closed.
const CLOSED_LEAD = (alias: string) => `(${alias}."deletedAt" is not null or crm_lead_status_category(${alias}."tenantId", ${alias}.status) <> 'OPEN')`;
const CLOSED_OPPORTUNITY = (alias: string) =>
  `(${alias}."deletedAt" is not null or exists (select 1 from "StageDefinition" sd where sd."tenantId" = ${alias}."tenantId" and sd.id = ${alias}."stageId" and sd."isClosed"))`;

type Policy = Record<(typeof PATCHABLE_FIELDS)[number], number | null>;
const cutoff = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

// Each clean-up as (where-clause over its table, params after the tenant id). Shared by the
// preview (counts) and the enforcement (updates/deletes) so both always match.
function cleanups(policy: Policy, now: Date) {
  const list: { key: string; table: string; alias: string; where: string; params: unknown[]; action: "ANONYMIZE_LEAD" | "ANONYMIZE_OPPORTUNITY" | "CLEAR_ACTIVITY_NOTES" | "DELETE" }[] = [];
  if (policy.leadRetentionDays) {
    list.push({ key: "leadsAnonymized", table: "Lead", alias: "l", action: "ANONYMIZE_LEAD", params: [cutoff(now, policy.leadRetentionDays)],
      where: `l."tenantId" = $1 and l."mergedIntoId" is null and l."updatedAt" < $2 and l.name <> '${PURGED}' and ${CLOSED_LEAD("l")}` });
  }
  if (policy.opportunityRetentionDays) {
    list.push({ key: "opportunitiesAnonymized", table: "Opportunity", alias: "o", action: "ANONYMIZE_OPPORTUNITY", params: [cutoff(now, policy.opportunityRetentionDays)],
      where: `o."tenantId" = $1 and o."mergedIntoId" is null and o."updatedAt" < $2 and o.title <> '${PURGED}' and ${CLOSED_OPPORTUNITY("o")}` });
  }
  if (policy.activityRetentionDays) {
    list.push({ key: "activitiesAnonymized", table: "Activity", alias: "a", action: "CLEAR_ACTIVITY_NOTES", params: [cutoff(now, policy.activityRetentionDays)],
      where: `a."tenantId" = $1 and a."updatedAt" < $2 and a.notes is not null and (a."leadId" is not null or a."opportunityId" is not null)
        and (a."leadId" is null or exists (select 1 from "Lead" l where l."tenantId" = a."tenantId" and l.id = a."leadId" and ${CLOSED_LEAD("l")}))
        and (a."opportunityId" is null or exists (select 1 from "Opportunity" o where o."tenantId" = a."tenantId" and o.id = a."opportunityId" and ${CLOSED_OPPORTUNITY("o")}))` });
  }
  // "Retention exceptions / legal hold" (gap checklist: "audit review workflows") -- a row an
  // admin has flagged legalHold=true (audit-review.ts's setAuditLogLegalHold) survives this
  // purge regardless of age, until the hold is explicitly lifted.
  if (policy.auditLogRetentionDays) {
    list.push({ key: "auditLogsDeleted", table: "AuditLog", alias: "x", action: "DELETE", params: [cutoff(now, policy.auditLogRetentionDays)],
      where: `x."tenantId" = $1 and x."createdAt" < $2 and x."legalHold" = false` });
  }
  if (policy.deletedRecordsRetentionDays) {
    list.push({ key: "fieldDefinitionsPurged", table: "FieldDefinition", alias: "x", action: "DELETE", params: [cutoff(now, policy.deletedRecordsRetentionDays)],
      where: `x."tenantId" = $1 and x."deletedAt" is not null and x."deletedAt" < $2` });
  }
  // Marketplace "retained logs policy": only purges delivery history for apps that have
  // actually been uninstalled (and past this window since uninstall) -- a live, installed
  // app's delivery log is operational data this policy has no business touching.
  if (policy.marketplaceAppLogRetentionDays) {
    list.push({ key: "marketplaceAppLogsPurged", table: "TenantAppDelivery", alias: "x", action: "DELETE", params: [cutoff(now, policy.marketplaceAppLogRetentionDays)],
      where: `x."tenantId" = $1 and x."appId" in (select i."appId" from "TenantAppInstall" i where i."tenantId" = $1 and i.status = 'UNINSTALLED' and i."uninstalledAt" < $2)` });
  }
  return list;
}

const EMPTY_RESULT = { leadsAnonymized: 0, opportunitiesAnonymized: 0, activitiesAnonymized: 0, auditLogsDeleted: 0, fieldDefinitionsPurged: 0, marketplaceAppLogsPurged: 0 };
export type RetentionCounts = typeof EMPTY_RESULT;

async function policyFor(tenantId: string) {
  return queryOneAsSystem<Policy>(`select ${POLICY_COLUMNS} from "DataRetentionPolicy" where "tenantId" = $1 limit 1`, [tenantId]);
}

/** What enforcement would change for a tenant right now, without changing anything. */
export async function previewDataRetentionForTenant(tenantId: string, now = new Date()): Promise<RetentionCounts> {
  const policy = await policyFor(tenantId);
  const result = { ...EMPTY_RESULT };
  if (!policy) return result;
  for (const item of cleanups(policy, now)) {
    const row = await queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "${item.table}" ${item.alias} where ${item.where}`, [tenantId, ...item.params]);
    result[item.key as keyof RetentionCounts] = row?.count ?? 0;
  }
  return result;
}

export async function enforceDataRetentionForTenant(tenantId: string, now = new Date()): Promise<RetentionCounts> {
  const policy = await policyFor(tenantId);
  const result = { ...EMPTY_RESULT };
  if (!policy) return result;
  const nowIso = now.toISOString();
  for (const item of cleanups(policy, now)) {
    const values = [tenantId, ...item.params];
    const next = `$${values.length + 1}`;
    const sql =
      item.action === "ANONYMIZE_LEAD" ? `update "Lead" l set name = '${PURGED}', email = null, phone = null, company = null, "updatedAt" = ${next} where ${item.where}`
      : item.action === "ANONYMIZE_OPPORTUNITY" ? `update "Opportunity" o set title = '${PURGED}', "updatedAt" = ${next} where ${item.where}`
      : item.action === "CLEAR_ACTIVITY_NOTES" ? `update "Activity" a set notes = null, "updatedAt" = ${next} where ${item.where}`
      : `delete from "${item.table}" ${item.alias} where ${item.where}`;
    result[item.key as keyof RetentionCounts] = await executeAsSystem(sql, item.action === "DELETE" ? values : [...values, nowIso]);
  }
  await executeAsSystem(`update "DataRetentionPolicy" set "lastEnforcedAt" = $1 where "tenantId" = $2`, [nowIso, tenantId]);
  return result;
}

/**
 * Worker job: enforce the policies not enforced in the last day, least recently enforced first
 * (it used to take the same first `limit` rows every minute, so tenants beyond the limit were
 * never enforced). A failing tenant is logged and skipped. `all` (the platform-admin "Enforce
 * now") enforces every policy regardless of when it last ran.
 */
export async function processDueDataRetentionEnforcement(limit = 25, options: { all?: boolean } = {}) {
  const tenants = await queryAsSystem<{ tenantId: string }>(
    `select "tenantId" from "DataRetentionPolicy" where "tenantId" is not null
       ${options.all ? "" : `and ("lastEnforcedAt" is null or "lastEnforcedAt" < now() - interval '1 day')`}
     order by "lastEnforcedAt" asc nulls first, "tenantId"
     limit $1`,
    [options.all ? 100000 : limit],
  );
  const results: ({ tenantId: string; failed?: boolean } & RetentionCounts)[] = [];
  for (const row of tenants) {
    try {
      results.push({ tenantId: row.tenantId, ...(await enforceDataRetentionForTenant(row.tenantId)) });
    } catch (error) {
      console.error(`[retention] enforcement failed for tenant ${row.tenantId}`, error);
      results.push({ tenantId: row.tenantId, failed: true, ...EMPTY_RESULT });
    }
  }
  return { processed: results };
}

/** Platform-admin preview of "Enforce now" across every policy. */
export async function previewAllDataRetention() {
  const tenants = await queryAsSystem<{ tenantId: string; tenantName: string }>(
    `select p."tenantId", t.name as "tenantName" from "DataRetentionPolicy" p join "Tenant" t on t.id = p."tenantId" order by t.name`,
    [],
  );
  const rows = [];
  for (const tenant of tenants) rows.push({ ...tenant, ...(await previewDataRetentionForTenant(tenant.tenantId)) });
  return rows;
}

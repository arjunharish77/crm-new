import { execute, query, queryAsSystem, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/repositories/leads-postgres";

// Archive model for configuration items (decision 31; extended 2026-10-03 to Smart Views, custom
// reports, routing, scoring, recommended-action, commission and rewards rules, and import and
// export templates). Delete sets "deletedAt": the item disappears from its list and stops applying
// at once (every read path skips archived rows), can be restored as it was for 30 days, and is
// then purged by the archive.purge worker job -- or deleted for good sooner, from the Archived
// list. Rows stay in place so the ledgers, logs and versions that point at them keep their links;
// a rule still referenced by a commission or points ledger is never purged (it stays archived).

export const ITEM_ARCHIVE_RETENTION_DAYS = 30;

type TenantUser = { id: string; tenantId: string | null; isTenantAdmin?: boolean; isPlatformAdmin?: boolean };

type ArchiveKind = {
  table: string;
  entityType: string;
  noun: string;
  // A fixed SQL condition (never user input) for kinds that share a table.
  scope?: string;
  // "owner": the item's creator or an admin may archive, restore or delete it; "admin": admins only.
  access: "owner" | "admin";
  // Fixed SQL; true when something still points at the item and it must not be removed for good.
  inUse?: string;
};

export const ARCHIVE_KINDS = {
  "saved-view": { table: "CustomReport", entityType: "SAVED_VIEW", noun: "Smart View", scope: `"chartType" = 'SAVED_VIEW'`, access: "owner" },
  "custom-report": { table: "CustomReport", entityType: "CUSTOM_REPORT", noun: "report", scope: `"chartType" is distinct from 'SAVED_VIEW'`, access: "owner" },
  "assignment-rule": { table: "AssignmentRule", entityType: "ASSIGNMENT_RULE", noun: "assignment rule", access: "admin" },
  "assignment-rule-set": { table: "DistributionRuleSet", entityType: "DISTRIBUTION_RULE_SET", noun: "rule set", access: "admin" },
  "lead-scoring-rule": { table: "LeadScoringRule", entityType: "LEAD_SCORING_RULE", noun: "scoring rule", access: "admin" },
  "recommended-action-rule": { table: "NextBestActionRule", entityType: "NEXT_BEST_ACTION_RULE", noun: "recommended-action rule", access: "admin" },
  "commission-rule": {
    table: "CommissionRule", entityType: "COMMISSION_RULE", noun: "commission rule", access: "admin",
    inUse: `exists (select 1 from "CommissionLedger" l where l."commissionRuleId" = t.id)`,
  },
  "gamification-rule": {
    table: "GamificationRule", entityType: "GAMIFICATION_RULE", noun: "rewards rule", access: "admin",
    inUse: `exists (select 1 from "GamificationPointsLedger" l where l."gamificationRuleId" = t.id)`,
  },
  "import-template": { table: "ImportTemplate", entityType: "IMPORT_TEMPLATE", noun: "import template", access: "admin" },
  "export-template": { table: "ExportTemplate", entityType: "EXPORT_TEMPLATE", noun: "export template", access: "owner" },
} satisfies Record<string, ArchiveKind>;

export type ArchiveKindKey = keyof typeof ARCHIVE_KINDS;

export function isArchiveKind(value: string): value is ArchiveKindKey {
  return Object.prototype.hasOwnProperty.call(ARCHIVE_KINDS, value);
}

function isAdmin(user: TenantUser) {
  return !!(user.isTenantAdmin || user.isPlatformAdmin);
}

// The shared where-clause for one kind: tenant, the kind's own scope, and (owner kinds) the
// creator unless the user is an admin. Admin-only kinds refuse non-admins outright.
function kindWhere(user: TenantUser, kind: ArchiveKind, values: unknown[]) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (kind.access === "admin" && !isAdmin(user)) throw new Error("FORBIDDEN");
  values.push(user.tenantId);
  const clauses = [`t."tenantId" = $${values.length}`];
  if (kind.scope) clauses.push(kind.scope.replace(/"chartType"/g, 't."chartType"'));
  if (kind.access === "owner" && !isAdmin(user)) {
    values.push(user.id);
    clauses.push(`t."createdBy" = $${values.length}`);
  }
  return clauses.join(" and ");
}

export function purgeAfter(deletedAt: string | Date) {
  return new Date(new Date(deletedAt).getTime() + ITEM_ARCHIVE_RETENTION_DAYS * 86_400_000).toISOString();
}

// Archive (the item's Delete). Callers do their own access and module checks first, as before.
export async function archiveItemForTenant(user: TenantUser, kindKey: ArchiveKindKey, id: string) {
  const kind: ArchiveKind = ARCHIVE_KINDS[kindKey];
  const values: unknown[] = [id];
  const where = kindWhere(user, kind, values);
  values.push(user.id);
  const row = await queryOne<{ id: string; name: string | null; deletedAt: string }>(
    `update "${kind.table}" t set "deletedAt" = now(), "deletedBy" = $${values.length}
     where t.id = $1 and ${where} and t."deletedAt" is null
     returning t.id, t.name, t."deletedAt"`,
    values,
  );
  if (!row) throw new Error("ARCHIVE_ITEM_NOT_FOUND");
  await createAuditLog(user as any, "ARCHIVE", kind.entityType, id, null, { name: row.name }, null).catch(() => undefined);
  return { ...row, purgeAfter: purgeAfter(row.deletedAt) };
}

export async function restoreItemForTenant(user: TenantUser, kindKey: ArchiveKindKey, id: string) {
  const kind: ArchiveKind = ARCHIVE_KINDS[kindKey];
  const values: unknown[] = [id];
  const where = kindWhere(user, kind, values);
  const row = await queryOne<{ id: string; name: string | null }>(
    `update "${kind.table}" t set "deletedAt" = null, "deletedBy" = null
     where t.id = $1 and ${where} and t."deletedAt" is not null
     returning t.id, t.name`,
    values,
  );
  if (!row) throw new Error("ARCHIVE_ITEM_NOT_FOUND");
  await createAuditLog(user as any, "RESTORE", kind.entityType, id, null, { name: row.name }, null).catch(() => undefined);
  return row;
}

// Permanent delete, only for an archived item.
export async function deleteArchivedItemForTenant(user: TenantUser, kindKey: ArchiveKindKey, id: string) {
  const kind: ArchiveKind = ARCHIVE_KINDS[kindKey];
  const values: unknown[] = [id];
  const where = kindWhere(user, kind, values);
  const existing = await queryOne<{ id: string; name: string | null; deletedAt: string | null; inUse: boolean }>(
    `select t.id, t.name, t."deletedAt", ${kind.inUse ?? "false"} as "inUse" from "${kind.table}" t where t.id = $1 and ${where}`,
    values,
  );
  if (!existing) throw new Error("ARCHIVE_ITEM_NOT_FOUND");
  if (!existing.deletedAt) throw new Error("ARCHIVE_ITEM_NOT_ARCHIVED");
  if (existing.inUse) throw new Error("ARCHIVE_ITEM_IN_USE");
  await execute(`delete from "${kind.table}" t where t.id = $1 and ${where} and t."deletedAt" is not null`, values);
  await createAuditLog(user as any, "DELETE", kind.entityType, id, { name: existing.name }, null, null).catch(() => undefined);
}

// The Archived list for one kind: what this user may restore, newest first.
export async function listArchivedItemsForTenant(user: TenantUser, kindKey: ArchiveKindKey) {
  const kind: ArchiveKind = ARCHIVE_KINDS[kindKey];
  const values: unknown[] = [];
  const where = kindWhere(user, kind, values);
  const rows = await query<{ id: string; name: string | null; deletedAt: string; deletedBy: string | null; deletedByName: string | null; inUse: boolean }>(
    `select t.id, t.name, t."deletedAt", t."deletedBy", coalesce(u.name, u.email) as "deletedByName", ${kind.inUse ?? "false"} as "inUse"
     from "${kind.table}" t left join "User" u on u.id = t."deletedBy"
     where ${where} and t."deletedAt" is not null
     order by t."deletedAt" desc
     limit 200`,
    values,
  );
  return rows.map((row) => ({ ...row, purgeAfter: row.inUse ? null : purgeAfter(row.deletedAt) }));
}

// Worker (archive.purge): removes items archived more than 30 days ago, across workspaces. An item
// something still points at (a commission or points ledger) is left archived.
export async function purgeArchivedItems(limit = 200) {
  const purged: Record<string, number> = {};
  for (const [key, kind] of Object.entries(ARCHIVE_KINDS) as Array<[string, ArchiveKind]>) {
    const rows = await queryAsSystem<{ id: string }>(
      `delete from "${kind.table}" t
       where t.id in (
         select t.id from "${kind.table}" t
         where t."deletedAt" < now() - make_interval(days => $1)${kind.scope ? ` and ${kind.scope.replace(/"chartType"/g, 't."chartType"')}` : ""}${kind.inUse ? ` and not ${kind.inUse}` : ""}
         order by t."deletedAt" limit $2
       )
       returning t.id`,
      [ITEM_ARCHIVE_RETENTION_DAYS, limit],
    );
    purged[key] = rows.length;
  }
  return purged;
}

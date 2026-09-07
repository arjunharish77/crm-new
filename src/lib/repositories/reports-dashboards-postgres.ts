import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { assertFeatureEnabled } from "@/lib/server/entitlements";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
  isTenantAdmin?: boolean;
};

type DashboardWidgetInput = {
  title: string;
  type: string;
  config: Record<string, unknown>;
  layout?: { w?: number; h?: number; x?: number; y?: number };
  // Dashboard sharing (gap checklist Module 17, item 3's "sharing" sub-item). Sharing only
  // widens who can VIEW a widget -- edit/delete stay restricted to the widget's own creator
  // (see updateDashboardWidgetForTenant/deleteDashboardWidgetForTenant), a deliberately
  // conservative model rather than building a full collaborative-editing permission scheme.
  visibility?: "PRIVATE" | "TEAM" | "TENANT";
  sharedWithTeamId?: string | null;
  // Gap checklist Module 17, item 4 (dashboard tabs). Nullable: a widget with no tabId falls
  // back to rendering wherever the client puts untagged widgets (its default tab).
  tabId?: string | null;
};

type CustomReportInput = {
  name?: string;
  description?: string | null;
  module?: string;
  config?: Record<string, unknown>;
  chartType?: string;
  isPublic?: boolean;
  isActive?: boolean;
};

function tenantWhere(user: TenantUser, startIndex = 1) {
  return user.tenantId ? { sql: `"tenantId" = $${startIndex}`, values: [user.tenantId] } : { sql: '"tenantId" is null', values: [] };
}

function formatWidgetRecord(record: any) {
  return {
    id: record.id,
    title: record.title,
    type: record.type,
    config: record.config ?? {},
    layout: {
      w: record.w ?? 1,
      h: record.h ?? 1,
      x: record.x ?? 0,
      y: record.y ?? 0,
    },
    visibility: record.visibility ?? "PRIVATE",
    sharedWithTeamId: record.sharedWithTeamId ?? null,
    tabId: record.tabId ?? null,
    isOwner: record.userId === undefined ? true : record.userId === record.__viewerId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listDashboardWidgetsForTenant(user: TenantUser) {
  const tenant = tenantWhere(user, 2);
  // Sharing (item 3): a viewer sees their own PRIVATE widgets, plus any widget shared TENANT-
  // wide, plus TEAM-shared widgets from their own team (resolved via a direct subquery against
  // User.teamId -- getCurrentUserById's returned user object doesn't carry teamId today, and
  // widening that central, heavily-read function was a larger, riskier change than this widget-
  // scoped lookup needs).
  const rows = await query<any>(
    `select id, title, type, config, w, h, x, y, visibility, "sharedWithTeamId", "tabId", "userId", "createdAt", "updatedAt"
     from "DashboardWidget"
     where ${tenant.sql}
       and (
         "userId" = $1
         or visibility = 'TENANT'
         or (visibility = 'TEAM' and "sharedWithTeamId" = (select "teamId" from "User" where id::text = $1))
       )
     order by y asc, x asc, "createdAt" asc`,
    [user.id, ...tenant.values],
  );
  return rows.map((row) => formatWidgetRecord({ ...row, __viewerId: user.id }));
}

export async function createDashboardWidgetForTenant(user: TenantUser, input: DashboardWidgetInput) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const now = new Date().toISOString();
  const visibility = input.visibility ?? "PRIVATE";
  const row = await queryOne<any>(
    `insert into "DashboardWidget"
      (id, "tenantId", "userId", title, type, config, w, h, x, y, visibility, "sharedWithTeamId", "tabId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
     returning id, title, type, config, w, h, x, y, visibility, "sharedWithTeamId", "tabId", "userId", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      user.id,
      input.title,
      input.type,
      input.config ?? {},
      input.layout?.w ?? 4,
      input.layout?.h ?? 3,
      input.layout?.x ?? 0,
      input.layout?.y ?? 0,
      visibility,
      visibility === "TEAM" ? input.sharedWithTeamId ?? null : null,
      input.tabId ?? null,
      now,
    ],
  );
  if (!row) throw new Error("DASHBOARD_WIDGET_INSERT_FAILED");
  return formatWidgetRecord({ ...row, __viewerId: user.id });
}

export async function updateDashboardWidgetForTenant(user: TenantUser, id: string, input: Partial<DashboardWidgetInput>) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.type !== undefined) patch.type = input.type;
  if (input.config !== undefined) patch.config = input.config;
  if (input.layout?.w !== undefined) patch.w = input.layout.w;
  if (input.layout?.h !== undefined) patch.h = input.layout.h;
  if (input.layout?.x !== undefined) patch.x = input.layout.x;
  if (input.layout?.y !== undefined) patch.y = input.layout.y;
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility;
    patch.sharedWithTeamId = input.visibility === "TEAM" ? input.sharedWithTeamId ?? null : null;
  }
  if (input.tabId !== undefined) patch.tabId = input.tabId;
  const columns = Object.keys(patch);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const tenant = tenantWhere(user, columns.length + 3);
  // Edit/delete stay owner-only regardless of sharing scope -- see the type comment above.
  const row = await queryOne<any>(
    `update "DashboardWidget"
     set ${assignments}
     where id = $${columns.length + 1} and "userId" = $${columns.length + 2} and ${tenant.sql}
     returning id, title, type, config, w, h, x, y, visibility, "sharedWithTeamId", "tabId", "userId", "createdAt", "updatedAt"`,
    [...values, id, user.id, ...tenant.values],
  );
  if (!row) throw new Error("DASHBOARD_WIDGET_NOT_FOUND");
  return formatWidgetRecord({ ...row, __viewerId: user.id });
}

export async function deleteDashboardWidgetForTenant(user: TenantUser, id: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const tenant = tenantWhere(user, 3);
  await execute(`delete from "DashboardWidget" where id = $1 and "userId" = $2 and ${tenant.sql}`, [id, user.id, ...tenant.values]);
}

export async function getDashboardWidgetForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 2);
  // A shared (TEAM/TENANT) widget's *data* is viewable by anyone it's shared with -- this
  // backs GET .../data, so it must use the same visibility rule as the list endpoint, not an
  // owner-only lookup (which would 404 a widget for the very teammates it was shared with).
  const row = await queryOne<any>(
    `select id, title, type, config, w, h, x, y, visibility, "sharedWithTeamId", "tabId", "userId", "createdAt", "updatedAt"
     from "DashboardWidget"
     where id = $1 and ${tenant.sql}
       and (
         "userId" = $3
         or visibility = 'TENANT'
         or (visibility = 'TEAM' and "sharedWithTeamId" = (select "teamId" from "User" where id::text = $3))
       )
     limit 1`,
    [id, ...tenant.values, user.id],
  );
  return row ? formatWidgetRecord({ ...row, __viewerId: user.id }) : null;
}

const CUSTOM_REPORT_COLUMNS = `id, name, description, module, config, "chartType", "isPublic", "isActive", "createdBy",
  "currentVersion", "deprecationStatus", "deprecatedReason", "deprecatedAt", "viewCount", "lastOpenedAt", "createdAt", "updatedAt"`;

export async function listCustomReportsForTenant(user: TenantUser) {
  const tenant = tenantWhere(user);
  return query<any>(
    `select ${CUSTOM_REPORT_COLUMNS}
     from "CustomReport"
     where "chartType" <> 'SAVED_VIEW' and ${tenant.sql}
     order by "createdAt" desc`,
    tenant.values,
  );
}

export async function createCustomReportForTenant(user: TenantUser, input: CustomReportInput) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  if (!input.name?.trim()) throw new Error("REPORT_NAME_REQUIRED");
  if (!input.module?.trim()) throw new Error("REPORT_MODULE_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CustomReport"
      (id, "tenantId", name, description, module, config, schedule, "chartType", "isPublic", "isActive", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, null, $7, $8, $9, $10, $11, $11)
     returning ${CUSTOM_REPORT_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      input.name.trim(),
      input.description ?? null,
      input.module.toUpperCase(),
      input.config ?? {},
      input.chartType ?? "TABLE",
      Boolean(input.isPublic),
      input.isActive ?? true,
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("CUSTOM_REPORT_INSERT_FAILED");
  return row;
}

export async function updateCustomReportForTenant(user: TenantUser, reportId: string, input: CustomReportInput) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  if (!input.name?.trim()) throw new Error("REPORT_NAME_REQUIRED");
  if (!input.module?.trim()) throw new Error("REPORT_MODULE_REQUIRED");
  const tenant = tenantWhere(user, 10);
  const row = await queryOne<any>(
    `update "CustomReport"
     set name = $1, description = $2, module = $3, config = $4, "chartType" = $5, "isPublic" = $6, "isActive" = $7, "updatedAt" = $8
     where id = $9 and "chartType" <> 'SAVED_VIEW' and ${tenant.sql}
     returning ${CUSTOM_REPORT_COLUMNS}`,
    [
      input.name.trim(),
      input.description ?? null,
      input.module.toUpperCase(),
      input.config ?? {},
      input.chartType ?? "TABLE",
      Boolean(input.isPublic),
      input.isActive ?? true,
      new Date().toISOString(),
      reportId,
      ...tenant.values,
    ],
  );
  return row;
}

export async function deleteCustomReportForTenant(user: TenantUser, reportId: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const tenant = tenantWhere(user, 2);
  await execute(`delete from "CustomReport" where id = $1 and "chartType" <> 'SAVED_VIEW' and ${tenant.sql}`, [reportId, ...tenant.values]);
}

export async function getCustomReportForTenant(user: TenantUser, reportId: string) {
  const tenant = tenantWhere(user, 2);
  return queryOne<any>(
    `select id, name, module, config, "chartType"
     from "CustomReport"
     where id = $1 and ${tenant.sql}
     limit 1`,
    [reportId, ...tenant.values],
  );
}

// --- Custom report versioning (gap checklist Module 17, "dashboard/report versioning") ---
// Mirrors MarketingJourneyVersion's shape (this codebase's only pre-existing draft/publish/
// rollback precedent) and DashboardTab's own new versioning above -- a version is an immutable
// snapshot inserted at publish time; rollback re-applies an old snapshot and republishes it as a
// new version at the tip, never rewinding "currentVersion" (old versions must stay addressable).
//
// Unlike plain edit/delete (open to any tenant user today, a pre-existing characteristic this
// pass doesn't change), publish/rollback/clone/transfer/deprecate are gated to the report's own
// creator or a tenant admin -- the same more-careful-than-plain-edit governance-action posture
// the semantic metric layer's certify/deprecate actions already established for Metric.
async function getGovernableCustomReport(user: TenantUser, reportId: string) {
  const tenant = tenantWhere(user, 2);
  const row = await queryOne<any>(
    `select ${CUSTOM_REPORT_COLUMNS}, "createdBy" from "CustomReport"
     where id = $1 and "chartType" <> 'SAVED_VIEW' and ${tenant.sql} limit 1`,
    [reportId, ...tenant.values],
  );
  if (!row) return null;
  const isAdmin = Boolean(user.isPlatformAdmin || user.isTenantAdmin);
  if (!isAdmin && row.createdBy !== user.id) throw new Error("FORBIDDEN");
  return row;
}

export async function publishCustomReportVersion(user: TenantUser, reportId: string, publishNotes?: string | null) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const report = await getGovernableCustomReport(user, reportId);
  if (!report) throw new Error("CUSTOM_REPORT_NOT_FOUND");

  const snapshot = {
    name: report.name, description: report.description, module: report.module,
    config: report.config, chartType: report.chartType,
  };
  const version = Number(report.currentVersion ?? 0) + 1;
  const now = new Date().toISOString();
  await execute(
    `insert into "CustomReportVersion" (id, "tenantId", "reportId", version, snapshot, "publishNotes", "publishedBy", "publishedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), user.tenantId, reportId, version, snapshot, publishNotes ?? null, user.id, now],
  );
  const tenant = tenantWhere(user, 4);
  const data = await queryOne<any>(
    `update "CustomReport" set "currentVersion" = $1, "updatedAt" = $2 where id = $3 and ${tenant.sql} returning ${CUSTOM_REPORT_COLUMNS}`,
    [version, now, reportId, ...tenant.values],
  );
  if (!data) throw new Error("CUSTOM_REPORT_NOT_FOUND");
  return data;
}

export async function listCustomReportVersions(user: TenantUser, reportId: string) {
  const report = await getGovernableCustomReport(user, reportId);
  if (!report) throw new Error("CUSTOM_REPORT_NOT_FOUND");
  const tenant = tenantWhere(user, 2);
  return query<any>(
    `select id, version, "publishNotes", "publishedBy", "publishedAt" from "CustomReportVersion"
     where "reportId" = $1 and ${tenant.sql} order by version desc`,
    [reportId, ...tenant.values],
  );
}

export async function restoreCustomReportVersion(user: TenantUser, reportId: string, version: number) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const report = await getGovernableCustomReport(user, reportId);
  if (!report) throw new Error("CUSTOM_REPORT_NOT_FOUND");

  const tenant = tenantWhere(user, 3);
  const versionRow = await queryOne<any>(
    `select snapshot from "CustomReportVersion" where "reportId" = $1 and version = $2 and ${tenant.sql} limit 1`,
    [reportId, version, ...tenant.values],
  );
  if (!versionRow) throw new Error("CUSTOM_REPORT_VERSION_NOT_FOUND");

  const snapshot = versionRow.snapshot ?? {};
  const now = new Date().toISOString();
  const updateTenant = tenantWhere(user, 8);
  await execute(
    `update "CustomReport"
     set name = $1, description = $2, module = $3, config = $4, "chartType" = $5, "updatedAt" = $6
     where id = $7 and ${updateTenant.sql}`,
    [snapshot.name, snapshot.description ?? null, snapshot.module, snapshot.config ?? {}, snapshot.chartType ?? "TABLE", now, reportId, ...updateTenant.values],
  );

  return publishCustomReportVersion(user, reportId, `Restored from version ${version}`);
}

// Clone doesn't carry over version history -- currentVersion resets to 0 for a fresh row, same
// "clone is a new starting point, not a branch" rule DashboardTab's own clone above follows.
export async function cloneCustomReportForTenant(user: TenantUser, reportId: string, newName: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("REPORT_NAME_REQUIRED");
  const tenant = tenantWhere(user, 2);
  const source = await queryOne<any>(
    `select name, description, module, config, "chartType", "isPublic" from "CustomReport"
     where id = $1 and "chartType" <> 'SAVED_VIEW' and ${tenant.sql} limit 1`,
    [reportId, ...tenant.values],
  );
  if (!source) throw new Error("CUSTOM_REPORT_NOT_FOUND");

  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CustomReport"
      (id, "tenantId", name, description, module, config, schedule, "chartType", "isPublic", "isActive", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, null, $7, $8, true, $9, $10, $10)
     returning ${CUSTOM_REPORT_COLUMNS}`,
    [randomUUID(), user.tenantId, trimmed, source.description, source.module, source.config, source.chartType, false, user.id, now],
  );
  if (!row) throw new Error("CUSTOM_REPORT_INSERT_FAILED");
  return row;
}

// Owner transfer -- gated to the report's current creator or a tenant admin (see
// getGovernableCustomReport above).
export async function transferCustomReportOwnerForTenant(user: TenantUser, reportId: string, newOwnerUserId: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const report = await getGovernableCustomReport(user, reportId);
  if (!report) throw new Error("CUSTOM_REPORT_NOT_FOUND");
  const tenant = user.tenantId;
  if (!tenant) throw new Error("TENANT_CONTEXT_REQUIRED");

  const newOwner = await queryOne<any>(`select id from "User" where id = $1 and "tenantId" = $2`, [newOwnerUserId, tenant]);
  if (!newOwner) throw new Error("CUSTOM_REPORT_TRANSFER_TARGET_NOT_FOUND");

  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "CustomReport" set "createdBy" = $1, "updatedAt" = $2 where id = $3 and "tenantId" = $4 returning ${CUSTOM_REPORT_COLUMNS}`,
    [newOwnerUserId, now, reportId, tenant],
  );
  if (!updated) throw new Error("CUSTOM_REPORT_NOT_FOUND");
  return updated;
}

// Deprecation workflow -- mirrors Metric's own certificationStatus/deprecationStatus shape: a
// badge/status flag on an otherwise still-functional, still-runnable report, not a hiding
// mechanism -- deliberately consistent with DashboardTab's own deprecation semantics above.
export async function setCustomReportDeprecationForTenant(
  user: TenantUser,
  reportId: string,
  status: "ACTIVE" | "DEPRECATED",
  reason?: string | null,
) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  if (!["ACTIVE", "DEPRECATED"].includes(status)) throw new Error("Invalid deprecationStatus");
  const report = await getGovernableCustomReport(user, reportId);
  if (!report) throw new Error("CUSTOM_REPORT_NOT_FOUND");

  const now = new Date().toISOString();
  const tenant = tenantWhere(user, 5);
  const row = await queryOne<any>(
    `update "CustomReport"
     set "deprecationStatus" = $1, "deprecatedReason" = $2, "deprecatedAt" = $3, "updatedAt" = $4
     where id = $5 and ${tenant.sql}
     returning ${CUSTOM_REPORT_COLUMNS}`,
    [status, status === "DEPRECATED" ? reason ?? null : null, status === "DEPRECATED" ? now : null, now, reportId, ...tenant.values],
  );
  if (!row) throw new Error("CUSTOM_REPORT_NOT_FOUND");
  return row;
}

// Usage metrics -- reuses the same viewCount/lastOpenedAt columns recordSavedViewOpened already
// writes for chartType='SAVED_VIEW' rows, but for real reports (chartType <> 'SAVED_VIEW'),
// which had no equivalent tracking wired at all until this pass. Fire-and-forget, called when a
// user actually opens a report, not on every render -- same "real usage, not poll noise"
// precedent recordSavedViewOpened already established.
export async function recordCustomReportOpened(user: TenantUser, reportId: string) {
  if (!user.tenantId) return;
  await execute(
    `update "CustomReport" set "viewCount" = "viewCount" + 1, "lastOpenedAt" = $1
     where id = $2 and "tenantId" = $3 and "chartType" <> 'SAVED_VIEW'`,
    [new Date().toISOString(), reportId, user.tenantId],
  );
}

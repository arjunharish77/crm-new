import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

type DashboardWidgetInput = {
  title: string;
  type: string;
  config: Record<string, unknown>;
  layout?: { w?: number; h?: number; x?: number; y?: number };
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
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listDashboardWidgetsForTenant(user: TenantUser) {
  const tenant = tenantWhere(user, 2);
  const rows = await query<any>(
    `select id, title, type, config, w, h, x, y, "createdAt", "updatedAt"
     from "DashboardWidget"
     where "userId" = $1 and ${tenant.sql}
     order by y asc, x asc, "createdAt" asc`,
    [user.id, ...tenant.values],
  );
  return rows.map(formatWidgetRecord);
}

export async function createDashboardWidgetForTenant(user: TenantUser, input: DashboardWidgetInput) {
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "DashboardWidget"
      (id, "tenantId", "userId", title, type, config, w, h, x, y, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     returning id, title, type, config, w, h, x, y, "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      user.id,
      input.title,
      input.type,
      input.config ?? {},
      input.layout?.w ?? 1,
      input.layout?.h ?? 1,
      input.layout?.x ?? 0,
      input.layout?.y ?? 0,
      now,
    ],
  );
  if (!row) throw new Error("DASHBOARD_WIDGET_INSERT_FAILED");
  return formatWidgetRecord(row);
}

export async function updateDashboardWidgetForTenant(user: TenantUser, id: string, input: Partial<DashboardWidgetInput>) {
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.type !== undefined) patch.type = input.type;
  if (input.config !== undefined) patch.config = input.config;
  if (input.layout?.w !== undefined) patch.w = input.layout.w;
  if (input.layout?.h !== undefined) patch.h = input.layout.h;
  if (input.layout?.x !== undefined) patch.x = input.layout.x;
  if (input.layout?.y !== undefined) patch.y = input.layout.y;
  const columns = Object.keys(patch);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const tenant = tenantWhere(user, columns.length + 3);
  const row = await queryOne<any>(
    `update "DashboardWidget"
     set ${assignments}
     where id = $${columns.length + 1} and "userId" = $${columns.length + 2} and ${tenant.sql}
     returning id, title, type, config, w, h, x, y, "createdAt", "updatedAt"`,
    [...values, id, user.id, ...tenant.values],
  );
  if (!row) throw new Error("DASHBOARD_WIDGET_NOT_FOUND");
  return formatWidgetRecord(row);
}

export async function deleteDashboardWidgetForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 3);
  await execute(`delete from "DashboardWidget" where id = $1 and "userId" = $2 and ${tenant.sql}`, [id, user.id, ...tenant.values]);
}

export async function getDashboardWidgetForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 3);
  const row = await queryOne<any>(
    `select id, title, type, config, w, h, x, y, "createdAt", "updatedAt"
     from "DashboardWidget"
     where id = $1 and "userId" = $2 and ${tenant.sql}
     limit 1`,
    [id, user.id, ...tenant.values],
  );
  return row ? formatWidgetRecord(row) : null;
}

export async function listCustomReportsForTenant(user: TenantUser) {
  const tenant = tenantWhere(user);
  return query<any>(
    `select id, name, description, module, config, "chartType", "isPublic", "isActive", "createdAt", "updatedAt"
     from "CustomReport"
     where "chartType" <> 'SAVED_VIEW' and ${tenant.sql}
     order by "createdAt" desc`,
    tenant.values,
  );
}

export async function createCustomReportForTenant(user: TenantUser, input: CustomReportInput) {
  if (!input.name?.trim()) throw new Error("REPORT_NAME_REQUIRED");
  if (!input.module?.trim()) throw new Error("REPORT_MODULE_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CustomReport"
      (id, "tenantId", name, description, module, config, schedule, "chartType", "isPublic", "isActive", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, null, $7, $8, $9, $10, $11, $11)
     returning id, name, description, module, config, "chartType", "isPublic", "isActive", "createdAt", "updatedAt"`,
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
  if (!input.name?.trim()) throw new Error("REPORT_NAME_REQUIRED");
  if (!input.module?.trim()) throw new Error("REPORT_MODULE_REQUIRED");
  const tenant = tenantWhere(user, 10);
  const row = await queryOne<any>(
    `update "CustomReport"
     set name = $1, description = $2, module = $3, config = $4, "chartType" = $5, "isPublic" = $6, "isActive" = $7, "updatedAt" = $8
     where id = $9 and "chartType" <> 'SAVED_VIEW' and ${tenant.sql}
     returning id, name, description, module, config, "chartType", "isPublic", "isActive", "createdAt", "updatedAt"`,
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

import { randomUUID } from "crypto";
import { query, queryOne, type Queryable } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { SmartViewModule, SmartViewTab } from "@/types/smart-views";

type TenantUser = {
  id: string;
  tenantId: string | null;
  roleId?: string | null;
};

type SavedViewInput = {
  name: string;
  module: string;
  filters: Record<string, unknown>;
  tabs?: SmartViewTab[];
  scope?: "PRIVATE" | "SHARED" | "ROLE" | "TENANT_DEFAULT";
  isDefault?: boolean;
  isShared?: boolean;
  isPinned?: boolean;
  density?: "compact" | "comfortable" | "spacious";
  sort?: Record<string, unknown> | null;
  columns?: string[];
  groupBy?: string | null;
  quickActions?: string[];
  sharedUserIds?: string[];
  sharedTeamIds?: string[];
  sharedSalesGroupIds?: string[];
  sharedRoleIds?: string[];
  displayOrder?: number;
  defaultModule?: string | null;
  defaultPersona?: "ADMIN" | "MANAGER" | "REP" | "PARTNER" | null;
};

function normalizeSavedViewConfig(config: any = {}) {
  const scope = config.scope ?? (config.isShared ? "SHARED" : "PRIVATE");
  const legacyModule = typeof config.module === "string" ? config.module : "LEADS";
  const legacyFilters = config.filters ?? { conditions: [], logic: "AND" };
  const rawTabs = Array.isArray(config.tabs) && config.tabs.length > 0
    ? config.tabs
    : [{
        id: "default",
        name: "Default",
        module: legacyModule,
        filters: legacyFilters,
        density: config.density,
        columns: config.columns,
        sort: config.sort,
        groupBy: config.groupBy,
        chart: config.chart,
        countChips: config.countChips,
        quickActions: config.quickActions,
      }];
  const tabs = rawTabs.map((tab: any, index: number) => ({
    id: String(tab.id || `tab-${index + 1}`),
    name: String(tab.name || `Tab ${index + 1}`),
    module: String(tab.module || legacyModule).toUpperCase() as SmartViewModule,
    filters: tab.filters ?? { conditions: [], logic: "AND" },
    density: tab.density ?? config.density ?? "comfortable",
    columns: Array.isArray(tab.columns) ? tab.columns : Array.isArray(config.columns) ? config.columns : [],
    sort: tab.sort ?? config.sort ?? null,
    groupBy: tab.groupBy ?? config.groupBy ?? null,
    chart: tab.chart ?? config.chart ?? { type: "none", metric: "count", field: null },
    countChips: Array.isArray(tab.countChips) ? tab.countChips : Array.isArray(config.countChips) ? config.countChips : [],
    quickActions: Array.isArray(tab.quickActions)
      ? tab.quickActions
      : Array.isArray(config.quickActions)
        ? config.quickActions
        : [],
  }));
  const primaryTab = tabs[0] ?? rawTabs[0];
  return {
    filters: primaryTab?.filters ?? legacyFilters,
    tabs,
    isDefault: Boolean(config.isDefault),
    isPinned: Boolean(config.isPinned),
    scope,
    density: config.density ?? "comfortable",
    sort: config.sort ?? null,
    columns: Array.isArray(config.columns) ? config.columns : [],
    groupBy: config.groupBy ?? null,
    chart: config.chart ?? { type: "none", metric: "count", field: null },
    countChips: Array.isArray(config.countChips) ? config.countChips : [],
    quickActions: Array.isArray(config.quickActions) ? config.quickActions : [],
    sharedUserIds: Array.isArray(config.sharedUserIds) ? config.sharedUserIds : [],
    sharedTeamIds: Array.isArray(config.sharedTeamIds) ? config.sharedTeamIds : [],
    sharedSalesGroupIds: Array.isArray(config.sharedSalesGroupIds) ? config.sharedSalesGroupIds : [],
    sharedRoleIds: Array.isArray(config.sharedRoleIds) ? config.sharedRoleIds : [],
    displayOrder: Number.isFinite(Number(config.displayOrder)) ? Number(config.displayOrder) : 1000,
    defaultModule: typeof config.defaultModule === "string" ? config.defaultModule : null,
    defaultPersona: typeof config.defaultPersona === "string" ? config.defaultPersona : null,
  };
}

function buildSavedViewConfig(input: Partial<SavedViewInput>, existing: any = {}) {
  const normalized = normalizeSavedViewConfig(existing);
  const scope = input.scope ?? normalized.scope;
  const tabs = Array.isArray(input.tabs) && input.tabs.length > 0
    ? input.tabs.map((tab, index) => ({
        id: tab.id || `tab-${index + 1}`,
        name: tab.name || `Tab ${index + 1}`,
        module: String(tab.module || input.module || "LEADS").toUpperCase(),
        filters: tab.filters ?? { conditions: [], logic: "AND" },
        density: tab.density ?? input.density ?? normalized.density,
        columns: tab.columns ?? input.columns ?? [],
        sort: tab.sort ?? input.sort ?? null,
        groupBy: tab.groupBy ?? input.groupBy ?? null,
        chart: tab.chart ?? { type: "none", metric: "count", field: null },
        countChips: tab.countChips ?? [],
        quickActions: tab.quickActions ?? input.quickActions ?? [],
      }))
    : normalized.tabs;
  const primaryTab = tabs[0];
  return {
    ...normalized,
    filters: input.filters ?? primaryTab?.filters ?? normalized.filters,
    tabs,
    isDefault: input.isDefault ?? normalized.isDefault,
    isPinned: input.isPinned ?? normalized.isPinned,
    scope,
    density: input.density ?? normalized.density,
    sort: input.sort === undefined ? normalized.sort : input.sort,
    columns: input.columns ?? normalized.columns,
    groupBy: input.groupBy === undefined ? normalized.groupBy : input.groupBy,
    quickActions: input.quickActions ?? normalized.quickActions,
    sharedUserIds: input.sharedUserIds ?? normalized.sharedUserIds,
    sharedTeamIds: input.sharedTeamIds ?? normalized.sharedTeamIds,
    sharedSalesGroupIds: input.sharedSalesGroupIds ?? normalized.sharedSalesGroupIds,
    sharedRoleIds: input.sharedRoleIds ?? normalized.sharedRoleIds,
    displayOrder: input.displayOrder ?? normalized.displayOrder,
    defaultModule: input.defaultModule === undefined ? normalized.defaultModule : input.defaultModule,
    defaultPersona: input.defaultPersona === undefined ? normalized.defaultPersona : input.defaultPersona,
  };
}

async function getSavedViewAccessProfile(user: TenantUser, client?: Queryable) {
  if (!user.tenantId) {
    return { roleId: user.roleId ?? null, teamIds: new Set<string>(), salesGroupIds: new Set<string>() };
  }

  const [userRows, teamRows, salesGroupRows] = await Promise.all([
    query<any>('select "roleId", "teamId" from "User" where "tenantId" = $1 and id = $2 limit 1', [user.tenantId, user.id], client),
    query<any>('select "teamId" from "TeamMember" where "tenantId" = $1 and "userId" = $2', [user.tenantId, user.id], client),
    query<any>('select "groupId" from "SalesGroupMember" where "tenantId" = $1 and "userId" = $2', [user.tenantId, user.id], client),
  ]);

  const teamIds = new Set<string>();
  const directTeamId = userRows[0]?.teamId;
  if (directTeamId) teamIds.add(directTeamId);
  for (const member of teamRows) {
    if (member.teamId) teamIds.add(member.teamId);
  }

  return {
    roleId: user.roleId ?? userRows[0]?.roleId ?? null,
    teamIds,
    salesGroupIds: new Set(salesGroupRows.map((member: any) => member.groupId).filter(Boolean)),
  };
}

function canUseSavedView(user: TenantUser, view: any, access: Awaited<ReturnType<typeof getSavedViewAccessProfile>>) {
  const config = normalizeSavedViewConfig({ ...(view.config ?? {}), module: view.module });
  if (view.createdBy === user.id) return true;
  if (config.scope === "TENANT_DEFAULT") return true;
  const hasTargets =
    config.sharedUserIds.length > 0 ||
    config.sharedTeamIds.length > 0 ||
    config.sharedSalesGroupIds.length > 0 ||
    config.sharedRoleIds.length > 0;
  if (config.scope === "SHARED" && !hasTargets) return true;
  if (!config.scope && view.isPublic) return true;
  if (config.sharedUserIds.includes(user.id)) return true;
  if (access.roleId && config.sharedRoleIds.includes(access.roleId)) return true;
  if (config.sharedTeamIds.some((teamId: string) => access.teamIds.has(teamId))) return true;
  if (config.sharedSalesGroupIds.some((groupId: string) => access.salesGroupIds.has(groupId))) return true;
  return false;
}

function serializeSavedView(item: any) {
  const config = normalizeSavedViewConfig({ ...(item.config ?? {}), module: item.module });
  return {
    id: item.id,
    name: item.name,
    ownerId: item.createdBy,
    isDefault: config.isDefault,
    isPinned: config.isPinned,
    isShared: Boolean(item.isPublic) || config.scope !== "PRIVATE",
    scope: config.scope,
    filters: config.filters,
    tabs: config.tabs,
    density: config.density,
    sort: config.sort,
    columns: config.columns,
    groupBy: config.groupBy,
    quickActions: config.quickActions,
    sharedUserIds: config.sharedUserIds,
    sharedTeamIds: config.sharedTeamIds,
    sharedSalesGroupIds: config.sharedSalesGroupIds,
    sharedRoleIds: config.sharedRoleIds,
    displayOrder: config.displayOrder,
    defaultModule: config.defaultModule,
    defaultPersona: config.defaultPersona,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function auditSavedView(user: TenantUser, action: string, viewId: string, before: unknown, after: unknown, client?: Queryable) {
  if (!user.tenantId) return;
  try {
    await query(
      `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
       values ($1, $2, $3, $4, 'SAVED_VIEW', $5, $6, $7, null, null, $8)`,
      [randomUUID(), user.tenantId, user.id, action, viewId, before, after, new Date().toISOString()],
      client,
    );
  } catch {
    // Saved Views should not fail user-facing mutations if the audit append is unavailable.
  }
}

async function clearOtherDefaultSavedViews(user: TenantUser, module: string, exceptId?: string, client?: Queryable) {
  const tenantClause = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
  const values = user.tenantId ? [module.toUpperCase(), user.tenantId] : [module.toUpperCase()];
  const rows = await query<any>(
    `select id, config from "CustomReport" where "chartType" = 'SAVED_VIEW' and module = $1 and ${tenantClause}`,
    values,
    client,
  );

  for (const item of rows.filter((row) => row.id !== exceptId)) {
    const config = buildSavedViewConfig({ isDefault: false }, { ...(item.config ?? {}), module });
    await query(
      'update "CustomReport" set config = $1, "updatedAt" = $2 where id = $3',
      [config, new Date().toISOString(), item.id],
      client,
    );
  }
}

export async function listSavedViewsForTenant(user: TenantUser, module: string) {
  const requestedModule = module.toUpperCase();
  const tenantClause = user.tenantId ? '"tenantId" = $1' : '"tenantId" is null';
  const values = user.tenantId ? [user.tenantId] : [];
  const rows = await query<any>(
    `select id, name, module, "isPublic", config, "createdBy", "createdAt", "updatedAt"
     from "CustomReport"
     where "chartType" = 'SAVED_VIEW' and ${tenantClause}
     order by "createdAt" asc`,
    values,
  );
  const access = await getSavedViewAccessProfile(user);
  return rows
    .filter((item) => canUseSavedView(user, item, access))
    .filter((item) => {
      if (requestedModule === "ALL") return true;
      const config = normalizeSavedViewConfig({ ...(item.config ?? {}), module: item.module });
      return String(item.module).toUpperCase() === requestedModule || config.tabs.some((tab: SmartViewTab) => tab.module === requestedModule);
    })
    .map(serializeSavedView)
    .sort((first: any, second: any) =>
      Number(second.isPinned) - Number(first.isPinned)
      || Number(first.displayOrder ?? 1000) - Number(second.displayOrder ?? 1000)
      || first.name.localeCompare(second.name),
    );
}

export async function createSavedViewForTenant(user: TenantUser, input: SavedViewInput) {
  return withTransaction(user, async (client) => {
    const now = new Date().toISOString();
    if (input.isDefault) {
      await clearOtherDefaultSavedViews(user, input.module, undefined, client);
    }
    const scope = input.scope ?? (input.isShared ? "SHARED" : "PRIVATE");
    const config = buildSavedViewConfig({ ...input, scope }, { module: input.module });
    const row = await queryOne<any>(
      `insert into "CustomReport"
        (id, "tenantId", name, description, module, config, schedule, "chartType", "isPublic", "isActive", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, null, $4, $5, null, 'SAVED_VIEW', $6, true, $7, $8, $8)
       returning id, name, module, "isPublic", config, "createdBy", "createdAt", "updatedAt"`,
      [
        randomUUID(),
        user.tenantId,
        input.name,
        input.module.toUpperCase(),
        config,
        scope === "SHARED" || scope === "TENANT_DEFAULT" || Boolean(input.isShared),
        user.id,
        now,
      ],
      client,
    );
    if (!row) throw new Error("SAVED_VIEW_INSERT_FAILED");
    await auditSavedView(user, "CREATE", row.id, null, row, client);
    return serializeSavedView(row);
  });
}

export async function updateSavedViewForTenant(user: TenantUser, id: string, input: Partial<SavedViewInput>) {
  return withTransaction(user, async (client) => {
    const tenantClause = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
    const values = user.tenantId ? [id, user.tenantId] : [id];
    const existing = await queryOne<any>(
      `select id, name, module, "isPublic", config, "createdBy", "createdAt", "updatedAt"
       from "CustomReport"
       where id = $1 and "chartType" = 'SAVED_VIEW' and ${tenantClause}
       limit 1`,
      values,
      client,
    );
    if (!existing) throw new Error("SAVED_VIEW_NOT_FOUND");

    if (input.isDefault) {
      await clearOtherDefaultSavedViews(user, existing.module, id, client);
    }

    const config = buildSavedViewConfig(input, { ...((existing as any).config ?? {}), module: existing.module });
    const scope = config.scope;
    const row = await queryOne<any>(
      `update "CustomReport"
       set name = $1, config = $2, "isPublic" = $3, "updatedAt" = $4
       where id = $5
       returning id, name, module, "isPublic", config, "createdBy", "createdAt", "updatedAt"`,
      [
        input.name ?? existing.name,
        config,
        scope === "SHARED" || scope === "TENANT_DEFAULT",
        new Date().toISOString(),
        id,
      ],
      client,
    );
    if (!row) throw new Error("SAVED_VIEW_NOT_FOUND");
    await auditSavedView(user, "UPDATE", row.id, existing, row, client);
    return serializeSavedView(row);
  });
}

export async function cloneSavedViewForTenant(user: TenantUser, id: string) {
  const tenantClause = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
  const values = user.tenantId ? [id, user.tenantId] : [id];
  const row = await queryOne<any>(
    `select id, name, module, "isPublic", config, "createdBy", "createdAt", "updatedAt"
     from "CustomReport"
     where id = $1 and "chartType" = 'SAVED_VIEW' and ${tenantClause}
     limit 1`,
    values,
  );
  if (!row) throw new Error("SAVED_VIEW_NOT_FOUND");
  const access = await getSavedViewAccessProfile(user);
  if (!canUseSavedView(user, row, access)) throw new Error("SAVED_VIEW_NOT_FOUND");
  const config = normalizeSavedViewConfig(row.config);
  return createSavedViewForTenant(user, {
    name: `${row.name} Copy`,
    module: row.module,
    filters: config.filters,
    isDefault: false,
    isPinned: false,
    scope: "PRIVATE",
    density: config.density,
    sort: config.sort,
    columns: config.columns,
    groupBy: config.groupBy,
    quickActions: config.quickActions,
    tabs: config.tabs,
  });
}

export async function deleteSavedViewForTenant(user: TenantUser, id: string) {
  const tenantClause = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
  const values = user.tenantId ? [id, user.tenantId] : [id];
  const existing = await queryOne<any>(
    `select id, name, module, "isPublic", config, "createdBy", "createdAt", "updatedAt"
     from "CustomReport"
     where id = $1 and "chartType" = 'SAVED_VIEW' and ${tenantClause}
     limit 1`,
    values,
  );
  await query(`delete from "CustomReport" where id = $1 and "chartType" = 'SAVED_VIEW' and ${tenantClause}`, values);
  if (existing) await auditSavedView(user, "DELETE", id, existing, null);
}

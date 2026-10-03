import { archiveItemForTenant } from "@/lib/server/archive-items";
import { randomUUID } from "crypto";
import { query, queryOne, type Queryable } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { createUserNotification } from "@/lib/server/notifications";
import { SmartViewModule, SmartViewTab } from "@/types/smart-views";

type TenantUser = {
  id: string;
  tenantId: string | null;
  roleId?: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  name?: string | null;
  email?: string | null;
};

export type SavedViewComment = {
  id: string;
  body: string;
  createdBy: string;
  createdAt: string;
};

export type SavedViewShareTargets = {
  sharedUserIds?: string[];
  sharedTeamIds?: string[];
  sharedSalesGroupIds?: string[];
  sharedRoleIds?: string[];
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
  isArchived?: boolean;
  ownerId?: string;
};

const SAVED_VIEW_COLUMNS = 'id, name, module, "isPublic", config, "createdBy", "viewCount", "lastOpenedAt", "isArchived", "archivedAt", "createdAt", "updatedAt"';

function isSavedViewAdmin(user: TenantUser) {
  return !!(user.isTenantAdmin || user.isPlatformAdmin);
}

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
    comments: Array.isArray(config.comments) ? config.comments : [],
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

// Expands share targets (explicit users + team/sales-group/role membership) into the
// concrete list of users who'd actually gain access -- used both for "share preview" (before
// saving) and for fanning out a "this View changed" notification (after saving). No existing
// id->members helper covers Team/Role in this codebase (only the reverse, user->their teams,
// via getSavedViewAccessProfile above), so this is written directly against the same join
// tables.
export async function resolveSavedViewShareTargets(tenantId: string, targets: SavedViewShareTargets) {
  const [teamMembers, groupMembers, roleMembers] = await Promise.all([
    targets.sharedTeamIds?.length
      ? query<any>('select "userId" from "TeamMember" where "tenantId" = $1 and "teamId" = any($2::text[])', [tenantId, targets.sharedTeamIds])
      : Promise.resolve([]),
    targets.sharedSalesGroupIds?.length
      ? query<any>('select "userId" from "SalesGroupMember" where "tenantId" = $1 and "groupId" = any($2::text[])', [tenantId, targets.sharedSalesGroupIds])
      : Promise.resolve([]),
    targets.sharedRoleIds?.length
      ? query<any>('select id as "userId" from "User" where "tenantId" = $1 and "roleId" = any($2::text[])', [tenantId, targets.sharedRoleIds])
      : Promise.resolve([]),
  ]);
  const userIds = new Set<string>([
    ...(targets.sharedUserIds ?? []),
    ...teamMembers.map((row: any) => row.userId),
    ...groupMembers.map((row: any) => row.userId),
    ...roleMembers.map((row: any) => row.userId),
  ]);
  if (userIds.size === 0) return [];
  return query<any>('select id, name, email from "User" where "tenantId" = $1 and id = any($2::text[])', [tenantId, [...userIds]]);
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

// A View that's existed for a while and hasn't been opened recently (or ever) is "stale" --
// both conditions matter so a brand-new, not-yet-opened View isn't flagged the instant it's
// created.
const STALE_VIEW_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

function serializeSavedView(item: any) {
  const config = normalizeSavedViewConfig({ ...(item.config ?? {}), module: item.module });
  const now = Date.now();
  const ageMs = now - new Date(item.createdAt).getTime();
  const lastTouchMs = item.lastOpenedAt ? new Date(item.lastOpenedAt).getTime() : new Date(item.createdAt).getTime();
  const isStale = ageMs > STALE_VIEW_THRESHOLD_MS && now - lastTouchMs > STALE_VIEW_THRESHOLD_MS;
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
    viewCount: item.viewCount ?? 0,
    lastOpenedAt: item.lastOpenedAt ?? null,
    isArchived: Boolean(item.isArchived),
    archivedAt: item.archivedAt ?? null,
    isStale,
    comments: config.comments,
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

// Cheap "did anything a viewer would notice actually change" check -- comments are excluded
// since they're appended by a separate function that never goes through this path, and
// viewCount/lastOpenedAt aren't part of config at all (they're their own columns).
function savedViewConfigSignature(config: any) {
  const { comments, ...rest } = normalizeSavedViewConfig(config);
  return JSON.stringify(rest);
}

// Fire-and-forget, called after the update transaction commits (matching this codebase's
// existing convention for non-critical notifications, e.g. task SLA breach alerts) --
// notifying share targets should never fail or block the save itself. Only SHARED/ROLE scope
// fans out; TENANT_DEFAULT has no bounded target list (it's "everyone"), so notifying on
// every edit would be spam, and PRIVATE has no one else to notify.
async function notifySavedViewChanged(user: TenantUser, row: any, reason: "updated" | "commented") {
  if (!user.tenantId) return;
  const config = normalizeSavedViewConfig({ ...(row.config ?? {}), module: row.module });
  if (config.scope !== "SHARED" && config.scope !== "ROLE") return;
  const targets = await resolveSavedViewShareTargets(user.tenantId, config);
  const actorName = user.name || user.email || "A teammate";
  const title = reason === "commented" ? "New comment on a shared Smart View" : "Shared Smart View updated";
  const message = reason === "commented"
    ? `${actorName} commented on "${row.name}".`
    : `"${row.name}" was updated by ${actorName}.`;
  for (const target of targets) {
    if (target.id === user.id) continue;
    await createUserNotification({
      tenantId: user.tenantId,
      userId: target.id,
      title,
      message,
      data: { type: reason === "commented" ? "VIEW_COMMENTED" : "VIEW_UPDATED", viewId: row.id },
      category: "VIEWS",
    }).catch(() => undefined);
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
    `select ${SAVED_VIEW_COLUMNS}
     from "CustomReport"
     where "chartType" = 'SAVED_VIEW' and "deletedAt" is null and ${tenantClause}
     order by "createdAt" asc`,
    values,
  );
  const access = await getSavedViewAccessProfile(user);
  const visible = rows
    .filter((item) => canUseSavedView(user, item, access))
    .filter((item) => {
      if (requestedModule === "ALL") return true;
      const config = normalizeSavedViewConfig({ ...(item.config ?? {}), module: item.module });
      return String(item.module).toUpperCase() === requestedModule || config.tabs.some((tab: SmartViewTab) => tab.module === requestedModule);
    })
    .map(serializeSavedView);

  // Duplicate-View suggestion: same module + identical primary-tab filters as another View
  // visible to this user. A simple, bounded heuristic -- exact filter match, not fuzzy
  // similarity -- deliberately, so it flags genuine copies rather than guessing intent.
  const duplicateKey = (view: any) => `${String(view.tabs?.[0]?.module ?? "").toUpperCase()}::${JSON.stringify(view.tabs?.[0]?.filters ?? {})}`;
  const idsByKey = new Map<string, string[]>();
  for (const view of visible) {
    const key = duplicateKey(view);
    idsByKey.set(key, [...(idsByKey.get(key) ?? []), view.id]);
  }
  const withDuplicates = visible.map((view) => {
    const group = idsByKey.get(duplicateKey(view)) ?? [];
    return { ...view, possibleDuplicateOfId: group.length > 1 ? group.find((id) => id !== view.id) ?? null : null };
  });

  return withDuplicates.sort((first: any, second: any) =>
    Number(second.isPinned) - Number(first.isPinned)
    || Number(first.displayOrder ?? 1000) - Number(second.displayOrder ?? 1000)
    || first.name.localeCompare(second.name),
  );
}

export async function recordSavedViewOpened(user: TenantUser, id: string) {
  if (!user.tenantId) return;
  await query(
    `update "CustomReport" set "viewCount" = "viewCount" + 1, "lastOpenedAt" = $1
     where id = $2 and "tenantId" = $3 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null`,
    [new Date().toISOString(), id, user.tenantId],
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
       returning ${SAVED_VIEW_COLUMNS}`,
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
  const result = await withTransaction(user, async (client) => {
    const tenantClause = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
    const values = user.tenantId ? [id, user.tenantId] : [id];
    const existing = await queryOne<any>(
      `select ${SAVED_VIEW_COLUMNS}
       from "CustomReport"
       where id = $1 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null and ${tenantClause}
       limit 1`,
      values,
      client,
    );
    if (!existing) throw new Error("SAVED_VIEW_NOT_FOUND");
    // Permission review fix: update/delete previously had no ownership check at all -- any
    // authenticated tenant user could edit or delete any other user's private View just by
    // knowing its id. Only the creator or a tenant/platform admin may mutate it now.
    if (existing.createdBy !== user.id && !isSavedViewAdmin(user)) throw new Error("FORBIDDEN");

    let ownerId = existing.createdBy;
    if (input.ownerId !== undefined && input.ownerId !== existing.createdBy) {
      if (!isSavedViewAdmin(user)) throw new Error("FORBIDDEN");
      const targetUser = await queryOne<any>('select id from "User" where id = $1 and "tenantId" = $2', [input.ownerId, user.tenantId], client);
      if (!targetUser) throw new Error("OWNER_NOT_FOUND");
      ownerId = input.ownerId;
    }

    if (input.isDefault) {
      await clearOtherDefaultSavedViews(user, existing.module, id, client);
    }

    const config = buildSavedViewConfig(input, { ...((existing as any).config ?? {}), module: existing.module });
    const scope = config.scope;
    const isArchived = input.isArchived ?? existing.isArchived;
    const archivedAt = input.isArchived === undefined ? existing.archivedAt : input.isArchived ? new Date().toISOString() : null;
    const row = await queryOne<any>(
      `update "CustomReport"
       set name = $1, config = $2, "isPublic" = $3, "updatedAt" = $4, "createdBy" = $5, "isArchived" = $6, "archivedAt" = $7
       where id = $8
       returning ${SAVED_VIEW_COLUMNS}`,
      [
        input.name ?? existing.name,
        config,
        scope === "SHARED" || scope === "TENANT_DEFAULT",
        new Date().toISOString(),
        ownerId,
        isArchived,
        archivedAt,
        id,
      ],
      client,
    );
    if (!row) throw new Error("SAVED_VIEW_NOT_FOUND");
    await auditSavedView(user, "UPDATE", row.id, existing, row, client);
    const configChanged = savedViewConfigSignature(existing.config) !== savedViewConfigSignature(row.config);
    return { view: serializeSavedView(row), notifyRow: configChanged ? row : null };
  });
  if (result.notifyRow) {
    notifySavedViewChanged(user, result.notifyRow, "updated").catch(() => undefined);
  }
  return result.view;
}

export async function addSavedViewCommentForTenant(user: TenantUser, id: string, body: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("COMMENT_BODY_REQUIRED");
  const tenantClause = '"tenantId" = $2';
  const existing = await queryOne<any>(
    `select ${SAVED_VIEW_COLUMNS} from "CustomReport" where id = $1 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null and ${tenantClause} limit 1`,
    [id, user.tenantId],
  );
  if (!existing) throw new Error("SAVED_VIEW_NOT_FOUND");
  const access = await getSavedViewAccessProfile(user);
  if (!canUseSavedView(user, existing, access)) throw new Error("SAVED_VIEW_NOT_FOUND");

  const config = normalizeSavedViewConfig({ ...(existing.config ?? {}), module: existing.module });
  const comment: SavedViewComment = { id: randomUUID(), body: trimmed, createdBy: user.id, createdAt: new Date().toISOString() };
  const nextConfig = { ...config, comments: [...config.comments, comment] };
  const row = await queryOne<any>(
    `update "CustomReport" set config = $1, "updatedAt" = $2 where id = $3 returning ${SAVED_VIEW_COLUMNS}`,
    [nextConfig, new Date().toISOString(), id],
  );
  if (!row) throw new Error("SAVED_VIEW_NOT_FOUND");
  notifySavedViewChanged(user, row, "commented").catch(() => undefined);
  return serializeSavedView(row);
}

// No existing generic access-request/approval table anywhere in this app (the closest
// precedent, GamificationRedemption, is disproportionate for this) -- this codebase's real
// favored pattern for "someone needs to act on this" is a direct notification to the person
// who can act, which here is simply the View's owner.
export async function requestSavedViewAccessForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const row = await queryOne<any>(
    `select ${SAVED_VIEW_COLUMNS} from "CustomReport" where id = $1 and "tenantId" = $2 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null limit 1`,
    [id, user.tenantId],
  );
  if (!row) throw new Error("SAVED_VIEW_NOT_FOUND");
  if (row.createdBy === user.id) throw new Error("ALREADY_OWNER");
  const requesterName = user.name || user.email || "A teammate";
  await createUserNotification({
    tenantId: user.tenantId,
    userId: row.createdBy,
    title: "Smart View access requested",
    message: `${requesterName} requested access to your Smart View "${row.name}".`,
    data: { type: "VIEW_ACCESS_REQUEST", viewId: id, requesterId: user.id },
    category: "VIEWS",
  });
}

// Minimal, access-independent lookup: just enough (name + owner) to render a "you don't have
// access" prompt for a deep-linked View without exposing its actual data/config to someone
// who isn't authorized to see it.
export async function getSavedViewSummaryForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) return null;
  const row = await queryOne<any>(
    `select cr.id, cr.name, cr."createdBy", u.name as "ownerName", u.email as "ownerEmail"
     from "CustomReport" cr
     left join "User" u on u.id = cr."createdBy"
     where cr.id = $1 and cr."tenantId" = $2 and cr."chartType" = 'SAVED_VIEW' and cr."deletedAt" is null
     limit 1`,
    [id, user.tenantId],
  );
  if (!row) return null;
  return { id: row.id, name: row.name, ownerId: row.createdBy, ownerName: row.ownerName || row.ownerEmail || "Unknown" };
}

export async function cloneSavedViewForTenant(user: TenantUser, id: string) {
  const tenantClause = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
  const values = user.tenantId ? [id, user.tenantId] : [id];
  const row = await queryOne<any>(
    `select ${SAVED_VIEW_COLUMNS}
     from "CustomReport"
     where id = $1 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null and ${tenantClause}
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

// Delete archives the view (decision 31): it leaves every list at once and can be restored for 30
// days from "Recently deleted"; the existing Archive / Show archived is a separate, kept state.
export async function deleteSavedViewForTenant(user: TenantUser, id: string) {
  const tenantClause = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
  const values = user.tenantId ? [id, user.tenantId] : [id];
  const existing = await queryOne<any>(
    `select ${SAVED_VIEW_COLUMNS}
     from "CustomReport"
     where id = $1 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null and ${tenantClause}
     limit 1`,
    values,
  );
  if (!existing) return null;
  if (existing.createdBy !== user.id && !isSavedViewAdmin(user)) throw new Error("FORBIDDEN");
  return archiveItemForTenant(user as any, "saved-view", id);
}

import { randomUUID } from "crypto";
import { execute, query, queryOne, jsonbParam } from "@/lib/db/query";
import { assertFeatureEnabled } from "@/lib/server/entitlements";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
  isTenantAdmin?: boolean;
};

// Gap checklist Module 17, item 4 (advanced dashboard builder: dashboard tabs). Tabs are
// per-owner, not per-viewer -- see the migration header for why a shared widget's tab
// assignment isn't something a viewer's own tab list can meaningfully reconcile against.
function tenantClause(user: TenantUser, values: unknown[]): string {
  if (!user.tenantId) return '"tenantId" is null';
  values.push(user.tenantId);
  return `"tenantId" = $${values.length}`;
}

const TAB_COLUMNS = `id, name, "order", "isDefault", "currentVersion", "deprecationStatus", "deprecatedReason",
  "deprecatedAt", "viewCount", "lastOpenedAt", "createdAt", "updatedAt", draft, "draftUpdatedAt"`;

export async function listDashboardTabsForTenant(user: TenantUser) {
  const values: unknown[] = [user.id];
  const clause = tenantClause(user, values);
  return query<any>(
    `select ${TAB_COLUMNS}
     from "DashboardTab"
     where "userId" = $1 and ${clause}
     order by "order" asc, "createdAt" asc`,
    values,
  );
}

export async function createDashboardTabForTenant(user: TenantUser, name: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const trimmed = name.trim();
  if (!trimmed) throw new Error("TAB_NAME_REQUIRED");
  const existing = await listDashboardTabsForTenant(user);
  const isFirstTab = existing.length === 0;
  const nextOrder = existing.reduce((max, tab) => Math.max(max, tab.order), -1) + 1;
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "DashboardTab" (id, "tenantId", "userId", name, "order", "isDefault", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $7)
     returning ${TAB_COLUMNS}`,
    [randomUUID(), user.tenantId, user.id, trimmed, nextOrder, isFirstTab, now],
  );
  if (!row) throw new Error("DASHBOARD_TAB_INSERT_FAILED");
  return row;
}

export async function renameDashboardTabForTenant(user: TenantUser, id: string, name: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const trimmed = name.trim();
  if (!trimmed) throw new Error("TAB_NAME_REQUIRED");
  const values: unknown[] = [trimmed, new Date().toISOString(), id, user.id];
  const clause = tenantClause(user, values);
  const row = await queryOne<any>(
    `update "DashboardTab"
     set name = $1, "updatedAt" = $2
     where id = $3 and "userId" = $4 and ${clause}
     returning ${TAB_COLUMNS}`,
    values,
  );
  if (!row) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  return row;
}

// Gap checklist Module 10's user workspace personalization item, "preferred dashboard" sub-item
// -- previously isDefault only ever got set implicitly (a tenant's first tab, or whatever tab
// deleteDashboardTabForTenant promotes when the current default is removed); there was no way
// for a user to explicitly pick a different tab as their own default. Atomic: clears every other
// of this user's own tabs' isDefault flag in the same statement, so exactly one stays true.
export async function setDefaultDashboardTabForTenant(user: TenantUser, id: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  // Verify the target exists BEFORE clearing every other tab's flag -- a bad id must never leave
  // this user with zero default tabs.
  const existsValues: unknown[] = [id, user.id];
  const existsClause = tenantClause(user, existsValues);
  const target = await queryOne<{ id: string }>(`select id from "DashboardTab" where id = $1 and "userId" = $2 and ${existsClause}`, existsValues);
  if (!target) throw new Error("DASHBOARD_TAB_NOT_FOUND");

  const clearValues: unknown[] = [new Date().toISOString(), user.id];
  const clearClause = tenantClause(user, clearValues);
  await execute(`update "DashboardTab" set "isDefault" = false, "updatedAt" = $1 where "userId" = $2 and ${clearClause}`, clearValues);
  const setValues: unknown[] = [new Date().toISOString(), id, user.id];
  const setClause = tenantClause(user, setValues);
  const row = await queryOne<any>(
    `update "DashboardTab" set "isDefault" = true, "updatedAt" = $1 where id = $2 and "userId" = $3 and ${setClause} returning ${TAB_COLUMNS}`,
    setValues,
  );
  if (!row) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  return row;
}

export async function reorderDashboardTabsForTenant(user: TenantUser, orderedIds: string[]) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  for (let index = 0; index < orderedIds.length; index += 1) {
    const values: unknown[] = [index, orderedIds[index], user.id];
    const clause = tenantClause(user, values);
    await execute(`update "DashboardTab" set "order" = $1 where id = $2 and "userId" = $3 and ${clause}`, values);
  }
  return listDashboardTabsForTenant(user);
}

// Deleting a tab reassigns its widgets to another of the user's remaining tabs (preferring the
// existing default) rather than leaving them tab-less -- a user must always have at least one
// tab, so the very last one can't be deleted at all.
export async function deleteDashboardTabForTenant(user: TenantUser, id: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const tabs = await listDashboardTabsForTenant(user);
  const target = tabs.find((tab) => tab.id === id);
  if (!target) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  const remaining = tabs.filter((tab) => tab.id !== id);
  if (remaining.length === 0) throw new Error("CANNOT_DELETE_LAST_TAB");

  const replacement = remaining.find((tab) => tab.isDefault) ?? remaining[0];

  const reassignValues: unknown[] = [replacement.id, id, user.id];
  const reassignClause = tenantClause(user, reassignValues);
  await execute(`update "DashboardWidget" set "tabId" = $1 where "tabId" = $2 and "userId" = $3 and ${reassignClause}`, reassignValues);

  const deleteValues: unknown[] = [id, user.id];
  const deleteClause = tenantClause(user, deleteValues);
  await execute(`delete from "DashboardTab" where id = $1 and "userId" = $2 and ${deleteClause}`, deleteValues);

  if (target.isDefault && !replacement.isDefault) {
    const promoteValues: unknown[] = [new Date().toISOString(), replacement.id, user.id];
    const promoteClause = tenantClause(user, promoteValues);
    await execute(`update "DashboardTab" set "isDefault" = true, "updatedAt" = $1 where id = $2 and "userId" = $3 and ${promoteClause}`, promoteValues);
  }

  return listDashboardTabsForTenant(user);
}

type LayoutSnapshotEntry = { widgetId: string; tabId: string | null; layout: { x: number; y: number; w: number; h: number } };

export async function listDashboardLayoutSnapshotsForTenant(user: TenantUser) {
  const values: unknown[] = [user.id];
  const clause = tenantClause(user, values);
  return query<any>(
    `select id, name, snapshot, "createdAt"
     from "DashboardLayoutSnapshot"
     where "userId" = $1 and ${clause}
     order by "createdAt" desc`,
    values,
  );
}

// Gap checklist Module 17, item 4 ("saved dashboard states"). Deliberately narrow: a snapshot
// captures tab assignment + grid position for every widget the saving user currently owns --
// never a widget's data-source config, and never another user's shared widgets (those aren't
// this user's to snapshot or restore).
export async function saveDashboardLayoutSnapshotForTenant(user: TenantUser, name: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const trimmed = name.trim();
  if (!trimmed) throw new Error("SNAPSHOT_NAME_REQUIRED");

  const widgetValues: unknown[] = [user.id];
  const widgetClause = tenantClause(user, widgetValues);
  const widgets = await query<any>(
    `select id, "tabId", w, h, x, y from "DashboardWidget" where "userId" = $1 and ${widgetClause}`,
    widgetValues,
  );
  const snapshot: LayoutSnapshotEntry[] = widgets.map((widget) => ({
    widgetId: widget.id,
    tabId: widget.tabId,
    layout: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
  }));

  const now = new Date().toISOString();
  const values: unknown[] = [randomUUID(), user.tenantId, user.id, trimmed, jsonbParam(snapshot), now];
  const row = await queryOne<any>(
    `insert into "DashboardLayoutSnapshot" (id, "tenantId", "userId", name, snapshot, "createdAt")
     values ($1, $2, $3, $4, $5, $6)
     on conflict ("tenantId", "userId", name)
     do update set snapshot = excluded.snapshot, "createdAt" = excluded."createdAt"
     returning id, name, snapshot, "createdAt"`,
    values,
  );
  if (!row) throw new Error("SNAPSHOT_SAVE_FAILED");
  return row;
}

export async function restoreDashboardLayoutSnapshotForTenant(user: TenantUser, id: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const values: unknown[] = [id, user.id];
  const clause = tenantClause(user, values);
  const row = await queryOne<any>(
    `select snapshot from "DashboardLayoutSnapshot" where id = $1 and "userId" = $2 and ${clause}`,
    values,
  );
  if (!row) throw new Error("SNAPSHOT_NOT_FOUND");

  const entries: LayoutSnapshotEntry[] = Array.isArray(row.snapshot) ? row.snapshot : [];
  let restored = 0;
  let skipped = 0;
  for (const entry of entries) {
    const updateValues: unknown[] = [
      entry.tabId,
      entry.layout?.x ?? 0,
      entry.layout?.y ?? 0,
      entry.layout?.w ?? 4,
      entry.layout?.h ?? 3,
      new Date().toISOString(),
      entry.widgetId,
      user.id,
    ];
    const updateClause = tenantClause(user, updateValues);
    const affected = await execute(
      `update "DashboardWidget"
       set "tabId" = $1, x = $2, y = $3, w = $4, h = $5, "updatedAt" = $6
       where id = $7 and "userId" = $8 and ${updateClause}`,
      updateValues,
    );
    if (affected > 0) restored += 1;
    else skipped += 1;
  }
  return { restored, skipped };
}

export async function deleteDashboardLayoutSnapshotForTenant(user: TenantUser, id: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const values: unknown[] = [id, user.id];
  const clause = tenantClause(user, values);
  await execute(`delete from "DashboardLayoutSnapshot" where id = $1 and "userId" = $2 and ${clause}`, values);
}

// --- Dashboard versioning (gap checklist Module 17, "dashboard/report versioning") ---
// A "dashboard" here is a DashboardTab -- there is no separate Dashboard entity. Per explicit
// user direction, a version snapshots the tab's own name AND the full definition (not just
// position, unlike DashboardLayoutSnapshot above) of every widget currently on it.

type TabWidgetSnapshotEntry = {
  id: string; title: string; type: string; config: Record<string, unknown>;
  w: number; h: number; x: number; y: number;
  visibility: string; sharedWithTeamId: string | null;
};
type TabSnapshot = { tab: { name: string }; widgets: TabWidgetSnapshotEntry[] };

async function getOwnedTab(user: TenantUser, tabId: string) {
  const values: unknown[] = [tabId, user.id];
  const clause = tenantClause(user, values);
  return queryOne<any>(`select ${TAB_COLUMNS} from "DashboardTab" where id = $1 and "userId" = $2 and ${clause}`, values);
}

// Edit-mode draft (decision 29): layout changes and removals, kept until Publish. Only the
// owner's own widgets on this tab (or, on the default tab, ones with no tab) can be in it.
type TabDraft = { layouts: Record<string, { x: number; y: number; w: number; h: number }>; removed: string[] };

async function ownedWidgetIdsOnTab(user: TenantUser, tab: { id: string; isDefault?: boolean }) {
  const values: unknown[] = [tab.id, user.id];
  const clause = tenantClause(user, values);
  const rows = await query<{ id: string }>(
    `select id from "DashboardWidget" where "userId" = $2 and ${clause} and ("tabId" = $1${tab.isDefault ? ' or "tabId" is null' : ""})`,
    values,
  );
  return new Set(rows.map((row) => row.id));
}

export async function saveDashboardTabDraftForTenant(user: TenantUser, tabId: string, input: unknown) {
  const tab = await getOwnedTab(user, tabId);
  if (!tab) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  const owned = await ownedWidgetIdsOnTab(user, tab);
  const raw = (input && typeof input === "object" ? input : {}) as Partial<TabDraft>;
  const layouts: TabDraft["layouts"] = {};
  for (const [id, layout] of Object.entries(raw.layouts ?? {})) {
    if (!owned.has(id) || !layout) continue;
    const box = { x: Number(layout.x), y: Number(layout.y), w: Number(layout.w), h: Number(layout.h) };
    if (Object.values(box).every((value) => Number.isFinite(value) && value >= 0)) layouts[id] = box;
  }
  const removed = [...new Set((raw.removed ?? []).filter((id) => owned.has(String(id))).map(String))];
  const empty = !Object.keys(layouts).length && !removed.length;
  const values: unknown[] = [empty ? null : jsonbParam({ layouts, removed }), empty ? null : new Date().toISOString(), tabId, user.id];
  const clause = tenantClause(user, values);
  return queryOne<any>(`update "DashboardTab" set draft = $1, "draftUpdatedAt" = $2 where id = $3 and "userId" = $4 and ${clause} returning ${TAB_COLUMNS}`, values);
}

export async function discardDashboardTabDraftForTenant(user: TenantUser, tabId: string) {
  return saveDashboardTabDraftForTenant(user, tabId, {});
}

// Publish applies the draft (layouts, removals) to the widgets, then records the tab as the next
// version.
export async function publishDashboardTabVersion(user: TenantUser, tabId: string, publishNotes?: string | null) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const tab = await getOwnedTab(user, tabId);
  if (!tab) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  if (tab.draft) {
    const draft = tab.draft as TabDraft;
    const owned = await ownedWidgetIdsOnTab(user, tab);
    const now = new Date().toISOString();
    for (const [id, box] of Object.entries(draft.layouts ?? {})) {
      if (!owned.has(id) || (draft.removed ?? []).includes(id)) continue;
      const values: unknown[] = [box.x, box.y, box.w, box.h, now, id, user.id];
      await execute(`update "DashboardWidget" set x = $1, y = $2, w = $3, h = $4, "updatedAt" = $5 where id = $6 and "userId" = $7 and ${tenantClause(user, values)}`, values);
    }
    for (const id of draft.removed ?? []) {
      if (!owned.has(id)) continue;
      const values: unknown[] = [id, user.id];
      await execute(`delete from "DashboardWidget" where id = $1 and "userId" = $2 and ${tenantClause(user, values)}`, values);
    }
    const clearValues: unknown[] = [tabId, user.id];
    await execute(`update "DashboardTab" set draft = null, "draftUpdatedAt" = null where id = $1 and "userId" = $2 and ${tenantClause(user, clearValues)}`, clearValues);
  }

  const widgetValues: unknown[] = [tabId, user.id];
  const widgetClause = tenantClause(user, widgetValues);
  const widgets = await query<any>(
    `select id, title, type, config, w, h, x, y, visibility, "sharedWithTeamId"
     from "DashboardWidget" where "tabId" = $1 and "userId" = $2 and ${widgetClause}`,
    widgetValues,
  );
  const snapshot: TabSnapshot = { tab: { name: tab.name }, widgets };

  const version = Number(tab.currentVersion ?? 0) + 1;
  const now = new Date().toISOString();
  await execute(
    `insert into "DashboardTabVersion" (id, "tenantId", "tabId", version, snapshot, "publishNotes", "publishedBy", "publishedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), user.tenantId, tabId, version, snapshot, publishNotes ?? null, user.id, now],
  );
  const updateValues: unknown[] = [version, now, tabId, user.id];
  const updateClause = tenantClause(user, updateValues);
  const data = await queryOne<any>(
    `update "DashboardTab" set "currentVersion" = $1, "updatedAt" = $2 where id = $3 and "userId" = $4 and ${updateClause} returning ${TAB_COLUMNS}`,
    updateValues,
  );
  if (!data) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  return data;
}

export async function listDashboardTabVersions(user: TenantUser, tabId: string) {
  const tab = await getOwnedTab(user, tabId);
  if (!tab) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  const values: unknown[] = [tabId];
  const clause = tenantClause(user, values);
  return query<any>(
    `select id, version, "publishNotes", "publishedBy", "publishedAt" from "DashboardTabVersion"
     where "tabId" = $1 and ${clause} order by version desc`,
    values,
  );
}

// Restoring doesn't rewind "currentVersion" -- DashboardTabVersion has a unique("tabId",
// "version") constraint, and versions published after N still exist, so reusing an old number
// would collide the next time this tab is published again. Instead this applies version N's
// snapshot to the live tab/widgets and publishes it again as a new version at the tip (matching
// restoreJourneyVersion's own precedent exactly). Widgets referenced by the snapshot that no
// longer exist are skipped -- never re-created -- same "additive, never destructive" precedent
// DashboardLayoutSnapshot's own restore already established; widgets added to the tab since the
// snapshot was taken are left untouched, never deleted.
export async function restoreDashboardTabVersion(user: TenantUser, tabId: string, version: number) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const tab = await getOwnedTab(user, tabId);
  if (!tab) throw new Error("DASHBOARD_TAB_NOT_FOUND");

  const versionValues: unknown[] = [tabId, version];
  const versionClause = tenantClause(user, versionValues);
  const versionRow = await queryOne<any>(
    `select snapshot from "DashboardTabVersion" where "tabId" = $1 and version = $2 and ${versionClause} limit 1`,
    versionValues,
  );
  if (!versionRow) throw new Error("DASHBOARD_TAB_VERSION_NOT_FOUND");

  const snapshot: TabSnapshot = versionRow.snapshot ?? { tab: { name: tab.name }, widgets: [] };
  if (snapshot.tab?.name) {
    const renameValues: unknown[] = [snapshot.tab.name, new Date().toISOString(), tabId, user.id];
    const renameClause = tenantClause(user, renameValues);
    await execute(`update "DashboardTab" set name = $1, "updatedAt" = $2 where id = $3 and "userId" = $4 and ${renameClause}`, renameValues);
  }

  let restored = 0;
  let skipped = 0;
  for (const widget of snapshot.widgets ?? []) {
    const widgetValues: unknown[] = [
      widget.title, widget.type, widget.config ?? {}, widget.w, widget.h, widget.x, widget.y,
      widget.visibility ?? "PRIVATE", widget.sharedWithTeamId ?? null, new Date().toISOString(), widget.id, user.id,
    ];
    const widgetClause = tenantClause(user, widgetValues);
    const affected = await execute(
      `update "DashboardWidget"
       set title = $1, type = $2, config = $3, w = $4, h = $5, x = $6, y = $7, visibility = $8, "sharedWithTeamId" = $9, "updatedAt" = $10
       where id = $11 and "userId" = $12 and ${widgetClause}`,
      widgetValues,
    );
    if (affected > 0) restored += 1;
    else skipped += 1;
  }

  await publishDashboardTabVersion(user, tabId, `Restored from version ${version}`);
  return { restored, skipped, version: (await getOwnedTab(user, tabId))?.currentVersion };
}

// Clone doesn't carry over version history -- a clone is a fresh starting point (currentVersion
// resets to 0), not a branch of the source tab's own published lineage.
export async function cloneDashboardTabForTenant(user: TenantUser, tabId: string, newName: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("TAB_NAME_REQUIRED");
  const source = await getOwnedTab(user, tabId);
  if (!source) throw new Error("DASHBOARD_TAB_NOT_FOUND");

  const widgetValues: unknown[] = [tabId, user.id];
  const widgetClause = tenantClause(user, widgetValues);
  const widgets = await query<any>(
    `select title, type, config, w, h, x, y, visibility, "sharedWithTeamId"
     from "DashboardWidget" where "tabId" = $1 and "userId" = $2 and ${widgetClause}`,
    widgetValues,
  );

  const existing = await listDashboardTabsForTenant(user);
  const nextOrder = existing.reduce((max, tab) => Math.max(max, tab.order), -1) + 1;
  const now = new Date().toISOString();
  const newTab = await queryOne<any>(
    `insert into "DashboardTab" (id, "tenantId", "userId", name, "order", "isDefault", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, false, $6, $6)
     returning ${TAB_COLUMNS}`,
    [randomUUID(), user.tenantId, user.id, trimmed, nextOrder, now],
  );
  if (!newTab) throw new Error("DASHBOARD_TAB_INSERT_FAILED");

  for (const widget of widgets) {
    await execute(
      `insert into "DashboardWidget"
        (id, "tenantId", "userId", title, type, config, w, h, x, y, visibility, "sharedWithTeamId", "tabId", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [
        randomUUID(), user.tenantId, user.id, widget.title, widget.type, widget.config ?? {},
        widget.w, widget.h, widget.x, widget.y, widget.visibility ?? "PRIVATE", widget.sharedWithTeamId ?? null,
        newTab.id, now,
      ],
    );
  }
  return newTab;
}

// Owner transfer -- gated to the tab's current owner or a tenant admin. Reassigns the tab AND
// every widget on it (a tab with no widgets left behind would strand them under the old owner
// with no tab of their own to render under). DashboardTab has a unique("tenantId", "userId",
// name) constraint -- if the new owner already has a tab with this same name, the transfer is
// refused with a clear error rather than silently renaming either side.
export async function transferDashboardTabOwnerForTenant(user: TenantUser, tabId: string, newOwnerUserId: string) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const tenant = user.tenantId;
  if (!tenant) throw new Error("TENANT_CONTEXT_REQUIRED");
  const tabValues: unknown[] = [tabId, tenant];
  const isAdmin = Boolean(user.isPlatformAdmin || user.isTenantAdmin);
  const tab = isAdmin
    ? await queryOne<any>(`select ${TAB_COLUMNS}, "userId" from "DashboardTab" where id = $1 and "tenantId" = $2`, tabValues)
    : await getOwnedTab(user, tabId);
  if (!tab) throw new Error("DASHBOARD_TAB_NOT_FOUND");

  const newOwner = await queryOne<any>(`select id from "User" where id = $1 and "tenantId" = $2`, [newOwnerUserId, tenant]);
  if (!newOwner) throw new Error("DASHBOARD_TAB_TRANSFER_TARGET_NOT_FOUND");

  const conflict = await queryOne<any>(
    `select id from "DashboardTab" where "tenantId" = $1 and "userId" = $2 and name = $3 and id <> $4`,
    [tenant, newOwnerUserId, tab.name, tabId],
  );
  if (conflict) throw new Error("DASHBOARD_TAB_TRANSFER_NAME_CONFLICT");

  const now = new Date().toISOString();
  await execute(`update "DashboardWidget" set "userId" = $1, "updatedAt" = $2 where "tabId" = $3 and "tenantId" = $4`, [newOwnerUserId, now, tabId, tenant]);
  const updated = await queryOne<any>(
    `update "DashboardTab" set "userId" = $1, "updatedAt" = $2 where id = $3 and "tenantId" = $4 returning ${TAB_COLUMNS}`,
    [newOwnerUserId, now, tabId, tenant],
  );
  if (!updated) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  return updated;
}

// Deprecation workflow -- mirrors the semantic metric layer's own certificationStatus/
// deprecationStatus shape (Metric, migration 0088): a badge/status flag, not a hiding mechanism.
// A deprecated tab still renders normally; it just carries a visible "Deprecated" marker so
// viewers know it's no longer the maintained version of that dashboard.
export async function setDashboardTabDeprecationForTenant(
  user: TenantUser,
  tabId: string,
  status: "ACTIVE" | "DEPRECATED",
  reason?: string | null,
) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  if (!["ACTIVE", "DEPRECATED"].includes(status)) throw new Error("Invalid deprecationStatus");
  const tenant = user.tenantId;
  if (!tenant) throw new Error("TENANT_CONTEXT_REQUIRED");
  const isAdmin = Boolean(user.isPlatformAdmin || user.isTenantAdmin);
  const now = new Date().toISOString();
  const values: unknown[] = [status, status === "DEPRECATED" ? reason ?? null : null, status === "DEPRECATED" ? now : null, now, tabId, tenant];
  const ownerClause = isAdmin ? "" : (values.push(user.id), `and "userId" = $${values.length} `);
  const row = await queryOne<any>(
    `update "DashboardTab"
     set "deprecationStatus" = $1, "deprecatedReason" = $2, "deprecatedAt" = $3, "updatedAt" = $4
     where id = $5 and "tenantId" = $6 ${ownerClause}
     returning ${TAB_COLUMNS}`,
    values,
  );
  if (!row) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  return row;
}

// Usage metrics -- fire-and-forget, called when a user actually switches to a tab, not on every
// render, mirroring recordSavedViewOpened's own established "real usage, not poll noise" precedent.
export async function recordDashboardTabOpened(user: TenantUser, tabId: string) {
  if (!user.tenantId) return;
  await execute(
    `update "DashboardTab" set "viewCount" = "viewCount" + 1, "lastOpenedAt" = $1 where id = $2 and "userId" = $3 and "tenantId" = $4`,
    [new Date().toISOString(), tabId, user.id, user.tenantId],
  );
}

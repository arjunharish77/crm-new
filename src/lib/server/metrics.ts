import { randomUUID } from "crypto";
import { execute, query, queryOne, queryAsSystem, jsonbParam } from "@/lib/db/query";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import {
  MetricAggregation,
  MetricQueryDefinition,
  MetricQueryResult,
  ReportObject,
  ReportOperator,
  executeMetricQueryForTenant,
  validateMetricQueryDefinition,
} from "@/lib/server/reporting-query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
  isTenantAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

// Dual-gated permissions (gap checklist Module 17, item 2): this "metrics" role-module
// permission gates who can create metrics and who can certify/deprecate them -- a separate
// concern from `visibility`/`sharedWithTeamId` below, which gates who can *view* an already-
// created metric (mirroring DashboardWidget's sharing model from this module's earlier pass).
// "certify"/"deprecate" are manage-only, same shape as assertJourneyPermission's own governance-
// weight actions (approve/launch/pause/overrideSuppression) -- deliberately not reachable via
// "update", since certifying a metric is a data-governance act, not a definition edit.
export type MetricPermissionAction = "view" | "create" | "edit" | "delete" | "certify" | "deprecate";

export function assertMetricPermission(user: TenantUser, action: MetricPermissionAction) {
  if (user.isPlatformAdmin || user.isTenantAdmin) return;
  const permissions = user.role && typeof user.role === "object" ? (user.role as any).permissions : null;
  const metrics = permissions?.modules?.metrics;
  if (metrics === "full") return;
  if (metrics && typeof metrics === "object") {
    if (action === "view" && (metrics.read || metrics.manage)) return;
    if (action === "create" && (metrics.create || metrics.manage)) return;
    if (action === "edit" && (metrics.update || metrics.manage)) return;
    if (action === "delete" && (metrics.delete || metrics.manage)) return;
    if ((action === "certify" || action === "deprecate") && metrics.manage) return;
  }
  throw new Error("FORBIDDEN");
}

type MetricFieldRef = { object: ReportObject; field: string };
type MetricFilterInput = { object: ReportObject; field: string; operator?: ReportOperator; value?: string | number | boolean | null };

export type MetricGrain = "DAILY" | "WEEKLY" | "MONTHLY";

export type MetricInput = {
  name: string;
  description?: string | null;
  root: MetricQueryDefinition["root"];
  aggregation: MetricAggregation;
  aggregateField?: MetricFieldRef | null;
  filters?: MetricFilterInput[];
  groupBy?: MetricFieldRef | null;
  visibility?: "PRIVATE" | "TEAM" | "TENANT";
  sharedWithTeamId?: string | null;
  // Gap checklist Module 17 (semantic metric layer's "grain" sub-item, previously not built).
  // null (the default) keeps computing live over the full dataset, unchanged. A non-null grain
  // requires no groupBy -- same "a grouped metric has no single scalar value" rule
  // calculated-metrics.ts already established for chaining metrics.
  grain?: MetricGrain | null;
};

export type MetricGovernanceInput = {
  certificationStatus?: "UNCERTIFIED" | "CERTIFIED";
  deprecationStatus?: "ACTIVE" | "DEPRECATED";
  deprecatedReason?: string | null;
};

const METRIC_COLUMNS = `id, name, description, root, aggregation, "aggregateObject", "aggregateField", filters,
  "groupByObject", "groupByField", "ownerId", "certificationStatus", "certifiedBy", "certifiedAt",
  "deprecationStatus", "deprecatedReason", "deprecatedAt", visibility, "sharedWithTeamId", grain, "createdBy", "createdAt", "updatedAt"`;

function formatMetricRecord(record: any) {
  return {
    id: record.id as string,
    name: record.name as string,
    description: (record.description ?? null) as string | null,
    root: record.root as MetricQueryDefinition["root"],
    aggregation: record.aggregation as MetricAggregation,
    aggregateField: record.aggregateObject && record.aggregateField
      ? { object: record.aggregateObject as ReportObject, field: record.aggregateField as string }
      : null,
    filters: (Array.isArray(record.filters) ? record.filters : []) as MetricFilterInput[],
    groupBy: record.groupByObject && record.groupByField
      ? { object: record.groupByObject as ReportObject, field: record.groupByField as string }
      : null,
    ownerId: (record.ownerId ?? null) as string | null,
    certificationStatus: record.certificationStatus as "UNCERTIFIED" | "CERTIFIED",
    certifiedBy: (record.certifiedBy ?? null) as string | null,
    certifiedAt: (record.certifiedAt ?? null) as string | null,
    deprecationStatus: record.deprecationStatus as "ACTIVE" | "DEPRECATED",
    deprecatedReason: (record.deprecatedReason ?? null) as string | null,
    deprecatedAt: (record.deprecatedAt ?? null) as string | null,
    visibility: record.visibility as "PRIVATE" | "TEAM" | "TENANT",
    sharedWithTeamId: (record.sharedWithTeamId ?? null) as string | null,
    grain: (record.grain ?? null) as MetricGrain | null,
    isOwner: record.__viewerId === undefined ? true : record.ownerId === record.__viewerId,
    createdBy: (record.createdBy ?? null) as string | null,
    createdAt: record.createdAt as string,
    updatedAt: record.updatedAt as string,
  };
}

// Builds the "tenantId" WHERE clause and appends its value (only when one exists) to `values`,
// rather than relying on a caller-computed placeholder index -- a pre-existing sibling pattern
// (tenantWhere in reports-dashboards-postgres.ts) hardcodes its start index, which silently
// breaks (wrong param count) for a null-tenantId caller in at least one of its own call sites;
// building the clause alongside the values array it binds to avoids that class of bug here.
function appendTenantClause(user: TenantUser, values: unknown[]): string {
  if (!user.tenantId) return '"tenantId" is null';
  values.push(user.tenantId);
  return `"tenantId" = $${values.length}`;
}

export async function listMetricsForTenant(user: TenantUser) {
  assertMetricPermission(user, "view");
  const values: unknown[] = [user.id];
  const tenantClause = appendTenantClause(user, values);
  const rows = await query<any>(
    `select ${METRIC_COLUMNS}
     from "Metric"
     where ${tenantClause}
       and (
         "ownerId" = $1
         or visibility = 'TENANT'
         or (visibility = 'TEAM' and "sharedWithTeamId" = (select "teamId" from "User" where id::text = $1))
       )
     order by name asc`,
    values,
  );
  return rows.map((row) => formatMetricRecord({ ...row, __viewerId: user.id }));
}

export async function getMetricForTenant(user: TenantUser, id: string) {
  assertMetricPermission(user, "view");
  const values: unknown[] = [id, user.id];
  const tenantClause = appendTenantClause(user, values);
  const row = await queryOne<any>(
    `select ${METRIC_COLUMNS}
     from "Metric"
     where id = $1 and ${tenantClause}
       and (
         "ownerId" = $2
         or visibility = 'TENANT'
         or (visibility = 'TEAM' and "sharedWithTeamId" = (select "teamId" from "User" where id::text = $2))
       )
     limit 1`,
    values,
  );
  return row ? formatMetricRecord({ ...row, __viewerId: user.id }) : null;
}

function validateGrain(grain: MetricGrain | null | undefined, hasGroupBy: boolean) {
  if (grain === undefined || grain === null) return null;
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(grain)) throw new Error(`Unsupported grain: ${grain}`);
  if (hasGroupBy) throw new Error("A metric with a group-by dimension can't have a grain -- it has no single scalar value to track over time");
  return grain;
}

export async function createMetricForTenant(user: TenantUser, input: MetricInput) {
  assertMetricPermission(user, "create");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  if (!input.name?.trim()) throw new Error("METRIC_NAME_REQUIRED");
  const validated = validateMetricQueryDefinition({
    root: input.root,
    aggregation: input.aggregation,
    aggregateField: input.aggregateField ?? null,
    filters: input.filters ?? [],
    groupBy: input.groupBy ?? null,
  });
  const grain = validateGrain(input.grain, Boolean(validated.groupBy));
  const visibility = input.visibility ?? "PRIVATE";
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "Metric"
      (id, "tenantId", name, description, root, aggregation, "aggregateObject", "aggregateField", filters,
       "groupByObject", "groupByField", "ownerId", visibility, "sharedWithTeamId", grain, "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
     returning ${METRIC_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      input.name.trim(),
      input.description ?? null,
      validated.root,
      validated.aggregation,
      validated.aggregateField?.object ?? null,
      validated.aggregateField?.field ?? null,
      jsonbParam(validated.filters), // a bare array would be sent as a Postgres array literal
      validated.groupBy?.object ?? null,
      validated.groupBy?.field ?? null,
      user.id,
      visibility,
      visibility === "TEAM" ? input.sharedWithTeamId ?? null : null,
      grain,
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("METRIC_INSERT_FAILED");
  return formatMetricRecord({ ...row, __viewerId: user.id });
}

export async function updateMetricDefinitionForTenant(user: TenantUser, id: string, input: Partial<MetricInput>) {
  assertMetricPermission(user, "edit");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("METRIC_NAME_REQUIRED");
    patch.name = input.name.trim();
  }
  if (input.description !== undefined) patch.description = input.description;

  const definitionChanged = input.root !== undefined || input.aggregation !== undefined ||
    input.aggregateField !== undefined || input.filters !== undefined || input.groupBy !== undefined;
  let effectiveGroupBy: MetricFieldRef | null = null;
  let existing: Awaited<ReturnType<typeof getMetricForTenant>> = null;
  if (definitionChanged || input.grain !== undefined) {
    // Existing.edit permission was already asserted above; this internal fetch only needs to
    // resolve the current definition, so it goes through the same visibility-scoped getter --
    // it will correctly 404 if this user can't see the row at all (owner check happens below,
    // at the actual update statement).
    existing = await getMetricForTenant(user, id);
    if (!existing) throw new Error("METRIC_NOT_FOUND");
  }
  if (definitionChanged) {
    const validated = validateMetricQueryDefinition({
      root: input.root ?? existing!.root,
      aggregation: input.aggregation ?? existing!.aggregation,
      aggregateField: input.aggregateField !== undefined ? input.aggregateField : existing!.aggregateField,
      filters: input.filters !== undefined ? input.filters : existing!.filters,
      groupBy: input.groupBy !== undefined ? input.groupBy : existing!.groupBy,
    });
    patch.root = validated.root;
    patch.aggregation = validated.aggregation;
    patch.aggregateObject = validated.aggregateField?.object ?? null;
    patch.aggregateField = validated.aggregateField?.field ?? null;
    patch.filters = jsonbParam(validated.filters); // see the insert above
    patch.groupByObject = validated.groupBy?.object ?? null;
    patch.groupByField = validated.groupBy?.field ?? null;
    effectiveGroupBy = validated.groupBy;
  } else if (existing) {
    effectiveGroupBy = existing.groupBy;
  }
  if (input.grain !== undefined) {
    patch.grain = validateGrain(input.grain, Boolean(effectiveGroupBy));
  } else if (definitionChanged && effectiveGroupBy && existing?.grain) {
    // Adding a group-by dimension to a metric that already tracks a grain would leave it in an
    // inconsistent state (a grouped metric has no single scalar to store per period) -- require
    // clearing grain explicitly in the same request rather than silently dropping it.
    throw new Error("This metric already has a grain -- clear it before adding a group-by dimension");
  }
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility;
    patch.sharedWithTeamId = input.visibility === "TEAM" ? input.sharedWithTeamId ?? null : null;
  }

  const columns = Object.keys(patch);
  const values: unknown[] = columns.map((column) => patch[column]);
  values.push(id, user.id);
  const idPosition = columns.length + 1;
  const ownerPosition = columns.length + 2;
  const tenantClause = appendTenantClause(user, values);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  // Edit stays owner-only regardless of visibility, mirroring DashboardWidget's own edit/delete
  // convention -- sharing (visibility) only ever widens who can VIEW, never who can change a
  // definition. Certifying/deprecating someone else's metric is the one non-owner exception,
  // and it's a separate function (setMetricGovernanceForTenant) for exactly that reason.
  const row = await queryOne<any>(
    `update "Metric"
     set ${assignments}
     where id = $${idPosition} and "ownerId" = $${ownerPosition} and ${tenantClause}
     returning ${METRIC_COLUMNS}`,
    values,
  );
  if (!row) throw new Error("METRIC_NOT_FOUND");
  return formatMetricRecord({ ...row, __viewerId: user.id });
}

export async function setMetricGovernanceForTenant(user: TenantUser, id: string, input: MetricGovernanceInput) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updatedAt: now };

  if (input.certificationStatus !== undefined) {
    assertMetricPermission(user, "certify");
    if (!["UNCERTIFIED", "CERTIFIED"].includes(input.certificationStatus)) throw new Error("Invalid certificationStatus");
    patch.certificationStatus = input.certificationStatus;
    patch.certifiedBy = input.certificationStatus === "CERTIFIED" ? user.id : null;
    patch.certifiedAt = input.certificationStatus === "CERTIFIED" ? now : null;
  }
  if (input.deprecationStatus !== undefined) {
    assertMetricPermission(user, "deprecate");
    if (!["ACTIVE", "DEPRECATED"].includes(input.deprecationStatus)) throw new Error("Invalid deprecationStatus");
    patch.deprecationStatus = input.deprecationStatus;
    patch.deprecatedReason = input.deprecationStatus === "DEPRECATED" ? input.deprecatedReason ?? null : null;
    patch.deprecatedAt = input.deprecationStatus === "DEPRECATED" ? now : null;
  }
  if (Object.keys(patch).length <= 1) throw new Error("No governance fields provided");

  const columns = Object.keys(patch);
  const values: unknown[] = columns.map((column) => patch[column]);
  values.push(id);
  const idPosition = columns.length + 1;
  const tenantClause = appendTenantClause(user, values);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  // Deliberately NOT owner-scoped: a data steward with the "manage" module permission can
  // certify or deprecate any metric in the tenant, not just their own -- the whole point of a
  // certification workflow is that someone other than the author vouches for it.
  const row = await queryOne<any>(
    `update "Metric"
     set ${assignments}
     where id = $${idPosition} and ${tenantClause}
     returning ${METRIC_COLUMNS}`,
    values,
  );
  if (!row) throw new Error("METRIC_NOT_FOUND");
  return formatMetricRecord({ ...row, __viewerId: user.id });
}

export async function deleteMetricForTenant(user: TenantUser, id: string) {
  assertMetricPermission(user, "delete");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const values: unknown[] = [id, user.id];
  const tenantClause = appendTenantClause(user, values);
  await execute(`delete from "Metric" where id = $1 and "ownerId" = $2 and ${tenantClause}`, values);
}

export async function getMetricValueForTenant(user: TenantUser, id: string): Promise<MetricQueryResult> {
  const metric = await getMetricForTenant(user, id);
  if (!metric) throw new Error("METRIC_NOT_FOUND");
  return executeMetricQueryForTenant(user, {
    root: metric.root,
    aggregation: metric.aggregation,
    aggregateField: metric.aggregateField,
    filters: metric.filters,
    groupBy: metric.groupBy,
  });
}

// --- Metric grain (gap checklist Module 17's semantic metric layer, "grain" sub-item) ---
// Stores one snapshot per completed period in the pre-existing, previously-unreferenced
// "DailyMetric" table (tenantId, date, metric, value, dimensions jsonb), always keyed by the
// period's own START date regardless of grain -- a WEEKLY metric's row is dated to that week's
// Monday, a MONTHLY metric's to the 1st of that month -- so callers reading the series don't
// need to know which grain produced a given row.

// UTC arithmetic throughout, matching this codebase's own established anomaly-detection/
// forecast fix: this dev environment's local timezone is UTC+5:30, and local-time Date methods
// (setHours/setDate) would silently shift bucketed calendar days by up to 24 hours relative to
// Postgres's own UTC date_trunc.
function resolveLastCompletedPeriod(grain: MetricGrain, now = new Date()) {
  if (grain === "DAILY") {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 1);
    return { periodDate: start.toISOString().slice(0, 10), start, end };
  }
  if (grain === "WEEKLY") {
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const isoDayOfWeek = todayUtc.getUTCDay() === 0 ? 7 : todayUtc.getUTCDay(); // Monday=1..Sunday=7
    const thisMonday = new Date(todayUtc);
    thisMonday.setUTCDate(thisMonday.getUTCDate() - (isoDayOfWeek - 1));
    const start = new Date(thisMonday);
    start.setUTCDate(start.getUTCDate() - 7);
    const end = thisMonday;
    return { periodDate: start.toISOString().slice(0, 10), start, end };
  }
  // MONTHLY
  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() - 1, 1));
  const end = thisMonthStart;
  return { periodDate: start.toISOString().slice(0, 10), start, end };
}

// System-context worker job -- no real requesting user exists, mirroring
// refreshCaseAnalyticsSnapshots's own `{ id: "system", tenantId } as TenantUser` precedent
// (inbuilt-reports.ts) for exactly the same reason: a scheduled background scan across every
// tenant's metrics, not a single tenant-scoped request.
// WP07 (F04): BACKGROUND_JOB, disposition B -- see the module comment above; this is exactly
// the recurring cross-tenant sweep it describes.
export async function computeDueMetricGrainSnapshots(limit = 200) {
  const metrics = await queryAsSystem<any>(
    `select id, "tenantId", root, aggregation, "aggregateObject", "aggregateField", filters, grain
     from "Metric" where grain is not null and "groupByObject" is null limit $1`,
    [limit],
  );

  let computed = 0;
  let skipped = 0;
  for (const metric of metrics) {
    try {
      const period = resolveLastCompletedPeriod(metric.grain as MetricGrain);
      const existingSnapshot = await queryOne<{ id: string }>(
        `select id from "DailyMetric" where "tenantId" = $1 and date = $2 and metric = $3 and dimensions = '{}'::jsonb limit 1`,
        [metric.tenantId, period.periodDate, metric.id],
      );
      if (existingSnapshot) {
        skipped += 1;
        continue;
      }

      const systemUser = { id: "system", tenantId: metric.tenantId, isPlatformAdmin: true } as TenantUser;
      const filters = [
        ...(Array.isArray(metric.filters) ? metric.filters : []),
        { object: metric.root as ReportObject, field: "createdAt", operator: "gte" as const, value: period.start.toISOString() },
        { object: metric.root as ReportObject, field: "createdAt", operator: "less_than" as const, value: period.end.toISOString() },
      ];
      const result = await executeMetricQueryForTenant(systemUser, {
        root: metric.root,
        aggregation: metric.aggregation,
        aggregateField: metric.aggregateObject && metric.aggregateField
          ? { object: metric.aggregateObject as ReportObject, field: metric.aggregateField }
          : null,
        filters,
        groupBy: null,
      });
      const value = typeof result.value === "number" ? result.value : 0;
      const now = new Date().toISOString();
      await execute(
        `insert into "DailyMetric" (id, "tenantId", date, metric, value, dimensions, "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, '{}'::jsonb, $6, $6)
         on conflict ("tenantId", date, metric, dimensions) do update set value = excluded.value, "updatedAt" = excluded."updatedAt"`,
        [randomUUID(), metric.tenantId, period.periodDate, metric.id, value, now],
      );
      computed += 1;
    } catch {
      // One metric's snapshot failing (e.g. its tenant has advancedReporting disabled since the
      // metric was created) shouldn't block every other metric in the same batch.
      skipped += 1;
    }
  }
  return { computed, skipped };
}

export async function getMetricGrainSeriesForTenant(user: TenantUser, id: string, limit = 30) {
  const metric = await getMetricForTenant(user, id);
  if (!metric) throw new Error("METRIC_NOT_FOUND");
  if (!metric.grain) return { grain: null, series: [] };
  const rows = await query<{ date: string; value: number }>(
    `select date, value from "DailyMetric"
     where "tenantId" = $1 and metric = $2 and dimensions = '{}'::jsonb
     order by date desc
     limit $3`,
    [user.tenantId, id, limit],
  );
  return { grain: metric.grain, series: rows.reverse() };
}

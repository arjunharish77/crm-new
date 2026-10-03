import { randomUUID } from "crypto";
import { execute, query, queryOne, jsonbParam } from "@/lib/db/query";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { assertMetricPermission, getMetricForTenant, getMetricValueForTenant } from "@/lib/server/metrics";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
  isTenantAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

// Gap checklist Module 17, item 16 ("custom calculated fields/measures"). Per explicit user
// direction: simple fixed-operator math chaining already-defined metrics only -- no free-text
// formulas, no expression parser. Reuses the metric layer's own permission model
// (`assertMetricPermission`) rather than inventing a second one, since this is explicitly an
// extension of that layer, not a separate feature area.
export type CalculatedMetricOperator = "+" | "-" | "*" | "/";

export type CalculatedMetricStepInput = { metricId: string; operator: CalculatedMetricOperator | null };

export type CalculatedMetricInput = {
  name: string;
  description?: string | null;
  steps: CalculatedMetricStepInput[];
  visibility?: "PRIVATE" | "TEAM" | "TENANT";
  sharedWithTeamId?: string | null;
};

const CALCULATED_METRIC_COLUMNS = `id, name, description, steps, "ownerId", visibility, "sharedWithTeamId", "createdBy", "createdAt", "updatedAt"`;

function formatCalculatedMetricRecord(record: any) {
  return {
    id: record.id as string,
    name: record.name as string,
    description: (record.description ?? null) as string | null,
    steps: (Array.isArray(record.steps) ? record.steps : []) as CalculatedMetricStepInput[],
    ownerId: (record.ownerId ?? null) as string | null,
    visibility: record.visibility as "PRIVATE" | "TEAM" | "TENANT",
    sharedWithTeamId: (record.sharedWithTeamId ?? null) as string | null,
    isOwner: record.__viewerId === undefined ? true : record.ownerId === record.__viewerId,
    createdBy: (record.createdBy ?? null) as string | null,
    createdAt: record.createdAt as string,
    updatedAt: record.updatedAt as string,
  };
}

function appendTenantClause(user: TenantUser, values: unknown[]): string {
  if (!user.tenantId) return '"tenantId" is null';
  values.push(user.tenantId);
  return `"tenantId" = $${values.length}`;
}

// Validates each step references a real, visible metric with a scalar (non-grouped) value --
// a metric with a groupBy dimension produces a set of grouped values, not one number, so there's
// no well-defined way to chain it arithmetically with another metric's value.
async function validateSteps(user: TenantUser, steps: CalculatedMetricStepInput[]) {
  if (!Array.isArray(steps) || steps.length < 2) throw new Error("A calculated metric needs at least 2 steps");
  if (steps[0]?.operator !== null && steps[0]?.operator !== undefined) throw new Error("The first step must not have an operator");
  for (const step of steps.slice(1)) {
    if (!["+", "-", "*", "/"].includes(step.operator as string)) throw new Error(`Unsupported operator: ${step.operator}`);
  }
  for (const step of steps) {
    if (!step.metricId) throw new Error("Every step needs a metricId");
    const metric = await getMetricForTenant(user, step.metricId);
    if (!metric) throw new Error(`Metric not found or not visible: ${step.metricId}`);
    if (metric.groupBy) throw new Error(`Metric "${metric.name}" has a group-by dimension and can't be used in a calculated field (its value isn't a single number)`);
  }
  return steps.map((step) => ({ metricId: step.metricId, operator: step.operator ?? null }));
}

export async function listCalculatedMetricsForTenant(user: TenantUser) {
  assertMetricPermission(user, "view");
  const values: unknown[] = [user.id];
  const clause = appendTenantClause(user, values);
  const rows = await query<any>(
    `select ${CALCULATED_METRIC_COLUMNS}
     from "CalculatedMetric"
     where ${clause}
       and (
         "ownerId" = $1
         or visibility = 'TENANT'
         or (visibility = 'TEAM' and "sharedWithTeamId" = (select "teamId" from "User" where id::text = $1))
       )
     order by name asc`,
    values,
  );
  return rows.map((row) => formatCalculatedMetricRecord({ ...row, __viewerId: user.id }));
}

export async function getCalculatedMetricForTenant(user: TenantUser, id: string) {
  assertMetricPermission(user, "view");
  const values: unknown[] = [id, user.id];
  const clause = appendTenantClause(user, values);
  const row = await queryOne<any>(
    `select ${CALCULATED_METRIC_COLUMNS}
     from "CalculatedMetric"
     where id = $1 and ${clause}
       and (
         "ownerId" = $2
         or visibility = 'TENANT'
         or (visibility = 'TEAM' and "sharedWithTeamId" = (select "teamId" from "User" where id::text = $2))
       )
     limit 1`,
    values,
  );
  return row ? formatCalculatedMetricRecord({ ...row, __viewerId: user.id }) : null;
}

export async function createCalculatedMetricForTenant(user: TenantUser, input: CalculatedMetricInput) {
  assertMetricPermission(user, "create");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  if (!input.name?.trim()) throw new Error("CALCULATED_METRIC_NAME_REQUIRED");
  const steps = await validateSteps(user, input.steps ?? []);
  const visibility = input.visibility ?? "PRIVATE";
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CalculatedMetric"
      (id, "tenantId", name, description, steps, "ownerId", visibility, "sharedWithTeamId", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     returning ${CALCULATED_METRIC_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      input.name.trim(),
      input.description ?? null,
      jsonbParam(steps), // a bare array would be sent as a Postgres array literal
      user.id,
      visibility,
      visibility === "TEAM" ? input.sharedWithTeamId ?? null : null,
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("CALCULATED_METRIC_INSERT_FAILED");
  return formatCalculatedMetricRecord({ ...row, __viewerId: user.id });
}

export async function updateCalculatedMetricForTenant(user: TenantUser, id: string, input: Partial<CalculatedMetricInput>) {
  assertMetricPermission(user, "edit");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("CALCULATED_METRIC_NAME_REQUIRED");
    patch.name = input.name.trim();
  }
  if (input.description !== undefined) patch.description = input.description;
  if (input.steps !== undefined) patch.steps = jsonbParam(await validateSteps(user, input.steps)); // see the insert above
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility;
    patch.sharedWithTeamId = input.visibility === "TEAM" ? input.sharedWithTeamId ?? null : null;
  }

  const columns = Object.keys(patch);
  const values: unknown[] = columns.map((column) => patch[column]);
  values.push(id, user.id);
  const idPosition = columns.length + 1;
  const ownerPosition = columns.length + 2;
  const clause = appendTenantClause(user, values);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  // Owner-only, matching Metric's own edit convention -- sharing only ever widens who can view.
  const row = await queryOne<any>(
    `update "CalculatedMetric"
     set ${assignments}
     where id = $${idPosition} and "ownerId" = $${ownerPosition} and ${clause}
     returning ${CALCULATED_METRIC_COLUMNS}`,
    values,
  );
  if (!row) throw new Error("CALCULATED_METRIC_NOT_FOUND");
  return formatCalculatedMetricRecord({ ...row, __viewerId: user.id });
}

export async function deleteCalculatedMetricForTenant(user: TenantUser, id: string) {
  assertMetricPermission(user, "delete");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const values: unknown[] = [id, user.id];
  const clause = appendTenantClause(user, values);
  await execute(`delete from "CalculatedMetric" where id = $1 and "ownerId" = $2 and ${clause}`, values);
}

function applyOperator(runningTotal: number, operator: CalculatedMetricOperator, value: number): number | null {
  if (operator === "+") return runningTotal + value;
  if (operator === "-") return runningTotal - value;
  if (operator === "*") return runningTotal * value;
  // Division by zero -> null (not a fabricated Infinity/NaN), matching this reporting stack's
  // own established convention (e.g. period-comparison's percentChange with a 0 baseline).
  return value === 0 ? null : runningTotal / value;
}

export async function getCalculatedMetricValueForTenant(user: TenantUser, id: string): Promise<{ value: number | null }> {
  const calculatedMetric = await getCalculatedMetricForTenant(user, id);
  if (!calculatedMetric) throw new Error("CALCULATED_METRIC_NOT_FOUND");

  let runningTotal: number | null = null;
  for (const step of calculatedMetric.steps) {
    const result = await getMetricValueForTenant(user, step.metricId);
    const stepValue = typeof result.value === "number" ? result.value : 0;
    if (runningTotal === null) {
      runningTotal = stepValue;
      continue;
    }
    if (!step.operator) throw new Error(`Missing operator for step referencing metric ${step.metricId}`);
    runningTotal = applyOperator(runningTotal, step.operator, stepValue);
    if (runningTotal === null) break; // division by zero -- no point continuing the chain
  }
  return { value: runningTotal };
}

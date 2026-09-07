import { query } from "@/lib/db/query";
import { assertFeatureEnabled } from "@/lib/server/entitlements";

export type ReportObject =
  | "lead"
  | "leadOwner"
  | "opportunity"
  | "opportunityOwner"
  | "stage"
  | "activity"
  | "activityType"
  | "activityCreator"
  | "assignmentLog"
  | "assignedTo"
  | "task"
  | "taskOwner"
  | "telephonyCall"
  | "telephonyAgent"
  | "case"
  | "caseType"
  | "caseStatus"
  | "casePriority"
  | "caseOwner"
  | "commissionLedger"
  | "partner"
  | "payout"
  | "communication"
  | "journeyEnrollment"
  | "recordScore"
  | "customField";

export type ReportOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "gte"
  | "lte"
  | "is_empty"
  | "is_not_empty";

export type ReportQueryDefinition = {
  root: "lead" | "opportunity" | "activity";
  savedViewId?: string | null;
  fields: Array<{
    object: ReportObject;
    field: string;
    label?: string;
  }>;
  filters?: Array<{
    object: ReportObject;
    field: string;
    operator?: ReportOperator;
    value?: string | number | boolean | null;
  }>;
  orderBy?: {
    object: ReportObject;
    field: string;
    direction?: "asc" | "desc";
  };
  limit?: number;
};

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  permissionTemplates?: any[];
  isPlatformAdmin?: boolean;
};

type ReportExecutionResult = {
  columns: Array<{ key: string; label: string; object: ReportObject; field: string }>;
  rows: Array<Record<string, unknown>>;
  meta: {
    root: ReportQueryDefinition["root"];
    totalRows: number;
    returnedRows: number;
    limit: number;
  };
};

type DataSets = {
  leads: any[];
  opportunities: any[];
  stages: any[];
  activities: any[];
  activityTypes: any[];
  users: any[];
  assignmentLogs: any[];
  tasks: any[];
  telephonyCalls: any[];
  cases: any[];
  caseTypes: any[];
  caseStatuses: any[];
  casePriorities: any[];
  commissionLedgers: any[];
  payouts: any[];
  communications: any[];
  journeyEnrollments: any[];
  recordScores: any[];
  customFieldValues: any[];
};

type JoinContext = Partial<Record<ReportObject, any>>;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

// Gap checklist Module 17, item 24 (analytics performance layer: "query timeout limits"). This
// is the one genuinely ad hoc, user-authored query surface in the reporting stack -- a user can
// pick several joined objects, fields, and filters, unlike the 19 fixed inbuilt reports. An
// application-level race, not a real Postgres `statement_timeout`/query cancellation: the
// underlying `fetchDataSets` calls keep running server-side after this rejects, but it bounds
// how long the caller actually waits, which is the practical goal here.
const REPORT_QUERY_TIMEOUT_MS = 15_000;

function withQueryTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("REPORT_QUERY_TIMEOUT")), ms)),
  ]);
}

const FIELD_CATALOG: Record<ReportObject, Set<string>> = {
  lead: new Set(["id", "name", "email", "phone", "company", "source", "status", "score", "tags", "createdBy", "ownerId", "createdAt", "updatedAt"]),
  leadOwner: new Set(["id", "name", "email", "managerId", "teamId"]),
  opportunity: new Set(["id", "leadId", "opportunityTypeId", "stageId", "title", "amount", "expectedCloseDate", "priority", "tags", "ownerId", "createdAt", "updatedAt"]),
  opportunityOwner: new Set(["id", "name", "email", "managerId", "teamId"]),
  stage: new Set(["id", "name", "order", "isWon", "isClosed"]),
  activity: new Set(["id", "typeId", "leadId", "opportunityId", "outcome", "notes", "dueAt", "completedAt", "slaStatus", "slaTarget", "createdBy", "createdAt", "updatedAt"]),
  activityType: new Set(["id", "name", "icon", "color", "defaultOutcome", "defaultSLA"]),
  activityCreator: new Set(["id", "name", "email", "managerId", "teamId"]),
  assignmentLog: new Set(["id", "entityType", "entityId", "assignedToId", "assignedById", "ruleId", "reason", "assignedAt"]),
  assignedTo: new Set(["id", "name", "email", "managerId", "teamId"]),
  task: new Set(["id", "title", "description", "status", "priority", "ownerId", "leadId", "opportunityId", "dueAt", "completedAt", "createdAt", "updatedAt"]),
  taskOwner: new Set(["id", "name", "email", "managerId", "teamId"]),
  telephonyCall: new Set(["id", "provider", "direction", "fromNumber", "toNumber", "status", "duration", "agentId", "leadId", "opportunityId", "startedAt", "endedAt", "createdAt"]),
  telephonyAgent: new Set(["id", "name", "email", "managerId", "teamId"]),
  case: new Set(["id", "caseNumber", "subject", "typeId", "statusId", "priorityId", "queueId", "ownerId", "leadId", "opportunityId", "firstResponseDueAt", "resolutionDueAt", "resolvedAt", "closedAt", "createdAt", "updatedAt"]),
  caseType: new Set(["id", "name", "order", "isActive"]),
  caseStatus: new Set(["id", "name", "category", "order", "isClosedStatus"]),
  casePriority: new Set(["id", "name", "level", "color"]),
  caseOwner: new Set(["id", "name", "email", "managerId", "teamId"]),
  // Gap checklist Module 17, item 2 ("dataset catalog" -- partners/payouts). Opportunity-only:
  // CommissionLedger has no leadId at all, partner association is only ever a fact about a won
  // Opportunity (same schema reality the funnel explorer's PARTNER dimension already relies on).
  commissionLedger: new Set(["id", "opportunityId", "partnerId", "entryType", "baseAmount", "commissionAmount", "triggerEvent", "createdAt"]),
  // Resolves to the plain User record (login identity), not the richer PartnerProfile (legal
  // business name) -- same shallow-satellite convention as taskOwner/telephonyAgent/caseOwner,
  // none of which join a second level deeper than User either.
  partner: new Set(["id", "name", "email", "managerId", "teamId"]),
  // Deliberately matched by PARTNER, not by record: Payout has no leadId/opportunityId column
  // at all (only partnerId + payoutCycleId) -- a payout aggregates a partner's commission across
  // many opportunities per cycle, it is not a per-opportunity fact. A matched payout row means
  // "this opportunity's resolved partner's most recent payout," not "this opportunity's payout."
  payout: new Set(["id", "payoutCycleId", "status", "totalCommissionAmount", "approvedAt", "paidAt", "createdAt"]),
  // Gap checklist Module 17, item 2 ("dataset catalog" -- communications). CommunicationOutbox's
  // entityType/entityId is a polymorphic reference (not a typed leadId/opportunityId column),
  // joined the same way AssignmentLog's own entityType/entityId already is.
  communication: new Set(["id", "channel", "status", "recipient", "subject", "sentAt", "createdAt"]),
  // Gap checklist Module 17, item 2 ("dataset catalog" -- journeys). Same polymorphic
  // recordType/recordId pattern as MarketingAttributionTouch/RecordScore.
  journeyEnrollment: new Set(["id", "journeyId", "status", "enrolledAt", "exitedAt", "exitReason"]),
  // Gap checklist Module 17, item 2 ("dataset catalog" -- scoring). RecordScore is unique on
  // (tenantId, recordType, recordId) -- a current-state row, not a history table, so no
  // "latest only" resolution logic is needed the way it would be for a real time series.
  recordScore: new Set(["id", "fitScore", "engagementScore", "conversionProbability", "winProbability", "stallRisk", "scoreBand", "confidence", "calculatedAt"]),
  // Gap checklist Module 17, item 2 ("dataset catalog" -- custom fields). Deliberately empty:
  // unlike every other object here, custom fields are a per-tenant dynamic set (each tenant
  // defines its own via FieldDefinition), not a fixed column list known at compile time --
  // `field.field` here is a FieldDefinition id, not a static column name, so this object is
  // special-cased in validateField rather than checked against a fixed Set. The tenant's actual
  // selectable custom fields are discovered via the existing `GET /custom-fields` endpoint, not
  // this static catalog (see getReportQueryCatalog, which deliberately omits this object).
  customField: new Set(),
};

const REQUIRED_JOIN_FIELDS: Record<ReportObject, string[]> = {
  lead: ["id", "ownerId"],
  leadOwner: ["id"],
  opportunity: ["id", "leadId", "stageId", "ownerId"],
  opportunityOwner: ["id"],
  stage: ["id"],
  activity: ["id", "leadId", "opportunityId", "typeId", "createdBy"],
  activityType: ["id"],
  activityCreator: ["id"],
  assignmentLog: ["id", "entityType", "entityId", "assignedToId"],
  assignedTo: ["id"],
  task: ["id", "leadId", "opportunityId", "ownerId"],
  taskOwner: ["id"],
  telephonyCall: ["id", "leadId", "opportunityId", "agentId"],
  telephonyAgent: ["id"],
  case: ["id", "leadId", "opportunityId", "typeId", "statusId", "priorityId", "ownerId"],
  caseType: ["id"],
  caseStatus: ["id"],
  casePriority: ["id"],
  caseOwner: ["id"],
  commissionLedger: ["id", "opportunityId", "partnerId"],
  partner: ["id"],
  payout: ["id", "partnerId"],
  communication: ["id", "entityType", "entityId"],
  journeyEnrollment: ["id", "recordType", "recordId"],
  recordScore: ["id", "recordType", "recordId"],
  customField: [],
};

const TABLE_BY_DATASET = {
  leads: "Lead",
  opportunities: "Opportunity",
  stages: "StageDefinition",
  activities: "Activity",
  activityTypes: "ActivityType",
  users: "User",
  assignmentLogs: "AssignmentLog",
  tasks: "Task",
  telephonyCalls: "TelephonyCallLog",
  cases: "Case",
  caseTypes: "CaseType",
  caseStatuses: "CaseStatus",
  casePriorities: "CasePriority",
  commissionLedgers: "CommissionLedger",
  payouts: "Payout",
  communications: "CommunicationOutbox",
  journeyEnrollments: "MarketingJourneyEnrollment",
  recordScores: "RecordScore",
  customFieldValues: "CustomFieldValue",
} as const;

export function getReportQueryCatalog() {
  // "customField" deliberately excluded -- its selectable fields are per-tenant dynamic
  // (FieldDefinition ids), discovered via the existing `GET /custom-fields` endpoint instead of
  // this static, compile-time-known catalog.
  return Object.fromEntries(
    Object.entries(FIELD_CATALOG)
      .filter(([object]) => object !== "customField")
      .map(([object, fields]) => [object, [...fields]])
  );
}

export async function executeReportQueryForTenant(
  user: TenantUser,
  definition: ReportQueryDefinition
): Promise<ReportExecutionResult> {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const normalized = normalizeDefinition(await applySavedViewSource(user, definition));
  const neededObjects = collectNeededObjects(normalized);
  const dataSets = await withQueryTimeout(fetchDataSets(user, normalized.root, neededObjects), REPORT_QUERY_TIMEOUT_MS);
  const contexts = buildJoinContexts(normalized.root, dataSets)
    .filter((context) => matchesFilters(context, normalized.filters ?? []));

  const sortedContexts = sortContexts(contexts, normalized.orderBy);
  const limitedContexts = sortedContexts.slice(0, normalized.limit);
  const columns = normalized.fields.map((field) => ({
    key: fieldKey(field.object, field.field),
    label: field.label || `${field.object}.${field.field}`,
    object: field.object,
    field: field.field,
  }));

  const rows = limitedContexts.map((context) => {
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      row[column.key] = context[column.object]?.[column.field] ?? null;
    }
    return row;
  });

  return {
    columns,
    rows,
    meta: {
      root: normalized.root,
      totalRows: contexts.length,
      returnedRows: rows.length,
      limit: normalized.limit,
    },
  };
}

// Gap checklist Module 17, item 2 (semantic metric layer). Deliberately reuses every private
// helper this file already has for the ad hoc query builder (fetchDataSets/buildJoinContexts/
// matchesFilters/validateField/dependenciesForObject) rather than a second join engine -- a
// metric is just "the query builder's join+filter pipeline, aggregated instead of returned as
// rows." This is also what makes the metric layer automatically generic against whatever
// FIELD_CATALOG already models (present or future objects, e.g. the Task/TelephonyCallLog/Case
// satellites added in the prior pass): nothing here hardcodes an object list.
export type MetricAggregation = "SUM" | "COUNT" | "AVG" | "MIN" | "MAX";

export type MetricQueryDefinition = {
  root: "lead" | "opportunity" | "activity";
  aggregation: MetricAggregation;
  // Required unless aggregation is COUNT, which counts matching join contexts, not a field.
  aggregateField?: { object: ReportObject; field: string } | null;
  filters?: ReportQueryDefinition["filters"];
  groupBy?: { object: ReportObject; field: string } | null;
};

export type MetricQueryResult =
  | { value: number; groups?: undefined }
  | { value?: undefined; groups: Array<{ key: string; label: string; value: number }> };

type ValidatedMetricQueryDefinition = {
  root: MetricQueryDefinition["root"];
  aggregation: MetricAggregation;
  aggregateField: { object: ReportObject; field: string } | null;
  filters: Required<ReportQueryDefinition>["filters"];
  groupBy: { object: ReportObject; field: string } | null;
};

// Pure validation, no DB access -- reused by the metric-definition CRUD layer (metrics.ts) to
// reject an invalid object/field/aggregation/filter combination at save time, before it's ever
// persisted, without paying for a full fetchDataSets round trip just to validate.
export function validateMetricQueryDefinition(definition: MetricQueryDefinition): ValidatedMetricQueryDefinition {
  if (!["lead", "opportunity", "activity"].includes(definition.root)) {
    throw new Error("Unsupported metric root");
  }
  if (!["SUM", "COUNT", "AVG", "MIN", "MAX"].includes(definition.aggregation)) {
    throw new Error(`Unsupported aggregation: ${definition.aggregation}`);
  }
  if (definition.aggregation !== "COUNT" && !definition.aggregateField) {
    throw new Error("aggregateField is required unless aggregation is COUNT");
  }

  const aggregateField = definition.aggregateField
    ? validateField(definition.aggregateField.object, definition.aggregateField.field)
    : null;
  const filters = (definition.filters ?? []).map((filter) => {
    const field = validateField(filter.object, filter.field);
    const operator = filter.operator ?? "equals";
    if (!isOperator(operator)) throw new Error(`Unsupported filter operator: ${operator}`);
    return { ...field, operator, value: filter.value ?? null };
  });
  const groupBy = definition.groupBy ? validateField(definition.groupBy.object, definition.groupBy.field) : null;

  return { root: definition.root, aggregation: definition.aggregation, aggregateField, filters, groupBy };
}

export async function executeMetricQueryForTenant(user: TenantUser, definition: MetricQueryDefinition): Promise<MetricQueryResult> {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });

  const { root, aggregation, aggregateField, filters, groupBy } = validateMetricQueryDefinition(definition);

  const neededObjects = new Set<ReportObject>([root]);
  if (aggregateField) neededObjects.add(aggregateField.object);
  for (const filter of filters) neededObjects.add(filter.object);
  if (groupBy) neededObjects.add(groupBy.object);
  for (const object of [...neededObjects]) {
    for (const required of dependenciesForObject(object)) neededObjects.add(required);
  }

  const dataSets = await withQueryTimeout(fetchDataSets(user, root, neededObjects), REPORT_QUERY_TIMEOUT_MS);
  const contexts = buildJoinContexts(root, dataSets).filter((context) => matchesFilters(context, filters));

  const valueOf = (context: JoinContext) =>
    aggregateField ? Number(context[aggregateField.object]?.[aggregateField.field]) : null;

  if (!groupBy) {
    const values = contexts.map(valueOf).filter((value) => aggregateField ? Number.isFinite(value) : true);
    return { value: aggregateValues(aggregation, contexts.length, values as number[]) };
  }

  const groupedCounts = new Map<string, number>();
  const groupedValues = new Map<string, number[]>();
  for (const context of contexts) {
    const rawKey = context[groupBy.object]?.[groupBy.field];
    const key = rawKey === null || rawKey === undefined || rawKey === "" ? "(none)" : String(rawKey);
    groupedCounts.set(key, (groupedCounts.get(key) ?? 0) + 1);
    if (!aggregateField) continue;
    const value = valueOf(context);
    if (!Number.isFinite(value)) continue;
    const bucket = groupedValues.get(key) ?? [];
    bucket.push(value as number);
    groupedValues.set(key, bucket);
  }

  const groups = [...groupedCounts.entries()].map(([key, count]) => ({
    key,
    label: key,
    value: aggregateValues(aggregation, count, groupedValues.get(key) ?? []),
  }));
  return { groups };
}

// Gap checklist Module 17's chart-library expansion, "pivot table" sub-item. Deliberately reuses
// the semantic metric layer's own object/field/aggregation model rather than a second query
// definition shape: a pivot's row dimension is a Metric's own (already-validated, already-
// existing) `groupBy`, and this adds exactly one more group-by dimension (the column axis) on
// top of it -- the smallest real extension of the existing self-service authoring model, not a
// new OLAP-cube feature. Reuses `fetchDataSets`/`buildJoinContexts`/`matchesFilters` unchanged,
// the same private helpers `executeMetricQueryForTenant` already reuses, so this is generic
// against whatever `FIELD_CATALOG` models with zero pivot-specific join code.
export type PivotQueryDefinition = {
  root: MetricQueryDefinition["root"];
  aggregation: MetricAggregation;
  aggregateField?: { object: ReportObject; field: string } | null;
  filters?: ReportQueryDefinition["filters"];
  rowGroupBy: { object: ReportObject; field: string };
  columnGroupBy: { object: ReportObject; field: string };
};

export type PivotQueryResult = { rowLabels: string[]; columnLabels: string[]; cells: Record<string, Record<string, number>> };

export async function executePivotQueryForTenant(user: TenantUser, definition: PivotQueryDefinition): Promise<PivotQueryResult> {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });

  if (!["lead", "opportunity", "activity"].includes(definition.root)) throw new Error("Unsupported metric root");
  if (!["SUM", "COUNT", "AVG", "MIN", "MAX"].includes(definition.aggregation)) {
    throw new Error(`Unsupported aggregation: ${definition.aggregation}`);
  }
  if (definition.aggregation !== "COUNT" && !definition.aggregateField) {
    throw new Error("aggregateField is required unless aggregation is COUNT");
  }

  const aggregateField = definition.aggregateField ? validateField(definition.aggregateField.object, definition.aggregateField.field) : null;
  const filters = (definition.filters ?? []).map((filter) => {
    const field = validateField(filter.object, filter.field);
    const operator = filter.operator ?? "equals";
    if (!isOperator(operator)) throw new Error(`Unsupported filter operator: ${operator}`);
    return { ...field, operator, value: filter.value ?? null };
  });
  const rowGroupBy = validateField(definition.rowGroupBy.object, definition.rowGroupBy.field);
  const columnGroupBy = validateField(definition.columnGroupBy.object, definition.columnGroupBy.field);

  const neededObjects = new Set<ReportObject>([definition.root, rowGroupBy.object, columnGroupBy.object]);
  if (aggregateField) neededObjects.add(aggregateField.object);
  for (const filter of filters) neededObjects.add(filter.object);
  for (const object of [...neededObjects]) {
    for (const required of dependenciesForObject(object)) neededObjects.add(required);
  }

  const dataSets = await withQueryTimeout(fetchDataSets(user, definition.root, neededObjects), REPORT_QUERY_TIMEOUT_MS);
  const contexts = buildJoinContexts(definition.root, dataSets).filter((context) => matchesFilters(context, filters));

  const valueOf = (context: JoinContext) =>
    aggregateField ? Number(context[aggregateField.object]?.[aggregateField.field]) : null;
  const labelOf = (context: JoinContext, ref: { object: ReportObject; field: string }) => {
    const raw = context[ref.object]?.[ref.field];
    return raw === null || raw === undefined || raw === "" ? "(none)" : String(raw);
  };

  const cellCounts = new Map<string, Map<string, number>>();
  const cellValues = new Map<string, Map<string, number[]>>();
  const rowLabels: string[] = [];
  const columnLabels: string[] = [];
  for (const context of contexts) {
    const rowKey = labelOf(context, rowGroupBy);
    const columnKey = labelOf(context, columnGroupBy);
    if (!rowLabels.includes(rowKey)) rowLabels.push(rowKey);
    if (!columnLabels.includes(columnKey)) columnLabels.push(columnKey);

    if (!cellCounts.has(rowKey)) cellCounts.set(rowKey, new Map());
    const rowCounts = cellCounts.get(rowKey)!;
    rowCounts.set(columnKey, (rowCounts.get(columnKey) ?? 0) + 1);

    if (!aggregateField) continue;
    const value = valueOf(context);
    if (!Number.isFinite(value)) continue;
    if (!cellValues.has(rowKey)) cellValues.set(rowKey, new Map());
    const rowValues = cellValues.get(rowKey)!;
    const bucket = rowValues.get(columnKey) ?? [];
    bucket.push(value as number);
    rowValues.set(columnKey, bucket);
  }

  const cells: Record<string, Record<string, number>> = {};
  for (const rowKey of rowLabels) {
    cells[rowKey] = {};
    for (const columnKey of columnLabels) {
      const count = cellCounts.get(rowKey)?.get(columnKey) ?? 0;
      const values = cellValues.get(rowKey)?.get(columnKey) ?? [];
      cells[rowKey][columnKey] = aggregateValues(definition.aggregation, count, values);
    }
  }

  return { rowLabels, columnLabels, cells };
}

function aggregateValues(aggregation: MetricAggregation, contextCount: number, values: number[]): number {
  if (aggregation === "COUNT") return contextCount;
  if (!values.length) return 0;
  if (aggregation === "SUM") return values.reduce((total, value) => total + value, 0);
  if (aggregation === "AVG") return values.reduce((total, value) => total + value, 0) / values.length;
  if (aggregation === "MIN") return Math.min(...values);
  return Math.max(...values);
}

async function applySavedViewSource(user: TenantUser, definition: ReportQueryDefinition): Promise<ReportQueryDefinition> {
  if (!definition.savedViewId || !user.tenantId) return definition;
  const row = await query<any>(
    `select config from "CustomReport"
     where id = $1 and "tenantId" = $2 and "chartType" = 'SAVED_VIEW'
     limit 1`,
    [definition.savedViewId, user.tenantId],
  );
  const config = row[0]?.config ?? null;
  const tabs = Array.isArray(config?.tabs) ? config.tabs : [];
  const rootModule = definition.root === "lead" ? "LEADS" : definition.root === "opportunity" ? "OPPORTUNITIES" : "ACTIVITIES";
  const tab = tabs.find((item: any) => String(item.module).toUpperCase() === rootModule) ?? tabs[0];
  const conditions = Array.isArray(tab?.filters?.conditions) ? tab.filters.conditions : [];
  const convertedFilters = conditions.flatMap((condition: any) => {
    const field = String(condition.field ?? "");
    if (!FIELD_CATALOG[definition.root].has(field)) return [];
    const operator = normalizeViewOperator(condition.operator);
    if (!operator) return [];
    return [{
      object: definition.root,
      field,
      operator,
      value: condition.value ?? null,
    }];
  });
  if (!convertedFilters.length) return definition;
  return {
    ...definition,
    filters: [...(definition.filters ?? []), ...convertedFilters],
  };
}

function normalizeViewOperator(operator: string): ReportOperator | null {
  if (operator === "greater_than_or_equal") return "gte";
  if (operator === "less_than_or_equal") return "lte";
  if (["equals", "not_equals", "contains", "greater_than", "less_than", "is_empty", "is_not_empty"].includes(operator)) {
    return operator as ReportOperator;
  }
  return null;
}

function normalizeDefinition(definition: ReportQueryDefinition): Required<ReportQueryDefinition> {
  if (!definition || typeof definition !== "object") {
    throw new Error("Report query definition is required");
  }

  if (!["lead", "opportunity", "activity"].includes(definition.root)) {
    throw new Error("Unsupported report root");
  }

  if (!Array.isArray(definition.fields) || definition.fields.length === 0) {
    throw new Error("At least one report field is required");
  }

  const fields = definition.fields.map((field) => validateField(field.object, field.field, field.label));
  const filters = (definition.filters ?? []).map((filter) => {
    const field = validateField(filter.object, filter.field);
    const operator = filter.operator ?? "equals";
    if (!isOperator(operator)) throw new Error(`Unsupported filter operator: ${operator}`);
    return { ...field, operator, value: filter.value ?? null };
  });

  const orderBy = definition.orderBy
    ? {
      ...validateField(definition.orderBy.object, definition.orderBy.field),
      direction: definition.orderBy.direction === "asc" ? "asc" as const : "desc" as const,
    }
    : { object: fields[0].object, field: fields[0].field, direction: "asc" as const };

  return {
    root: definition.root,
    savedViewId: definition.savedViewId ?? null,
    fields,
    filters,
    orderBy,
    limit: Math.min(Math.max(Number(definition.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT),
  };
}

function validateField(object: ReportObject, field: string, label?: string) {
  // "customField"'s `field` is a FieldDefinition id (per-tenant dynamic), not a static column
  // name from FIELD_CATALOG -- real tenant-scoping/existence is enforced where it's actually
  // fetched (fetchTenantRowsPostgres's tenantId-scoped query), same security boundary every
  // other object here already relies on, just without a fixed allow-list to check against first.
  if (object === "customField") {
    if (!field || typeof field !== "string") throw new Error(`Unsupported report field: ${object}.${field}`);
    return { object, field, label };
  }
  if (!FIELD_CATALOG[object]?.has(field)) {
    throw new Error(`Unsupported report field: ${object}.${field}`);
  }
  return { object, field, label };
}

function isOperator(operator: string): operator is ReportOperator {
  return ["equals", "not_equals", "contains", "greater_than", "less_than", "gte", "lte", "is_empty", "is_not_empty"].includes(operator);
}

function collectNeededObjects(definition: Required<ReportQueryDefinition>) {
  const objects = new Set<ReportObject>([definition.root]);
  for (const item of [...definition.fields, ...definition.filters]) objects.add(item.object);
  if (definition.orderBy) objects.add(definition.orderBy.object);

  for (const object of [...objects]) {
    for (const required of dependenciesForObject(object)) objects.add(required);
  }

  return objects;
}

function dependenciesForObject(object: ReportObject): ReportObject[] {
  if (object === "leadOwner") return ["lead"];
  if (object === "opportunityOwner") return ["opportunity"];
  if (object === "stage") return ["opportunity"];
  if (object === "activityType") return ["activity"];
  if (object === "activityCreator") return ["activity"];
  if (object === "assignedTo") return ["assignmentLog"];
  if (object === "taskOwner") return ["task"];
  if (object === "telephonyAgent") return ["telephonyCall"];
  if (object === "caseType") return ["case"];
  if (object === "caseStatus") return ["case"];
  if (object === "casePriority") return ["case"];
  if (object === "caseOwner") return ["case"];
  if (object === "partner") return ["commissionLedger"];
  if (object === "payout") return ["commissionLedger"];
  return [];
}

async function fetchDataSets(user: TenantUser, root: ReportQueryDefinition["root"], neededObjects: Set<ReportObject>): Promise<DataSets> {
  const ownScoped = isOwnScoped(user);
  const needLeads = neededObjects.has("lead") || neededObjects.has("leadOwner") || root === "lead";
  const needOpportunities = neededObjects.has("opportunity") || neededObjects.has("opportunityOwner") || neededObjects.has("stage") || root === "opportunity";
  const needActivities = neededObjects.has("activity") || neededObjects.has("activityType") || neededObjects.has("activityCreator") || root === "activity";
  const needAssignmentLogs = neededObjects.has("assignmentLog") || neededObjects.has("assignedTo");
  const needTasks = neededObjects.has("task") || neededObjects.has("taskOwner");
  const needTelephonyCalls = neededObjects.has("telephonyCall") || neededObjects.has("telephonyAgent");
  const needCases = neededObjects.has("case") || neededObjects.has("caseType") || neededObjects.has("caseStatus") ||
    neededObjects.has("casePriority") || neededObjects.has("caseOwner");
  const needCommissionLedgers = neededObjects.has("commissionLedger") || neededObjects.has("partner") || neededObjects.has("payout");
  const needPayouts = neededObjects.has("payout");
  const needCommunications = neededObjects.has("communication");
  const needJourneyEnrollments = neededObjects.has("journeyEnrollment");
  const needRecordScores = neededObjects.has("recordScore");
  const needCustomFieldValues = neededObjects.has("customField");

  const [
    leads, opportunities, activities, stages, activityTypes, users, assignmentLogs,
    tasks, telephonyCalls, cases, caseTypes, caseStatuses, casePriorities,
    commissionLedgers, payouts, communications, journeyEnrollments, recordScores, customFieldValues,
  ] = await Promise.all([
    needLeads ? fetchTenantRowsPostgres(user, "leads", ownScoped ? { ownerId: user.id } : null) : [],
    needOpportunities ? fetchTenantRowsPostgres(user, "opportunities", ownScoped ? { ownerId: user.id } : null) : [],
    needActivities ? fetchTenantRowsPostgres(user, "activities", null) : [],
    neededObjects.has("stage") ? fetchTenantRowsPostgres(user, "stages", null) : [],
    neededObjects.has("activityType") ? fetchTenantRowsPostgres(user, "activityTypes", null) : [],
    needsUsers(neededObjects) ? fetchTenantRowsPostgres(user, "users", null) : [],
    needAssignmentLogs ? fetchTenantRowsPostgres(user, "assignmentLogs", null) : [],
    needTasks ? fetchTenantRowsPostgres(user, "tasks", null) : [],
    needTelephonyCalls ? fetchTenantRowsPostgres(user, "telephonyCalls", null) : [],
    needCases ? fetchTenantRowsPostgres(user, "cases", null) : [],
    neededObjects.has("caseType") ? fetchTenantRowsPostgres(user, "caseTypes", null) : [],
    neededObjects.has("caseStatus") ? fetchTenantRowsPostgres(user, "caseStatuses", null) : [],
    neededObjects.has("casePriority") ? fetchTenantRowsPostgres(user, "casePriorities", null) : [],
    needCommissionLedgers ? fetchTenantRowsPostgres(user, "commissionLedgers", null) : [],
    needPayouts ? fetchTenantRowsPostgres(user, "payouts", null) : [],
    needCommunications ? fetchTenantRowsPostgres(user, "communications", null) : [],
    needJourneyEnrollments ? fetchTenantRowsPostgres(user, "journeyEnrollments", null) : [],
    needRecordScores ? fetchTenantRowsPostgres(user, "recordScores", null) : [],
    needCustomFieldValues ? fetchTenantRowsPostgres(user, "customFieldValues", null) : [],
  ]);

  const leadIds = new Set(leads.map((lead: any) => lead.id));
  const opportunityIds = new Set(opportunities.map((opportunity: any) => opportunity.id));
  const scopedActivities = ownScoped
    ? activities.filter((activity: any) =>
      activity.createdBy === user.id ||
      (activity.leadId && leadIds.has(activity.leadId)) ||
      (activity.opportunityId && opportunityIds.has(activity.opportunityId))
    )
    : activities;
  const scopedAssignmentLogs = ownScoped
    ? assignmentLogs.filter((log: any) =>
      log.assignedToId === user.id ||
      (log.entityType === "LEAD" && leadIds.has(log.entityId)) ||
      (log.entityType === "OPPORTUNITY" && opportunityIds.has(log.entityId))
    )
    : assignmentLogs;
  const scopedTasks = ownScoped
    ? tasks.filter((task: any) =>
      task.ownerId === user.id ||
      (task.leadId && leadIds.has(task.leadId)) ||
      (task.opportunityId && opportunityIds.has(task.opportunityId))
    )
    : tasks;
  const scopedTelephonyCalls = ownScoped
    ? telephonyCalls.filter((call: any) =>
      call.agentId === user.id ||
      (call.leadId && leadIds.has(call.leadId)) ||
      (call.opportunityId && opportunityIds.has(call.opportunityId))
    )
    : telephonyCalls;
  const scopedCases = ownScoped
    ? cases.filter((caseRow: any) =>
      caseRow.ownerId === user.id ||
      (caseRow.leadId && leadIds.has(caseRow.leadId)) ||
      (caseRow.opportunityId && opportunityIds.has(caseRow.opportunityId))
    )
    : cases;
  const scopedCommissionLedgers = ownScoped
    ? commissionLedgers.filter((entry: any) => entry.partnerId === user.id || (entry.opportunityId && opportunityIds.has(entry.opportunityId)))
    : commissionLedgers;
  // Payout has no lead/opportunity link at all (only partnerId) -- own-scoping is purely
  // "is this my own payout," matching the object's own "matched by partner" join semantics.
  const scopedPayouts = ownScoped ? payouts.filter((payout: any) => payout.partnerId === user.id) : payouts;
  const scopedCommunications = ownScoped
    ? communications.filter((row: any) =>
      (row.entityType === "LEAD" && leadIds.has(row.entityId)) ||
      (row.entityType === "OPPORTUNITY" && opportunityIds.has(row.entityId))
    )
    : communications;
  const scopedJourneyEnrollments = ownScoped
    ? journeyEnrollments.filter((row: any) =>
      (row.recordType === "LEAD" && leadIds.has(row.recordId)) ||
      (row.recordType === "OPPORTUNITY" && opportunityIds.has(row.recordId))
    )
    : journeyEnrollments;
  const scopedRecordScores = ownScoped
    ? recordScores.filter((row: any) =>
      (row.recordType === "LEAD" && leadIds.has(row.recordId)) ||
      (row.recordType === "OPPORTUNITY" && opportunityIds.has(row.recordId))
    )
    : recordScores;
  // CustomFieldValue has no recordType of its own -- recordId is scoped by simply checking it
  // against whichever of the (already tenant/owner-scoped) lead or opportunity id sets matches.
  const scopedCustomFieldValues = ownScoped
    ? customFieldValues.filter((row: any) => leadIds.has(row.recordId) || opportunityIds.has(row.recordId))
    : customFieldValues;

  return {
    leads: leads.map((row: any) => maskFieldsForUser(user, "leads", row)),
    opportunities: opportunities.map((row: any) => maskFieldsForUser(user, "opportunities", row)),
    stages,
    activities: scopedActivities.map((row: any) => maskFieldsForUser(user, "activities", row)),
    activityTypes,
    users,
    assignmentLogs: scopedAssignmentLogs,
    tasks: scopedTasks,
    telephonyCalls: scopedTelephonyCalls,
    cases: scopedCases,
    caseTypes,
    caseStatuses,
    casePriorities,
    commissionLedgers: scopedCommissionLedgers,
    payouts: scopedPayouts,
    communications: scopedCommunications,
    journeyEnrollments: scopedJourneyEnrollments,
    recordScores: scopedRecordScores,
    customFieldValues: scopedCustomFieldValues,
  };
}

const SQL_SELECT_BY_DATASET = {
  leads: 'id, name, email, phone, company, source, status, score, tags, "createdBy", "createdAt", "updatedAt", "ownerId"',
  opportunities: 'id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, amount, "expectedCloseDate", priority, tags, "ownerId", "createdAt", "updatedAt"',
  stages: 'id, name, "order", "isWon", "isClosed", "tenantId"',
  activities: 'id, "tenantId", "typeId", "leadId", "opportunityId", outcome, notes, "dueAt", "completedAt", "slaStatus", "slaTarget", "createdBy", "createdAt", "updatedAt"',
  activityTypes: 'id, name, icon, color, "defaultOutcome", "defaultSLA", "tenantId"',
  users: 'id, name, email, "managerId", "teamId", "tenantId"',
  assignmentLogs: 'id, "tenantId", "entityType", "entityId", "assignedToId", "assignedById", "ruleId", reason, "assignedAt"',
  tasks: 'id, "tenantId", title, description, status, priority, "ownerId", "leadId", "opportunityId", "dueAt", "completedAt", "createdAt", "updatedAt"',
  telephonyCalls: 'id, "tenantId", provider, direction, "fromNumber", "toNumber", status, duration, "agentId", "leadId", "opportunityId", "startedAt", "endedAt", "createdAt"',
  // Case's FK columns are named relatedLeadId/relatedOpportunityId (not leadId/opportunityId like
  // every other joinable object here) -- aliased on select so the in-memory join code below can
  // treat "case" the same way it treats task/telephonyCall.
  cases: 'id, "tenantId", "caseNumber", subject, "typeId", "statusId", "priorityId", "queueId", "ownerId", "relatedLeadId" as "leadId", "relatedOpportunityId" as "opportunityId", "firstResponseDueAt", "resolutionDueAt", "resolvedAt", "closedAt", "createdAt", "updatedAt"',
  caseTypes: 'id, "tenantId", name, "order", "isActive"',
  caseStatuses: 'id, "tenantId", name, category, "order", "isClosedStatus"',
  casePriorities: 'id, "tenantId", name, level, color',
  commissionLedgers: 'id, "tenantId", "opportunityId", "partnerId", "entryType", "baseAmount", "commissionAmount", "triggerEvent", "createdAt"',
  // "partnerId" is fetched even though it's not in payout's own FIELD_CATALOG -- it's the join
  // key the "payout" satellite is matched by (via commissionLedger.partnerId), not a
  // user-selectable field on payout itself.
  payouts: 'id, "tenantId", "partnerId", "payoutCycleId", status, "totalCommissionAmount", "approvedAt", "paidAt", "createdAt"',
  communications: 'id, "tenantId", channel, status, recipient, subject, "sentAt", "entityType", "entityId", "createdAt"',
  journeyEnrollments: 'id, "tenantId", "journeyId", "recordType", "recordId", status, "enrolledAt", "exitedAt", "exitReason"',
  recordScores: 'id, "tenantId", "recordType", "recordId", "fitScore", "engagementScore", "conversionProbability", "winProbability", "stallRisk", "scoreBand", confidence, "calculatedAt"',
  customFieldValues: 'id, "tenantId", "fieldDefinitionId", "recordId", "valueString", "valueNumber", "valueBoolean", "valueDate", "valueJson"',
} as const;

async function fetchTenantRowsPostgres(
  user: TenantUser,
  dataset: keyof typeof TABLE_BY_DATASET,
  extraEquals: Record<string, string> | null
) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (user.tenantId) {
    values.push(user.tenantId);
    clauses.push(`"tenantId" = $${values.length}`);
  } else {
    clauses.push('"tenantId" is null');
  }
  for (const [field, value] of Object.entries(extraEquals ?? {})) {
    values.push(value);
    clauses.push(`"${field}" = $${values.length}`);
  }
  values.push(MAX_LIMIT);
  return query<any>(
    `select ${SQL_SELECT_BY_DATASET[dataset]} from "${TABLE_BY_DATASET[dataset]}" where ${clauses.join(" and ")} limit $${values.length}`,
    values,
  );
}

function needsUsers(objects: Set<ReportObject>) {
  return objects.has("leadOwner") ||
    objects.has("opportunityOwner") ||
    objects.has("activityCreator") ||
    objects.has("assignedTo") ||
    objects.has("taskOwner") ||
    objects.has("telephonyAgent") ||
    objects.has("caseOwner") ||
    objects.has("partner");
}

function isOwnScoped(user: TenantUser) {
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  return !!permissions?.isPartnerRole || permissions?.recordAccess === "OWN";
}

function fieldPermissionMap(user: TenantUser, module: "leads" | "opportunities" | "activities", typeId?: string | null) {
  const role = user.role && typeof user.role === "object" ? user.role : null;
  const legacy = role?.permissions?.fieldPermissions?.[module];
  const next: Record<string, string> = legacy && typeof legacy === "object" ? { ...(legacy as Record<string, string>) } : {};
  const baseScope = module === "leads" ? "lead" : module === "opportunities" ? "opportunity" : "activity";
  const typeScope = typeId && module !== "leads" ? `${baseScope}:${typeId}` : null;
  const templates = Array.isArray(user.permissionTemplates) ? user.permissionTemplates : [];
  for (const template of templates) {
    const fieldPermissions = template?.permissions?.fieldPermissions;
    if (!fieldPermissions || typeof fieldPermissions !== "object") continue;
    const base = fieldPermissions[baseScope];
    const typed = typeScope ? fieldPermissions[typeScope] : null;
    if (base && typeof base === "object") Object.assign(next, base);
    if (typed && typeof typed === "object") Object.assign(next, typed);
  }
  return next;
}

function maskFieldsForUser<T extends Record<string, any>>(user: TenantUser, module: "leads" | "opportunities" | "activities", record: T): T {
  const permissions = fieldPermissionMap(user, module, record.opportunityTypeId ?? record.typeId ?? null);
  const masked: Record<string, any> = { ...record };
  for (const [field, access] of Object.entries(permissions)) {
    if (access === "hidden" && field in masked) {
      masked[field] = null;
      masked[`${field}Hidden`] = true;
    }
  }
  return masked as T;
}

type JoinMaps = {
  stageById: Map<string, any>;
  activityTypeById: Map<string, any>;
  userById: Map<string, any>;
  leadById: Map<string, any>;
  opportunityById: Map<string, any>;
  caseTypeById: Map<string, any>;
  caseStatusById: Map<string, any>;
  casePriorityById: Map<string, any>;
  payoutsByPartnerId: Map<string, any[]>;
  customFieldsByRecordId: Map<string, Record<string, unknown>>;
};

// Same value-column-precedence logic as inbuilt-reports.ts's own normalizedCustomFieldValue --
// duplicated rather than imported (this file and inbuilt-reports.ts don't otherwise depend on
// each other, and it's four lines).
function normalizedCustomFieldValue(row: any): unknown {
  if (row.valueString !== undefined && row.valueString !== null) return row.valueString;
  if (row.valueNumber !== undefined && row.valueNumber !== null) return row.valueNumber;
  if (row.valueDate !== undefined && row.valueDate !== null) return row.valueDate;
  if (row.valueBoolean !== undefined && row.valueBoolean !== null) return row.valueBoolean;
  if (row.valueJson !== undefined && row.valueJson !== null) return row.valueJson;
  return null;
}

function buildJoinContexts(root: ReportQueryDefinition["root"], dataSets: DataSets): JoinContext[] {
  const leadById = mapById(dataSets.leads);
  const opportunityById = mapById(dataSets.opportunities);
  const stageById = mapById(dataSets.stages);
  const activityTypeById = mapById(dataSets.activityTypes);
  const userById = mapById(dataSets.users);
  const caseTypeById = mapById(dataSets.caseTypes);
  const caseStatusById = mapById(dataSets.caseStatuses);
  const casePriorityById = mapById(dataSets.casePriorities);
  const opportunitiesByLeadId = groupBy(dataSets.opportunities, "leadId");
  const activitiesByLeadId = groupBy(dataSets.activities, "leadId");
  const activitiesByOpportunityId = groupBy(dataSets.activities, "opportunityId");
  const tasksByLeadId = groupBy(dataSets.tasks, "leadId");
  const tasksByOpportunityId = groupBy(dataSets.tasks, "opportunityId");
  const callsByLeadId = groupBy(dataSets.telephonyCalls, "leadId");
  const callsByOpportunityId = groupBy(dataSets.telephonyCalls, "opportunityId");
  const casesByLeadId = groupBy(dataSets.cases, "leadId");
  const casesByOpportunityId = groupBy(dataSets.cases, "opportunityId");
  const assignmentLogsByLeadId = dataSets.assignmentLogs.reduce((map, log) => {
    if (log.entityType === "LEAD") pushGrouped(map, log.entityId, log);
    return map;
  }, new Map<string, any[]>());
  const assignmentLogsByOpportunityId = dataSets.assignmentLogs.reduce((map, log) => {
    if (log.entityType === "OPPORTUNITY") pushGrouped(map, log.entityId, log);
    return map;
  }, new Map<string, any[]>());
  // Gap checklist Module 17, item 2 ("dataset catalog"). CommissionLedger has no leadId at all
  // -- partner/payout are Opportunity-only, same reality the funnel explorer's PARTNER dimension
  // already relies on.
  const commissionLedgersByOpportunityId = groupBy(dataSets.commissionLedgers, "opportunityId");
  const payoutsByPartnerId = groupBy(dataSets.payouts, "partnerId");
  const communicationsByLeadId = dataSets.communications.reduce((map, row) => {
    if (row.entityType === "LEAD") pushGrouped(map, row.entityId, row);
    return map;
  }, new Map<string, any[]>());
  const communicationsByOpportunityId = dataSets.communications.reduce((map, row) => {
    if (row.entityType === "OPPORTUNITY") pushGrouped(map, row.entityId, row);
    return map;
  }, new Map<string, any[]>());
  const journeyEnrollmentsByLeadId = dataSets.journeyEnrollments.reduce((map, row) => {
    if (row.recordType === "LEAD") pushGrouped(map, row.recordId, row);
    return map;
  }, new Map<string, any[]>());
  const journeyEnrollmentsByOpportunityId = dataSets.journeyEnrollments.reduce((map, row) => {
    if (row.recordType === "OPPORTUNITY") pushGrouped(map, row.recordId, row);
    return map;
  }, new Map<string, any[]>());
  const recordScoresByLeadId = dataSets.recordScores.reduce((map, row) => {
    if (row.recordType === "LEAD") pushGrouped(map, row.recordId, row);
    return map;
  }, new Map<string, any[]>());
  const recordScoresByOpportunityId = dataSets.recordScores.reduce((map, row) => {
    if (row.recordType === "OPPORTUNITY") pushGrouped(map, row.recordId, row);
    return map;
  }, new Map<string, any[]>());
  // Gap checklist Module 17, item 2 ("dataset catalog" -- custom fields). One dict per record
  // (fieldDefinitionId -> normalized value), not a fan-out list -- see FIELD_CATALOG's
  // "customField" comment for why this reads more like leadOwner (a single resolved satellite)
  // than task/case (which fan out into multiple context rows).
  const customFieldsByRecordId = dataSets.customFieldValues.reduce((map, row) => {
    const existing = map.get(row.recordId) ?? {};
    existing[row.fieldDefinitionId] = normalizedCustomFieldValue(row);
    map.set(row.recordId, existing);
    return map;
  }, new Map<string, Record<string, unknown>>());

  const maps: JoinMaps = { stageById, activityTypeById, userById, leadById, opportunityById, caseTypeById, caseStatusById, casePriorityById, payoutsByPartnerId, customFieldsByRecordId };

  if (root === "lead") {
    return dataSets.leads.flatMap((lead) => expandContext({
      lead,
      leadOwner: userById.get(lead.ownerId),
    }, {
      opportunity: opportunitiesByLeadId.get(lead.id),
      activity: activitiesByLeadId.get(lead.id),
      assignmentLog: assignmentLogsByLeadId.get(lead.id),
      task: tasksByLeadId.get(lead.id),
      telephonyCall: callsByLeadId.get(lead.id),
      case: casesByLeadId.get(lead.id),
      communication: communicationsByLeadId.get(lead.id),
      journeyEnrollment: journeyEnrollmentsByLeadId.get(lead.id),
      recordScore: recordScoresByLeadId.get(lead.id),
    }, maps));
  }

  if (root === "opportunity") {
    return dataSets.opportunities.flatMap((opportunity) => expandContext({
      opportunity,
      opportunityOwner: userById.get(opportunity.ownerId),
      lead: leadById.get(opportunity.leadId),
      stage: stageById.get(opportunity.stageId),
    }, {
      activity: activitiesByOpportunityId.get(opportunity.id),
      assignmentLog: assignmentLogsByOpportunityId.get(opportunity.id),
      task: tasksByOpportunityId.get(opportunity.id),
      telephonyCall: callsByOpportunityId.get(opportunity.id),
      case: casesByOpportunityId.get(opportunity.id),
      commissionLedger: commissionLedgersByOpportunityId.get(opportunity.id),
      communication: communicationsByOpportunityId.get(opportunity.id),
      journeyEnrollment: journeyEnrollmentsByOpportunityId.get(opportunity.id),
      recordScore: recordScoresByOpportunityId.get(opportunity.id),
    }, maps));
  }

  return dataSets.activities.flatMap((activity) => expandContext({
    activity,
    activityType: activityTypeById.get(activity.typeId),
    activityCreator: userById.get(activity.createdBy),
    lead: leadById.get(activity.leadId),
    opportunity: opportunityById.get(activity.opportunityId),
  }, {}, maps));
}

function expandContext(
  base: JoinContext,
  multi: Partial<Record<ReportObject, any[] | undefined>>,
  maps: JoinMaps
) {
  let contexts: JoinContext[] = [base];
  for (const [object, values] of Object.entries(multi) as Array<[ReportObject, any[] | undefined]>) {
    const records = values?.length ? values : [null];
    contexts = contexts.flatMap((context) => records.map((record) => enrichContext({ ...context, [object]: record }, maps)));
  }
  return contexts.map((context) => enrichContext(context, maps));
}

function enrichContext(context: JoinContext, maps: JoinMaps) {
  const next = { ...context };
  if (next.lead && !next.leadOwner) next.leadOwner = maps.userById.get(next.lead.ownerId);
  if (next.opportunity) {
    if (!next.opportunityOwner) next.opportunityOwner = maps.userById.get(next.opportunity.ownerId);
    if (!next.stage) next.stage = maps.stageById.get(next.opportunity.stageId);
    if (!next.lead) next.lead = maps.leadById.get(next.opportunity.leadId);
  }
  if (next.activity) {
    if (!next.activityType) next.activityType = maps.activityTypeById.get(next.activity.typeId);
    if (!next.activityCreator) next.activityCreator = maps.userById.get(next.activity.createdBy);
    if (!next.lead) next.lead = maps.leadById.get(next.activity.leadId);
    if (!next.opportunity) next.opportunity = maps.opportunityById.get(next.activity.opportunityId);
  }
  if (next.assignmentLog && !next.assignedTo) next.assignedTo = maps.userById.get(next.assignmentLog.assignedToId);
  if (next.task && !next.taskOwner) next.taskOwner = maps.userById.get(next.task.ownerId);
  if (next.telephonyCall && !next.telephonyAgent) next.telephonyAgent = maps.userById.get(next.telephonyCall.agentId);
  if (next.case) {
    if (!next.caseType) next.caseType = maps.caseTypeById.get(next.case.typeId);
    if (!next.caseStatus) next.caseStatus = maps.caseStatusById.get(next.case.statusId);
    if (!next.casePriority) next.casePriority = maps.casePriorityById.get(next.case.priorityId);
    if (!next.caseOwner) next.caseOwner = maps.userById.get(next.case.ownerId);
  }
  if (next.commissionLedger) {
    if (!next.partner) next.partner = maps.userById.get(next.commissionLedger.partnerId);
    // Deliberately matched by partner, not by record -- see the "payout" FIELD_CATALOG comment.
    // Most recent payout wins when a partner has more than one (across payout cycles).
    if (!next.payout) {
      const partnerPayouts = maps.payoutsByPartnerId.get(next.commissionLedger.partnerId) ?? [];
      next.payout = [...partnerPayouts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    }
  }
  // Merged from whichever of lead/opportunity is present -- fieldDefinitionId is globally
  // unique, so a lead-scoped and an opportunity-scoped custom field can never collide here.
  if ((next.lead || next.opportunity) && !next.customField) {
    next.customField = {
      ...(next.lead ? maps.customFieldsByRecordId.get(next.lead.id) : undefined),
      ...(next.opportunity ? maps.customFieldsByRecordId.get(next.opportunity.id) : undefined),
    };
  }
  return next;
}

function mapById(rows: any[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy(rows: any[], key: string) {
  return rows.reduce((map, row) => {
    pushGrouped(map, row[key], row);
    return map;
  }, new Map<string, any[]>());
}

function pushGrouped(map: Map<string, any[]>, key: string | null | undefined, row: any) {
  if (!key) return;
  const existing = map.get(key) ?? [];
  existing.push(row);
  map.set(key, existing);
}

function matchesFilters(context: JoinContext, filters: Required<ReportQueryDefinition>["filters"]) {
  return filters.every((filter) => {
    const value = context[filter.object]?.[filter.field] ?? null;
    return compareValue(value, filter.operator ?? "equals", filter.value);
  });
}

function compareValue(actual: unknown, operator: ReportOperator, expected: unknown) {
  if (operator === "is_empty") return actual === null || actual === undefined || actual === "";
  if (operator === "is_not_empty") return actual !== null && actual !== undefined && actual !== "";
  if (operator === "equals") return String(actual ?? "") === String(expected ?? "");
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());

  const left = coerceComparable(actual);
  const right = coerceComparable(expected);
  if (left === null || right === null) return false;
  if (operator === "greater_than") return left > right;
  if (operator === "less_than") return left < right;
  if (operator === "gte") return left >= right;
  if (operator === "lte") return left <= right;
  return false;
}

function coerceComparable(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

function sortContexts(contexts: JoinContext[], orderBy: Required<ReportQueryDefinition>["orderBy"]) {
  return [...contexts].sort((a, b) => {
    const aValue = a[orderBy.object]?.[orderBy.field] ?? null;
    const bValue = b[orderBy.object]?.[orderBy.field] ?? null;
    const left = coerceComparable(aValue) ?? String(aValue ?? "");
    const right = coerceComparable(bValue) ?? String(bValue ?? "");
    if (left === right) return 0;
    const result = left > right ? 1 : -1;
    return orderBy.direction === "desc" ? -result : result;
  });
}

function fieldKey(object: ReportObject, field: string) {
  return `${object}.${field}`;
}

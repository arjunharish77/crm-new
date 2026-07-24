import { query } from "@/lib/db/query";

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
  | "assignedTo";

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
};

type JoinContext = Partial<Record<ReportObject, any>>;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

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
};

const TABLE_BY_DATASET = {
  leads: "Lead",
  opportunities: "Opportunity",
  stages: "StageDefinition",
  activities: "Activity",
  activityTypes: "ActivityType",
  users: "User",
  assignmentLogs: "AssignmentLog",
} as const;

export function getReportQueryCatalog() {
  return Object.fromEntries(
    Object.entries(FIELD_CATALOG).map(([object, fields]) => [object, [...fields]])
  );
}

export async function executeReportQueryForTenant(
  user: TenantUser,
  definition: ReportQueryDefinition
): Promise<ReportExecutionResult> {
  const normalized = normalizeDefinition(definition);
  const neededObjects = collectNeededObjects(normalized);
  const dataSets = await fetchDataSets(user, normalized.root, neededObjects);
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
    fields,
    filters,
    orderBy,
    limit: Math.min(Math.max(Number(definition.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT),
  };
}

function validateField(object: ReportObject, field: string, label?: string) {
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
  return [];
}

async function fetchDataSets(user: TenantUser, root: ReportQueryDefinition["root"], neededObjects: Set<ReportObject>): Promise<DataSets> {
  const ownScoped = isOwnScoped(user);
  const needLeads = neededObjects.has("lead") || neededObjects.has("leadOwner") || root === "lead";
  const needOpportunities = neededObjects.has("opportunity") || neededObjects.has("opportunityOwner") || neededObjects.has("stage") || root === "opportunity";
  const needActivities = neededObjects.has("activity") || neededObjects.has("activityType") || neededObjects.has("activityCreator") || root === "activity";
  const needAssignmentLogs = neededObjects.has("assignmentLog") || neededObjects.has("assignedTo");

  const [leads, opportunities, activities, stages, activityTypes, users, assignmentLogs] = await Promise.all([
    needLeads ? fetchTenantRowsPostgres(user, "leads", ownScoped ? { ownerId: user.id } : null) : [],
    needOpportunities ? fetchTenantRowsPostgres(user, "opportunities", ownScoped ? { ownerId: user.id } : null) : [],
    needActivities ? fetchTenantRowsPostgres(user, "activities", null) : [],
    neededObjects.has("stage") ? fetchTenantRowsPostgres(user, "stages", null) : [],
    neededObjects.has("activityType") ? fetchTenantRowsPostgres(user, "activityTypes", null) : [],
    needsUsers(neededObjects) ? fetchTenantRowsPostgres(user, "users", null) : [],
    needAssignmentLogs ? fetchTenantRowsPostgres(user, "assignmentLogs", null) : [],
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

  return {
    leads: leads.map((row: any) => maskFieldsForUser(user, "leads", row)),
    opportunities: opportunities.map((row: any) => maskFieldsForUser(user, "opportunities", row)),
    stages,
    activities: scopedActivities.map((row: any) => maskFieldsForUser(user, "activities", row)),
    activityTypes,
    users,
    assignmentLogs: scopedAssignmentLogs,
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
    objects.has("assignedTo");
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

function buildJoinContexts(root: ReportQueryDefinition["root"], dataSets: DataSets): JoinContext[] {
  const leadById = mapById(dataSets.leads);
  const opportunityById = mapById(dataSets.opportunities);
  const stageById = mapById(dataSets.stages);
  const activityTypeById = mapById(dataSets.activityTypes);
  const userById = mapById(dataSets.users);
  const opportunitiesByLeadId = groupBy(dataSets.opportunities, "leadId");
  const activitiesByLeadId = groupBy(dataSets.activities, "leadId");
  const activitiesByOpportunityId = groupBy(dataSets.activities, "opportunityId");
  const assignmentLogsByLeadId = dataSets.assignmentLogs.reduce((map, log) => {
    if (log.entityType === "LEAD") pushGrouped(map, log.entityId, log);
    return map;
  }, new Map<string, any[]>());
  const assignmentLogsByOpportunityId = dataSets.assignmentLogs.reduce((map, log) => {
    if (log.entityType === "OPPORTUNITY") pushGrouped(map, log.entityId, log);
    return map;
  }, new Map<string, any[]>());

  if (root === "lead") {
    return dataSets.leads.flatMap((lead) => expandContext({
      lead,
      leadOwner: userById.get(lead.ownerId),
    }, {
      opportunity: opportunitiesByLeadId.get(lead.id),
      activity: activitiesByLeadId.get(lead.id),
      assignmentLog: assignmentLogsByLeadId.get(lead.id),
    }, { stageById, activityTypeById, userById, leadById, opportunityById }));
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
    }, { stageById, activityTypeById, userById, leadById, opportunityById }));
  }

  return dataSets.activities.flatMap((activity) => expandContext({
    activity,
    activityType: activityTypeById.get(activity.typeId),
    activityCreator: userById.get(activity.createdBy),
    lead: leadById.get(activity.leadId),
    opportunity: opportunityById.get(activity.opportunityId),
  }, {}, { stageById, activityTypeById, userById, leadById, opportunityById }));
}

function expandContext(
  base: JoinContext,
  multi: Partial<Record<ReportObject, any[] | undefined>>,
  maps: {
    stageById: Map<string, any>;
    activityTypeById: Map<string, any>;
    userById: Map<string, any>;
    leadById: Map<string, any>;
    opportunityById: Map<string, any>;
  }
) {
  let contexts: JoinContext[] = [base];
  for (const [object, values] of Object.entries(multi) as Array<[ReportObject, any[] | undefined]>) {
    const records = values?.length ? values : [null];
    contexts = contexts.flatMap((context) => records.map((record) => enrichContext({ ...context, [object]: record }, maps)));
  }
  return contexts.map((context) => enrichContext(context, maps));
}

function enrichContext(context: JoinContext, maps: {
  stageById: Map<string, any>;
  activityTypeById: Map<string, any>;
  userById: Map<string, any>;
  leadById: Map<string, any>;
  opportunityById: Map<string, any>;
}) {
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

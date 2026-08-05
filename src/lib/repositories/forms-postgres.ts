import { randomUUID } from "crypto";
import { execute, query, queryOne, type Queryable } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { formatExportDateValue, getTenantTimeZone } from "@/lib/server/date-format";
import { checkRateLimit } from "@/lib/server/rate-limit";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

const FORM_COLUMNS = 'id, name, description, fields, config, "isActive", "submitButtonText", "successMessage", "redirectUrl", "spamProtection", "rateLimit", "duplicateAction", theme, "createdAt", "updatedAt"';

function tenantWhere(user: TenantUser, startIndex = 1) {
  return user.tenantId ? { sql: `"tenantId" = $${startIndex}`, values: [user.tenantId] } : { sql: '"tenantId" is null', values: [] };
}

function formatFormRecord(record: any, submissionCount = 0) {
  const persistedConfig = record.config && typeof record.config === "object" ? record.config : {};
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    slug: record.id,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fields: Array.isArray(record.fields) ? record.fields : [],
    config: {
      fields: Array.isArray(record.fields) ? record.fields : [],
      successMessage: record.successMessage,
      redirectUrl: record.redirectUrl,
      submitButtonText: record.submitButtonText,
      spamProtection: record.spamProtection,
      rateLimit: record.rateLimit,
      duplicateAction: record.duplicateAction,
      theme: record.theme,
      customCss: "",
      ...persistedConfig,
      sourceModules: Array.isArray(persistedConfig.sourceModules) ? persistedConfig.sourceModules : ["lead"],
      layoutColumns: persistedConfig.layoutColumns ?? 2,
      placements: Array.isArray(persistedConfig.placements) ? persistedConfig.placements : [],
      visibilityMode: persistedConfig.visibilityMode ?? "ALL",
      visibleUserIds: Array.isArray(persistedConfig.visibleUserIds) ? persistedConfig.visibleUserIds : [],
      visibleTeamIds: Array.isArray(persistedConfig.visibleTeamIds) ? persistedConfig.visibleTeamIds : [],
      visibleSalesGroupIds: Array.isArray(persistedConfig.visibleSalesGroupIds) ? persistedConfig.visibleSalesGroupIds : [],
    },
    submitButtonText: record.submitButtonText,
    successMessage: record.successMessage,
    redirectUrl: record.redirectUrl,
    theme: record.theme,
    _count: { submissions: submissionCount },
  };
}

async function getObjectId(user: TenantUser, objectName: string, client?: Queryable) {
  const tenant = tenantWhere(user, 2);
  const existing = await queryOne<{ id: string }>(
    `select id from "ObjectDefinition" where name = $1 and ${tenant.sql} limit 1`,
    [objectName, ...tenant.values],
    client,
  );
  if (existing?.id) return existing.id;

  const supportedObjects = new Map([
    ["lead", "Lead"],
    ["opportunity", "Opportunity"],
    ["activity", "Activity"],
    ["task", "Task"],
  ]);
  const label = supportedObjects.get(objectName);
  if (!label) throw new Error(`Missing object definition for ${objectName}`);

  const now = new Date().toISOString();
  const created = await queryOne<{ id: string }>(
    `insert into "ObjectDefinition" (id, "tenantId", name, label, "isCustom", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, false, $5, $5)
     returning id`,
    [randomUUID(), user.tenantId, objectName, label, now],
    client,
  );
  if (!created?.id) throw new Error(`Missing object definition for ${objectName}`);
  return created.id;
}

async function insertReturning<T>(table: string, row: Record<string, unknown>, returning: string, client?: Queryable) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const inserted = await queryOne<T & Record<string, unknown>>(
    `insert into "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")}) returning ${returning}`,
    values,
    client,
  );
  if (!inserted) throw new Error(`${table.toUpperCase()}_INSERT_FAILED`);
  return inserted as T;
}

async function updateReturning<T>(
  table: string,
  patch: Record<string, unknown>,
  whereSql: string,
  whereValues: unknown[],
  returning: string,
  client?: Queryable,
) {
  const columns = Object.keys(patch).filter((key) => patch[key] !== undefined);
  if (!columns.length) throw new Error(`${table.toUpperCase()}_EMPTY_UPDATE`);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const shiftedWhere = whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`);
  const updated = await queryOne<T & Record<string, unknown>>(
    `update "${table}" set ${assignments} ${shiftedWhere} returning ${returning}`,
    values.concat(whereValues),
    client,
  );
  if (!updated) throw new Error(`${table.toUpperCase()}_NOT_FOUND`);
  return updated as T;
}

export async function listFormsForTenant(user: TenantUser) {
  const tenant = tenantWhere(user);
  const forms = await query<any>(
    `select ${FORM_COLUMNS} from "Form" where ${tenant.sql} order by "createdAt" desc`,
    tenant.values,
  );
  const formIds = forms.map((form) => form.id);
  const counts = new Map<string, number>();
  if (formIds.length > 0) {
    const submissions = await query<any>(
      `select "formId", count(*)::int as count from "FormSubmission" where ${tenant.sql} and "formId" = any($${tenant.values.length + 1}::text[]) group by "formId"`,
      [...tenant.values, formIds],
    );
    for (const item of submissions) counts.set(item.formId, Number(item.count ?? 0));
  }
  return forms.map((form) => formatFormRecord(form, counts.get(form.id) ?? 0));
}

export async function listAvailableFormsForPlacement(user: TenantUser, placement: string) {
  if (!user.tenantId) return [];
  const forms = await listFormsForTenant(user);
  const [salesGroupRows, teamRows, userRecord] = await Promise.all([
    query<any>('select "groupId" from "SalesGroupMember" where "tenantId" = $1 and "userId" = $2', [user.tenantId, user.id]),
    query<any>('select "teamId" from "TeamMember" where "tenantId" = $1 and "userId" = $2', [user.tenantId, user.id]),
    queryOne<any>('select id, email, name, "roleId", "managerId", skills from "User" where "tenantId" = $1 and id = $2 limit 1', [user.tenantId, user.id]),
  ]);
  const salesGroupIds = new Set(salesGroupRows.map((item) => item.groupId));
  const teamIds = new Set(teamRows.map((item) => item.teamId));
  const currentUser = { ...(userRecord ?? {}), id: user.id, tenantId: user.tenantId };

  const visibilityAllows = (config: any, modeKey = "visibilityMode") => {
    const mode = String(config?.[modeKey] ?? "ALL");
    if (mode === "INHERIT" || mode === "ALL") return true;
    if (mode === "ROLES") return Array.isArray(config.visibleRoleIds) && config.visibleRoleIds.includes(userRecord?.roleId);
    if (mode === "USERS") return Array.isArray(config.visibleUserIds) && config.visibleUserIds.includes(user.id);
    if (mode === "SALES_GROUPS") return Array.isArray(config.visibleSalesGroupIds) && config.visibleSalesGroupIds.some((id: string) => salesGroupIds.has(id));
    if (mode === "TEAMS") return Array.isArray(config.visibleTeamIds) && config.visibleTeamIds.some((id: string) => teamIds.has(id));
    return false;
  };

  return forms.filter((form: any) => {
    const config = form.config ?? {};
    const placements = Array.isArray(config.placements) ? config.placements : [];
    const placementRules = Array.isArray(config.placementRules) ? config.placementRules : [];
    const matchingRule = placementRules.find((rule: any) => rule.placement === placement && rule.enabled !== false);
    if (!form.isActive || (!placements.includes(placement) && !matchingRule)) return false;
    if (!visibilityAllows(config)) return false;
    if (matchingRule && String(matchingRule.visibilityMode ?? "INHERIT") !== "INHERIT" && !visibilityAllows(matchingRule)) return false;
    const userConditions = Array.isArray(matchingRule?.userConditions)
      ? matchingRule.userConditions.filter((condition: any) => condition.field)
      : [];
    if (!userConditions.length) return true;
    const checks = userConditions.map((condition: any) => processConditionMatches(currentUser, condition));
    return String(matchingRule.userConditionLogic ?? "AND") === "OR" ? checks.some(Boolean) : checks.every(Boolean);
  });
}

function processConditionMatches(record: Record<string, any>, condition: Record<string, any>) {
  const value = readProcessValue(record, String(condition.field ?? ""));
  const expected = condition.value;
  switch (condition.operator) {
    case "not_equals":
      return String(value ?? "") !== String(expected ?? "");
    case "contains":
      return String(value ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "contains_data":
      return value !== undefined && value !== null && String(value).trim() !== "";
    case "not_contains_data":
      return value === undefined || value === null || String(value).trim() === "";
    case "equals":
    default:
      return String(value ?? "") === String(expected ?? "");
  }
}

function readProcessValue(record: Record<string, any>, path: string) {
  const normalizedPath = path.replace(/^(lead|opportunity|activity|user)\./, "");
  const direct = record[normalizedPath] ?? record[path];
  if (direct !== undefined) return direct;
  return normalizedPath.split(".").reduce<any>((current, key) => current?.[key], record);
}

export async function createFormForTenant(user: TenantUser, payload: Record<string, unknown>) {
  return withTransaction(user, async (client) => {
    const objectId = await getObjectId(user, "lead", client);
    const now = new Date().toISOString();
    const form = await insertReturning<any>("Form", {
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId,
      name: payload.name,
      description: payload.description ?? null,
      fields: [],
      isActive: payload.isActive ?? true,
      submitButtonText: "Submit",
      successMessage: "Thank you for your submission!",
      redirectUrl: null,
      spamProtection: true,
      rateLimit: 10,
      duplicateAction: "CREATE",
      theme: "default",
      config: {
        layoutColumns: 2,
        placements: [],
        visibilityMode: "ALL",
        visibleUserIds: [],
        visibleTeamIds: [],
        visibleSalesGroupIds: [],
      },
      createdAt: now,
      updatedAt: now,
    }, FORM_COLUMNS, client);
    return formatFormRecord(form, 0);
  });
}

export async function getFormForTenant(user: TenantUser, formId: string) {
  const tenant = tenantWhere(user, 2);
  const form = await queryOne<any>(
    `select ${FORM_COLUMNS} from "Form" where id = $1 and ${tenant.sql} limit 1`,
    [formId, ...tenant.values],
  );
  return form ? formatFormRecord(form, 0) : null;
}

export async function updateFormForTenant(user: TenantUser, formId: string, payload: Record<string, unknown>) {
  const config = (payload.config as Record<string, unknown> | undefined) ?? {};
  const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (payload.description !== undefined) updatePayload.description = payload.description;
  if (config.fields !== undefined || payload.fields !== undefined) updatePayload.fields = config.fields ?? payload.fields;
  if (payload.isActive !== undefined) updatePayload.isActive = payload.isActive;
  if (config.submitButtonText !== undefined) updatePayload.submitButtonText = config.submitButtonText;
  if (config.successMessage !== undefined) updatePayload.successMessage = config.successMessage;
  if (config.redirectUrl !== undefined) updatePayload.redirectUrl = config.redirectUrl;
  if (config.spamProtection !== undefined) updatePayload.spamProtection = config.spamProtection;
  if (config.rateLimit !== undefined) updatePayload.rateLimit = config.rateLimit;
  if (config.duplicateAction !== undefined) updatePayload.duplicateAction = config.duplicateAction;
  if (config.theme !== undefined) updatePayload.theme = config.theme;
  const { fields: _ignoredFields, ...formConfig } = config;
  updatePayload.config = formConfig;

  const tenant = tenantWhere(user, 2);
  const form = await updateReturning<any>(
    "Form",
    updatePayload,
    `where id = $1 and ${tenant.sql}`,
    [formId, ...tenant.values],
    FORM_COLUMNS,
  );
  return formatFormRecord(form, 0);
}

export async function deleteFormForTenant(user: TenantUser, formId: string) {
  const tenant = tenantWhere(user, 2);
  await execute(`delete from "Form" where id = $1 and ${tenant.sql}`, [formId, ...tenant.values]);
}

async function getPublicFormRow(identifier: string) {
  return queryOne<any>(
    `select ${FORM_COLUMNS}, "tenantId" from "Form" where id = $1 limit 1`,
    [identifier],
  );
}

export async function getPublicForm(identifier: string) {
  const form = await getPublicFormRow(identifier);
  return form ? formatFormRecord(form, 0) : null;
}

export async function submitPublicForm(identifier: string, payload: Record<string, unknown>) {
  return withTransaction({ id: "public-form", tenantId: null }, async (client) => {
    const formRow = await getPublicFormRow(identifier);
    if (!formRow) throw new Error("FORM_NOT_FOUND");
    const form = formatFormRecord(formRow, 0);
    if (!form.isActive) throw new Error("FORM_INACTIVE");
    if (!formRow.tenantId) throw new Error("FORM_NOT_FOUND");

    const configuredRateLimit = Number(form.config?.rateLimit) || 10;
    const rateLimitResult = await checkRateLimit({
      key: `form-submit:${form.id}`,
      limit: configuredRateLimit,
      windowSeconds: 60 * 60,
    });
    if (!rateLimitResult.allowed) throw new Error("RATE_LIMITED");
    const tenantId = formRow.tenantId as string;
    const user = { id: "public-form", tenantId };
    const context = payload._context && typeof payload._context === "object" ? (payload._context as Record<string, unknown>) : {};
    const moduleData = splitFormPayloadByModule(form, payload);
    const leadData = { ...payload, ...moduleData.lead };

    let leadId: string | null = typeof context.leadId === "string" ? context.leadId : null;
    const email = typeof leadData.email === "string" ? leadData.email : typeof leadData.Email === "string" ? leadData.Email : null;
    if (!leadId && email) {
      const existingLead = await queryOne<any>(
        'select id, name, email, "ownerId" from "Lead" where "tenantId" = $1 and email = $2 limit 1',
        [tenantId, email],
        client,
      );
      if (existingLead?.id) leadId = existingLead.id;
    }

    const now = new Date().toISOString();
    if (!leadId) {
      const objectId = await getObjectId(user, "lead", client);
      const createdLead = await insertReturning<any>("Lead", {
        id: randomUUID(),
        tenantId,
        objectId,
        name: String((leadData.name ?? leadData.Name ?? "Website Lead") as string),
        email,
        phone: typeof leadData.phone === "string" ? leadData.phone : typeof leadData.Phone === "string" ? leadData.Phone : null,
        company: typeof leadData.company === "string" ? leadData.company : null,
        source: "FORM",
        status: "NEW",
        score: 0,
        tags: [],
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      }, 'id, name, email, phone, company, source, status, score, tags, "createdBy", "createdAt", "updatedAt", "ownerId"', client);
      leadId = createdLead.id;
    } else if (form.config?.duplicateAction === "UPDATE") {
      const updatePayload: Record<string, unknown> = { updatedAt: now };
      for (const key of ["name", "email", "phone", "company", "source", "status"]) {
        if (leadData[key] !== undefined && leadData[key] !== "") updatePayload[key] = leadData[key];
      }
      await updateReturning("Lead", updatePayload, 'where "tenantId" = $1 and id = $2', [tenantId, leadId], "id", client);
    }

    const opportunityId = await upsertOpportunityFromFormModule({
      tenantId,
      leadId,
      opportunityId: typeof context.opportunityId === "string" ? context.opportunityId : null,
      data: moduleData.opportunity,
      client,
    });
    await upsertActivityFromFormModule({
      tenantId,
      leadId,
      activityId: typeof context.activityId === "string" ? context.activityId : null,
      opportunityId,
      data: moduleData.activity,
      client,
    });
    await upsertTaskFromFormModule({
      tenantId,
      leadId,
      opportunityId,
      activityId: typeof context.activityId === "string" ? context.activityId : null,
      ownerId: typeof context.ownerId === "string" ? context.ownerId : await resolveLeadOwnerId(tenantId, leadId, client),
      data: moduleData.task,
      client,
    });

    const utmParams = Object.fromEntries(Object.entries(payload).filter(([key]) => key.startsWith("utm_")));
    await insertReturning("FormSubmission", {
      id: randomUUID(),
      tenantId,
      formId: form.id,
      leadId,
      data: { ...payload, _modules: moduleData, leadId, opportunityId },
      utmParams: Object.keys(utmParams).length ? utmParams : null,
      ipAddress: null,
      userAgent: null,
      referrer: null,
      status: "PROCESSED",
      spamScore: 0,
      isDuplicate: false,
      duplicateLeadId: null,
      errorMessage: null,
    }, "id", client);

    return { success: true, leadId, opportunityId };
  });
}

function splitFormPayloadByModule(form: any, payload: Record<string, unknown>) {
  const output: Record<"lead" | "opportunity" | "activity" | "task", Record<string, unknown>> = {
    lead: {},
    opportunity: {},
    activity: {},
    task: {},
  };

  for (const field of form.config?.fields ?? []) {
    const rawValue = payload[field.mapping] ?? payload[field.label] ?? payload[field.id];
    if (rawValue === undefined || rawValue === "") continue;
    const sourceModule = String(field.sourceModule ?? field.module ?? "").toLowerCase();
    const mapping = String(field.mapping ?? "");
    const [moduleFromMapping, fieldFromMapping] = mapping.includes(".") ? mapping.split(".", 2) : ["", mapping];
    const moduleName = (sourceModule || moduleFromMapping || "lead").toLowerCase();
    const fieldName = fieldFromMapping || mapping || field.label;
    if (moduleName === "opportunity" || moduleName === "activity" || moduleName === "lead" || moduleName === "task") {
      output[moduleName][fieldName] = rawValue;
      if (moduleName === "opportunity" && field.opportunityTypeId) output.opportunity.opportunityTypeId = field.opportunityTypeId;
      if (moduleName === "activity" && field.activityTypeId) output.activity.typeId = field.activityTypeId;
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (!key.includes(".") || value === undefined || value === "") continue;
    const [moduleName, fieldName] = key.split(".", 2);
    if ((moduleName === "lead" || moduleName === "opportunity" || moduleName === "activity" || moduleName === "task") && fieldName) output[moduleName][fieldName] = value;
  }

  return output;
}

async function resolveLeadOwnerId(tenantId: string, leadId: string | null, client?: Queryable) {
  if (!leadId) return null;
  const lead = await queryOne<any>('select "ownerId" from "Lead" where "tenantId" = $1 and id = $2 limit 1', [tenantId, leadId], client);
  return lead?.ownerId ?? null;
}

async function upsertOpportunityFromFormModule(input: {
  tenantId: string;
  leadId: string | null;
  opportunityId: string | null;
  data: Record<string, unknown>;
  client?: Queryable;
}) {
  if (!input.leadId || Object.keys(input.data).length === 0) return null;
  if (input.opportunityId) {
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ["title", "amount", "expectedCloseDate", "priority", "stageId", "opportunityTypeId"]) {
      if (input.data[key] !== undefined && input.data[key] !== "") updatePayload[key] = key === "amount" ? Number(input.data[key]) : input.data[key];
    }
    await updateReturning("Opportunity", updatePayload, 'where "tenantId" = $1 and id = $2', [input.tenantId, input.opportunityId], "id", input.client);
    return input.opportunityId;
  }

  const user = { id: "public-form", tenantId: input.tenantId };
  const [objectId, types] = await Promise.all([
    getObjectId(user, "opportunity", input.client),
    query<any>(
      `select ot.id,
        coalesce(json_agg(json_build_object('id', sd.id, 'name', sd.name) order by sd."order") filter (where sd.id is not null), '[]') as stages
       from "OpportunityType" ot
       left join "StageDefinition" sd on sd."opportunityTypeId" = ot.id and sd."tenantId" = ot."tenantId"
       where ot."tenantId" = $1 and ot."isActive" = true
       group by ot.id
       order by ot."createdAt" asc`,
      [input.tenantId],
      input.client,
    ),
  ]);
  const selectedType = input.data.opportunityTypeId ? types.find((type: any) => type.id === input.data.opportunityTypeId) : types[0];
  if (!selectedType?.id) return null;

  const now = new Date().toISOString();
  const opportunity = await insertReturning<any>("Opportunity", {
    id: randomUUID(),
    tenantId: input.tenantId,
    objectId,
    leadId: input.leadId,
    opportunityTypeId: selectedType.id,
    stageId: input.data.stageId ?? selectedType.stages?.[0]?.id ?? null,
    title: input.data.title ?? input.data.name ?? "Form Opportunity",
    amount: input.data.amount ? Number(input.data.amount) : null,
    expectedCloseDate: input.data.expectedCloseDate ?? null,
    priority: input.data.priority ?? "MEDIUM",
    tags: [],
    ownerId: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  }, "id", input.client);
  return opportunity.id as string;
}

async function upsertActivityFromFormModule(input: {
  tenantId: string;
  leadId: string | null;
  activityId: string | null;
  opportunityId: string | null;
  data: Record<string, unknown>;
  client?: Queryable;
}) {
  if (!input.leadId || Object.keys(input.data).length === 0) return null;
  if (input.activityId) {
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ["typeId", "outcome", "notes", "dueAt", "opportunityId"]) {
      const value = key === "opportunityId" ? input.opportunityId : input.data[key];
      if (value !== undefined && value !== "") updatePayload[key] = value;
    }
    await updateReturning("Activity", updatePayload, 'where "tenantId" = $1 and id = $2', [input.tenantId, input.activityId], "id", input.client);
    return input.activityId;
  }

  const user = { id: "public-form", tenantId: input.tenantId };
  const objectId = await getObjectId(user, "activity", input.client);
  const type = input.data.typeId
    ? { id: String(input.data.typeId) }
    : await queryOne<any>(
        'select id from "ActivityType" where "tenantId" = $1 and "isActive" = true order by "order" asc limit 1',
        [input.tenantId],
        input.client,
      );
  if (!type?.id) return null;

  const now = new Date().toISOString();
  const activity = await insertReturning<any>("Activity", {
    id: randomUUID(),
    tenantId: input.tenantId,
    objectId,
    typeId: type.id,
    leadId: input.leadId,
    opportunityId: input.opportunityId,
    outcome: input.data.outcome ?? null,
    notes: input.data.notes ?? input.data.description ?? null,
    dueAt: input.data.dueAt ?? null,
    completedAt: null,
    slaStatus: "PENDING",
    slaTarget: null,
    isRecurring: false,
    recurrenceRule: null,
    seriesId: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  }, "id", input.client);
  return activity.id as string;
}

async function upsertTaskFromFormModule(input: {
  tenantId: string;
  leadId: string | null;
  opportunityId: string | null;
  activityId: string | null;
  ownerId: string | null;
  data: Record<string, unknown>;
  client?: Queryable;
}) {
  if (!input.ownerId || Object.keys(input.data).length === 0) return null;
  const now = new Date().toISOString();
  const task = await insertReturning<any>("Task", {
    id: randomUUID(),
    tenantId: input.tenantId,
    title: String(input.data.title ?? "Form follow-up task"),
    description: input.data.description ?? null,
    status: input.data.status ?? "OPEN",
    priority: input.data.priority ?? "MEDIUM",
    ownerId: input.ownerId,
    createdBy: null,
    leadId: input.leadId,
    opportunityId: input.opportunityId,
    activityId: input.activityId,
    dueAt: input.data.dueAt ?? null,
    reminderAt: input.data.reminderAt ?? null,
    completedAt: input.data.status === "COMPLETED" ? now : null,
    completedBy: null,
    metadata: { source: "FORM" },
    createdAt: now,
    updatedAt: now,
  }, "id", input.client);
  return task.id;
}

export async function getFormStatsForTenant(user: TenantUser, formId: string) {
  const tenant = tenantWhere(user, 2);
  const submissions = await query<any>(
    `select status, "isDuplicate", "spamScore", "createdAt" from "FormSubmission" where "formId" = $1 and ${tenant.sql}`,
    [formId, ...tenant.values],
  );
  const total = submissions.length;
  const processed = submissions.filter((item) => item.status === "PROCESSED").length;
  const spam = submissions.filter((item) => item.status === "SPAM").length;
  const duplicate = submissions.filter((item) => item.isDuplicate || item.status === "DUPLICATE").length;
  const errors = submissions.filter((item) => item.status === "ERROR").length;
  const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentTrend = submissions.filter((item) => new Date(item.createdAt).getTime() >= threshold).length;
  return {
    total,
    processed,
    spam,
    duplicate,
    errors,
    conversionRate: total ? processed / total : 0,
    spamRate: total ? spam / total : 0,
    duplicateRate: total ? duplicate / total : 0,
    recentTrend,
  };
}

export async function getFormSubmissionsForTenant(user: TenantUser, formId: string, limit: number, offset: number) {
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const safeOffset = Math.max(Number(offset || 0), 0);
  const tenant = tenantWhere(user, 2);
  const totalRow = await queryOne<{ count: number }>(
    `select count(*)::int as count from "FormSubmission" where "formId" = $1 and ${tenant.sql}`,
    [formId, ...tenant.values],
  );
  const rows = await query<any>(
    `select id, "createdAt", status, "spamScore", data, "leadId"
     from "FormSubmission"
     where "formId" = $1 and ${tenant.sql}
     order by "createdAt" desc
     limit $${tenant.values.length + 2} offset $${tenant.values.length + 3}`,
    [formId, ...tenant.values, safeLimit, safeOffset],
  );
  const leadIds = [...new Set(rows.map((item) => item.leadId).filter(Boolean))];
  const leads = leadIds.length
    ? await query<any>(
        `select id, name, email, status from "Lead" where ${tenantWhere(user).sql} and id = any($${tenantWhere(user).values.length + 1}::text[])`,
        [...tenantWhere(user).values, leadIds],
      )
    : [];
  const leadMap = new Map(leads.map((item) => [item.id, item]));
  return {
    submissions: rows.map((item) => ({ ...item, lead: item.leadId ? leadMap.get(item.leadId) ?? null : null })),
    total: totalRow?.count ?? 0,
  };
}

export async function exportFormSubmissionsForTenant(user: TenantUser, formId: string) {
  const timeZone = await getTenantTimeZone(user.tenantId);
  const submissions = await getFormSubmissionsForTenant(user, formId, 1000, 0);
  const rows = submissions.submissions;
  const headers = ["id", "createdAt", "status", "spamScore", "leadName", "leadEmail", "data"];
  return [
    headers.join(","),
    ...rows.map((item: any) =>
      [
        item.id,
        formatExportDateValue(item.createdAt, timeZone),
        item.status,
        item.spamScore ?? "",
        item.lead?.name ?? "",
        item.lead?.email ?? "",
        JSON.stringify(item.data).replace(/"/g, '""'),
      ]
        .map((value) => `"${String(value ?? "")}"`)
        .join(",")
    ),
  ].join("\n");
}

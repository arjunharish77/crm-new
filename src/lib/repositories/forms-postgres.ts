import { randomUUID } from "crypto";
import { execute, jsonbParam, query, queryAsSystem, queryOne, type Queryable } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { formatExportDateValue, getTenantTimeZone } from "@/lib/server/date-format";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { distributeRecord } from "@/lib/server/distribution-engine";
import { assertFeatureEnabled, isFeatureEnabledForTenant } from "@/lib/server/entitlements";
import { recordAttributionTouch } from "@/lib/server/marketing-journeys";
import { resolveLeadStatusForWrite } from "@/lib/repositories/lead-statuses-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

const FORM_COLUMNS = 'id, name, description, fields, config, "isActive", "submitButtonText", "successMessage", "redirectUrl", "spamProtection", "rateLimit", "duplicateAction", "defaultOwnerId", theme, "createdAt", "updatedAt", "deletedAt", draft, "draftUpdatedAt", "publishedVersion", "publishedAt", "createdBy"';

// Archive, restore and delete for good: the person who created it, or an admin (decided
// 2026-10-03). An item with no recorded creator (made before this was tracked) is admin-only.
function assertCreatorOrAdmin(user: TenantUser, createdBy: string | null | undefined) {
  if ((user as any).isTenantAdmin || (user as any).isPlatformAdmin) return;
  if (!createdBy || createdBy !== user.id) throw new Error("ITEM_OWNER_OR_ADMIN");
}

// Archive model (decision 31): deleting a form archives it (deletedAt). Its public link stops
// working at once; it can be restored, with its submissions, for ARCHIVE_RETENTION_DAYS, and is
// then purged by the worker (purgeArchivedForms) together with its submissions.
export const FORM_ARCHIVE_RETENTION_DAYS = 30;

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
    deletedAt: record.deletedAt ?? null,
    createdBy: record.createdBy ?? null,
    draft: record.draft ?? null,
    draftUpdatedAt: record.draftUpdatedAt ?? null,
    publishedVersion: Number(record.publishedVersion ?? 0),
    publishedAt: record.publishedAt ?? null,
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

// A public form submission has no real logged-in user, but `AuditLog.userId` (and
// `Activity.createdBy`) are NOT NULL columns with a foreign key to a real "User" row --
// there is no "public-form" user to attribute these writes to. Resolve the form's own
// (currently unused) `defaultOwnerId` column first, since it's the tenant admin's explicit
// choice of who should own form-originated activity; fall back to the tenant's oldest
// active user (same fallback query automations-postgres.ts already uses for its own
// synthetic-user case) so this only comes back null for a tenant with zero active users.
async function resolveFormActorId(tenantId: string, formRow: any, client?: Queryable): Promise<string | null> {
  if (typeof formRow?.defaultOwnerId === "string" && formRow.defaultOwnerId) return formRow.defaultOwnerId;
  const fallback = await queryOne<{ id: string }>(
    `select id from "User" where "tenantId" = $1 and status = 'ACTIVE' limit 1`,
    [tenantId],
    client,
  );
  return fallback?.id ?? null;
}

async function createFormAuditLog(
  tenantId: string,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  after: unknown,
  client?: Queryable,
) {
  if (!actorId) return;
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, $5, $6, null, $7, null, $8, $9)`,
    [randomUUID(), tenantId, actorId, action, entityType, entityId, after, { source: "FORM" }, new Date().toISOString()],
    client,
  ).catch(() => undefined);
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

export async function listFormsForTenant(user: TenantUser, options: { archived?: boolean } = {}) {
  const tenant = tenantWhere(user);
  const forms = await query<any>(
    `select ${FORM_COLUMNS} from "Form" where ${tenant.sql} and ${options.archived ? `"deletedAt" is not null` : `"deletedAt" is null`}
     order by ${options.archived ? `"deletedAt" desc` : `"createdAt" desc`}`,
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
  if ((placement === "OPPORTUNITY_DETAIL" || placement === "OPPORTUNITY_CREATE") && !(await isFeatureEnabledForTenant(user.tenantId, "opportunityEnabled"))) {
    return [];
  }
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
  await assertFeatureEnabled(user.tenantId, "formBuilderEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  return withTransaction(user, async (client) => {
    const objectId = await getObjectId(user, "lead", client);
    const now = new Date().toISOString();
    const form = await insertReturning<any>("Form", {
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId,
      name: payload.name,
      description: payload.description ?? null,
      // jsonbParam: a bare JS array is sent as a Postgres array literal, and `[]` became `{}`.
      fields: jsonbParam([]),
      // The form editor creates a draft (decision 29): off and unpublished until published.
      isActive: payload.asDraft === true ? false : payload.isActive ?? true,
      publishedVersion: payload.asDraft === true ? 0 : 1,
      publishedAt: payload.asDraft === true ? null : now,
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
      createdBy: user.id === "system" ? null : user.id,
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

// UI/UX plan B5. The builder and the CRM placement tab each save their own part of the form.
// This used to replace the whole stored config on every save (with {} when no config was sent),
// so whichever editor saved last silently undid the other. Now only the config keys a request
// sends are replaced, and a request carrying `expectedUpdatedAt` is refused with
// FORM_VERSION_CONFLICT if the form changed since that version was loaded.
export async function updateFormForTenant(user: TenantUser, formId: string, payload: Record<string, unknown>) {
  await assertFeatureEnabled(user.tenantId, "formBuilderEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const hasConfig = !!payload.config && typeof payload.config === "object";
  const config = hasConfig ? (payload.config as Record<string, unknown>) : {};
  const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (payload.description !== undefined) updatePayload.description = payload.description;
  // jsonbParam: a bare JS array is sent as a Postgres array literal, which is not valid JSON, so
  // every builder save of a form with fields used to fail (and an empty list was stored as {}).
  if (config.fields !== undefined || payload.fields !== undefined) updatePayload.fields = jsonbParam(config.fields ?? payload.fields);
  if (payload.isActive !== undefined) updatePayload.isActive = payload.isActive;
  if (config.submitButtonText !== undefined) updatePayload.submitButtonText = config.submitButtonText;
  if (config.successMessage !== undefined) updatePayload.successMessage = config.successMessage;
  if (config.redirectUrl !== undefined) updatePayload.redirectUrl = config.redirectUrl;
  if (config.spamProtection !== undefined) updatePayload.spamProtection = config.spamProtection;
  if (config.rateLimit !== undefined) updatePayload.rateLimit = config.rateLimit;
  if (config.duplicateAction !== undefined) updatePayload.duplicateAction = config.duplicateAction;
  if (config.theme !== undefined) updatePayload.theme = config.theme;

  const tenant = tenantWhere(user, 2);
  return withTransaction(user, async (client) => {
    const current = await queryOne<{ config: unknown; updatedAt: string }>(
      `select config, "updatedAt", "deletedAt", "publishedVersion" from "Form" where id = $1 and ${tenant.sql} for update`,
      [formId, ...tenant.values],
      client,
    );
    if (!current) throw new Error("FORM_NOT_FOUND");
    if ((current as any).deletedAt) throw new Error("FORM_ARCHIVED");
    if (payload.isActive === true && Number((current as any).publishedVersion ?? 0) === 0) throw new Error("FORM_NOT_PUBLISHED");
    if (payload.expectedUpdatedAt !== undefined && payload.expectedUpdatedAt !== null) {
      const expected = new Date(payload.expectedUpdatedAt as string | number | Date);
      if (Number.isNaN(expected.getTime()) || expected.getTime() !== new Date(current.updatedAt).getTime()) {
        throw new Error("FORM_VERSION_CONFLICT");
      }
    }
    if (hasConfig) {
      const { fields: _ignoredFields, ...formConfig } = config;
      const stored = current.config && typeof current.config === "object" ? (current.config as Record<string, unknown>) : {};
      updatePayload.config = jsonbParam({ ...stored, ...formConfig });
    }
    const form = await updateReturning<any>(
      "Form",
      updatePayload,
      `where id = $1 and ${tenant.sql}`,
      [formId, ...tenant.values],
      FORM_COLUMNS,
      client,
    );
    return formatFormRecord(form, 0);
  });
}

// --- Builder save model (decision 29) ---------------------------------------------------------
// Drafted: the fields and the form's content settings. Not drafted (they apply at once, as
// before): on/off, and where and to whom the form appears inside the CRM.
const FORM_LIVE_CONFIG_KEYS = ["placements", "placementRules", "visibilityMode", "visibleUserIds", "visibleTeamIds", "visibleSalesGroupIds", "isActive", "fields"];
const FORM_CONFIG_COLUMNS = ["submitButtonText", "successMessage", "redirectUrl", "spamProtection", "rateLimit", "duplicateAction", "theme"] as const;
type FormContent = { fields: unknown[]; config: Record<string, unknown> };

function formContentOf(input: Record<string, any>): FormContent {
  const source = input.config && typeof input.config === "object" ? input.config : {};
  const config = Object.fromEntries(Object.entries(source).filter(([key]) => !FORM_LIVE_CONFIG_KEYS.includes(key)));
  const fields = Array.isArray(input.fields) ? input.fields : Array.isArray(source.fields) ? source.fields : [];
  return { fields, config };
}

function canonicalFormJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalFormJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalFormJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

// The draft matches what's published when its fields and every setting it carries are equal.
function draftMatchesPublished(draft: FormContent, published: ReturnType<typeof formatFormRecord>) {
  if (canonicalFormJson(draft.fields) !== canonicalFormJson(published.fields)) return false;
  return Object.entries(draft.config).every(([key, value]) => canonicalFormJson(value) === canonicalFormJson((published.config as Record<string, unknown>)[key]));
}

async function lockFormForUser(user: TenantUser, formId: string, client: Queryable) {
  const row = await queryOne<any>(`select ${FORM_COLUMNS} from "Form" where id = $1 and "tenantId" = $2 for update`, [formId, user.tenantId], client);
  if (!row) throw new Error("FORM_NOT_FOUND");
  if (row.deletedAt) throw new Error("FORM_ARCHIVED");
  return row;
}

export async function saveFormDraftForTenant(user: TenantUser, formId: string, input: Record<string, unknown>) {
  await assertFeatureEnabled(user.tenantId, "formBuilderEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  return withTransaction(user, async (client) => {
    const current = await lockFormForUser(user, formId, client);
    const content = formContentOf(input);
    const unchanged = Number(current.publishedVersion ?? 0) > 0 && draftMatchesPublished(content, formatFormRecord(current, 0));
    const row = await queryOne<any>(
      `update "Form" set draft = $1, "draftUpdatedAt" = $2, "draftUpdatedBy" = $3 where id = $4 and "tenantId" = $5 returning ${FORM_COLUMNS}`,
      [unchanged ? null : jsonbParam(content), unchanged ? null : new Date().toISOString(), unchanged ? null : user.id, formId, user.tenantId],
      client,
    );
    return formatFormRecord(row, 0);
  });
}

export async function discardFormDraftForTenant(user: TenantUser, formId: string) {
  await assertFeatureEnabled(user.tenantId, "formBuilderEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const row = await queryOne<any>(
    `update "Form" set draft = null, "draftUpdatedAt" = null, "draftUpdatedBy" = null
     where id = $1 and "tenantId" = $2 and "deletedAt" is null and "publishedVersion" > 0 returning ${FORM_COLUMNS}`,
    [formId, user.tenantId],
  );
  if (!row) throw new Error("FORM_NOT_FOUND");
  return formatFormRecord(row, 0);
}

// Publish: the draft's fields and settings become the public form, as the next version. Settings
// are merged onto the current config, so placements saved in the meantime are kept.
export async function publishFormForTenant(user: TenantUser, formId: string, notes?: string | null) {
  await assertFeatureEnabled(user.tenantId, "formBuilderEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  return withTransaction(user, async (client) => {
    const current = await lockFormForUser(user, formId, client);
    const version = Number(current.publishedVersion ?? 0) + 1;
    if (!current.draft && version > 1) throw new Error("FORM_NOTHING_TO_PUBLISH");
    const content = current.draft ? formContentOf(current.draft) : formContentOf(formatFormRecord(current, 0));
    if (!content.fields.length) throw new Error("FORM_HAS_NO_FIELDS");
    const stored = current.config && typeof current.config === "object" ? current.config : {};
    const update: Record<string, unknown> = {
      fields: jsonbParam(content.fields),
      config: jsonbParam({ ...stored, ...content.config }),
      draft: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      publishedVersion: version,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    for (const key of FORM_CONFIG_COLUMNS) if (key in content.config) update[key] = content.config[key];
    const row = await updateReturning<any>("Form", update, `where id = $1 and "tenantId" = $2`, [formId, user.tenantId], FORM_COLUMNS, client);
    await execute(
      `insert into "FormVersion" (id, "tenantId", "formId", version, name, fields, config, notes, "publishedBy", "publishedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      [randomUUID(), user.tenantId, formId, version, current.name, jsonbParam(content.fields), jsonbParam(content.config), notes?.trim() || null, user.id],
      client,
    );
    return formatFormRecord(row, 0);
  });
}

export async function listFormVersionsForTenant(user: TenantUser, formId: string) {
  await assertFeatureEnabled(user.tenantId, "formBuilderEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  return query<any>(
    `select v.version, v.notes, v."publishedAt", u.name as "publishedByName", jsonb_array_length(v.fields) as "fieldCount"
     from "FormVersion" v left join "User" u on u.id = v."publishedBy"
     where v."tenantId" = $1 and v."formId" = $2 order by v.version desc`,
    [user.tenantId, formId],
  );
}

export async function restoreFormVersionAsDraftForTenant(user: TenantUser, formId: string, version: number) {
  await assertFeatureEnabled(user.tenantId, "formBuilderEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const snapshot = await queryOne<any>(`select fields, config from "FormVersion" where "tenantId" = $1 and "formId" = $2 and version = $3`, [user.tenantId, formId, version]);
  if (!snapshot) throw new Error("FORM_VERSION_NOT_FOUND");
  return saveFormDraftForTenant(user, formId, { fields: snapshot.fields, config: snapshot.config });
}

export async function archiveFormForTenant(user: TenantUser, formId: string) {
  const tenant = tenantWhere(user, 2);
  const current = await queryOne<{ createdBy: string | null }>(`select "createdBy" from "Form" where id = $1 and ${tenant.sql} and "deletedAt" is null`, [formId, ...tenant.values]);
  if (!current) throw new Error("FORM_NOT_FOUND");
  assertCreatorOrAdmin(user, current.createdBy);
  const row = await queryOne<any>(
    `update "Form" set "deletedAt" = now(), "deletedBy" = $${tenant.values.length + 2}
     where id = $1 and ${tenant.sql} and "deletedAt" is null returning id, name, "deletedAt"`,
    [formId, ...tenant.values, user.id],
  );
  if (!row) throw new Error("FORM_NOT_FOUND");
  return { ...row, purgeAfter: new Date(new Date(row.deletedAt).getTime() + FORM_ARCHIVE_RETENTION_DAYS * 86_400_000).toISOString() };
}

export async function restoreFormForTenant(user: TenantUser, formId: string) {
  const tenant = tenantWhere(user, 2);
  const current = await queryOne<{ createdBy: string | null }>(`select "createdBy" from "Form" where id = $1 and ${tenant.sql} and "deletedAt" is not null`, [formId, ...tenant.values]);
  if (!current) throw new Error("FORM_NOT_FOUND");
  assertCreatorOrAdmin(user, current.createdBy);
  const row = await queryOne<any>(
    `update "Form" set "deletedAt" = null, "deletedBy" = null, "updatedAt" = now()
     where id = $1 and ${tenant.sql} and "deletedAt" is not null returning ${FORM_COLUMNS}`,
    [formId, ...tenant.values],
  );
  if (!row) throw new Error("FORM_NOT_FOUND");
  return formatFormRecord(row, 0);
}

// Permanent delete, only for an archived form; its submissions go with it.
export async function deleteFormForTenant(user: TenantUser, formId: string) {
  const tenant = tenantWhere(user, 2);
  const existing = await queryOne<any>(`select id, "deletedAt", "createdBy" from "Form" where id = $1 and ${tenant.sql}`, [formId, ...tenant.values]);
  if (!existing) throw new Error("FORM_NOT_FOUND");
  assertCreatorOrAdmin(user, existing.createdBy);
  if (!existing.deletedAt) throw new Error("FORM_NOT_ARCHIVED");
  await execute(`delete from "Form" where id = $1 and ${tenant.sql} and "deletedAt" is not null`, [formId, ...tenant.values]);
}

// Worker: removes forms archived more than FORM_ARCHIVE_RETENTION_DAYS ago (all workspaces).
export async function purgeArchivedForms(limit = 200) {
  const rows = await queryAsSystem<{ id: string }>(
    `delete from "Form" where id in (
       select id from "Form" where "deletedAt" < now() - make_interval(days => $1) order by "deletedAt" limit $2
     ) returning id`,
    [FORM_ARCHIVE_RETENTION_DAYS, limit],
  );
  return rows.length;
}

// Public links, public submissions and progress beacons: an archived form is unknown.
async function getPublicFormRow(identifier: string) {
  return queryOne<any>(
    `select ${FORM_COLUMNS}, "tenantId" from "Form" where id = $1 and "deletedAt" is null limit 1`,
    [identifier],
  );
}

export async function getPublicForm(identifier: string) {
  const form = await getPublicFormRow(identifier);
  if (!form) return null;
  // A public link for a tenant whose Forms module is off behaves like an unknown form (submission
  // is refused the same way in submitPublicForm).
  if (form.tenantId && !(await isFeatureEnabledForTenant(form.tenantId, "formBuilderEnabled"))) return null;
  const formatted = formatFormRecord(form, 0);
  if (form.tenantId && !(await isFeatureEnabledForTenant(form.tenantId, "opportunityEnabled"))) {
    const fields = Array.isArray(formatted.config?.fields) ? formatted.config.fields : [];
    formatted.config = { ...formatted.config, fields: fields.filter((field: any) => field?.sourceModule !== "opportunity") };
  }
  return formatted;
}

// Drop-off telemetry: beaconed by the public renderer on mount and on every tab/step change
// (see public-form-renderer.tsx), completely separate from FormSubmission -- this is the
// only signal anywhere of how far a real visitor got before abandoning a multi-tab form.
// Best-effort by design: a lost beacon should never surface as an error to a real visitor.
export async function recordFormProgressEvent(identifier: string, input: { sessionId: string; tabId: string; tabIndex: number }) {
  const formRow = await getPublicFormRow(identifier);
  if (!formRow || !formRow.tenantId) return;
  if (!(await isFeatureEnabledForTenant(formRow.tenantId, "formBuilderEnabled"))) return;
  if (!input.sessionId || !input.tabId) return;
  await execute(
    `insert into "FormProgressEvent" (id, "tenantId", "formId", "sessionId", "tabId", "tabIndex", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), formRow.tenantId, formRow.id, input.sessionId.slice(0, 200), input.tabId.slice(0, 200), Math.max(0, Math.trunc(input.tabIndex) || 0), new Date().toISOString()],
  ).catch(() => undefined);
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
    await assertFeatureEnabled(tenantId, "formBuilderEnabled");
    const user = { id: "public-form", tenantId };
    // No real logged-in user submits a public form; resolve a real actor once so the
    // AuditLog/Activity writes below (which require a real "User" row, see
    // resolveFormActorId's comment) have someone real to attribute to.
    const actorId = await resolveFormActorId(tenantId, formRow, client);
    const context = payload._context && typeof payload._context === "object" ? (payload._context as Record<string, unknown>) : {};
    const moduleData = splitFormPayloadByModule(form, payload);
    const leadData = { ...payload, ...moduleData.lead };
    const warnings: string[] = [];

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
        // The tenant's first Open status (tenant-configurable, UI/UX plan decision 6).
        status: await resolveLeadStatusForWrite(tenantId, null, null, client),
        score: 0,
        tags: [],
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      }, 'id, name, email, phone, company, source, status, score, tags, "createdBy", "createdAt", "updatedAt", "ownerId"', client);
      leadId = createdLead.id;

      await createFormAuditLog(tenantId, actorId, "CREATE", "LEAD", createdLead.id, createdLead, client);
      const leadDistribution = await distributeRecord(user, "LEAD", createdLead.id, createdLead).catch(() => null);
      const leadWithOwner = leadDistribution?.assignedUserId ? { ...createdLead, ownerId: leadDistribution.assignedUserId } : createdLead;
      await runAutomationsForEvent({ id: actorId ?? "public-form", tenantId }, "LEAD_CREATED", "LEAD", createdLead.id, leadWithOwner).catch(() => undefined);
    } else if (form.config?.duplicateAction === "UPDATE") {
      const updatePayload: Record<string, unknown> = { updatedAt: now };
      for (const key of ["name", "email", "phone", "company", "source", "status"]) {
        if (leadData[key] !== undefined && leadData[key] !== "") updatePayload[key] = leadData[key];
      }
      // A submitted status must be one of the tenant's statuses; an unknown one is ignored so a
      // public submission never fails over it.
      if (updatePayload.status !== undefined) {
        const resolved = await resolveLeadStatusForWrite(tenantId, updatePayload.status, null, client).catch(() => null);
        if (resolved) updatePayload.status = resolved;
        else delete updatePayload.status;
      }
      await updateReturning("Lead", updatePayload, 'where "tenantId" = $1 and id = $2', [tenantId, leadId], "id", client);
    }

    // Unauthenticated public submit -- the only real enforcement boundary for a
    // tenant-disabled Opportunities module here, since the builder/placement UI only
    // hides this cosmetically for authenticated authors.
    const opportunityModuleEnabled = await isFeatureEnabledForTenant(tenantId, "opportunityEnabled");
    const opportunityResult = opportunityModuleEnabled
      ? await upsertOpportunityFromFormModule({
          tenantId,
          leadId,
          opportunityId: typeof context.opportunityId === "string" ? context.opportunityId : null,
          actorId,
          data: moduleData.opportunity,
          client,
        })
      : {
          id: null as string | null,
          warning: Object.keys(moduleData.opportunity ?? {}).length
            ? "Opportunities is disabled for this tenant; opportunity data on this form was not saved."
            : undefined,
        };
    const opportunityId = opportunityResult.id;
    if (opportunityResult.warning) warnings.push(opportunityResult.warning);

    const activityResult = await upsertActivityFromFormModule({
      tenantId,
      leadId,
      activityId: typeof context.activityId === "string" ? context.activityId : null,
      opportunityId,
      actorId,
      data: moduleData.activity,
      client,
    });
    if (activityResult.warning) warnings.push(activityResult.warning);

    await upsertTaskFromFormModule({
      tenantId,
      leadId,
      opportunityId,
      activityId: typeof context.activityId === "string" ? context.activityId : null,
      ownerId: typeof context.ownerId === "string" ? context.ownerId : await resolveLeadOwnerId(tenantId, leadId, client),
      actorId,
      data: moduleData.task,
      client,
    });

    const utmParams = Object.fromEntries(Object.entries(payload).filter(([key]) => key.startsWith("utm_")));
    await insertReturning("FormSubmission", {
      id: randomUUID(),
      tenantId,
      formId: form.id,
      leadId,
      opportunityId,
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

    if (Object.keys(utmParams).length && leadId) {
      await recordAttributionTouch(user, {
        recordType: "LEAD",
        recordId: leadId,
        source: typeof utmParams.utm_source === "string" ? utmParams.utm_source : null,
        medium: typeof utmParams.utm_medium === "string" ? utmParams.utm_medium : null,
        campaign: typeof utmParams.utm_campaign === "string" ? utmParams.utm_campaign : null,
        channel: "FORM_SUBMISSION",
        metadata: { formId: form.id },
      }).catch(() => undefined);
    }

    return { success: true, leadId, opportunityId, warnings };
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
      // Opportunity Type is now resolved purely from the real, end-user-facing selector field's
      // submitted value (mapping "opportunity.opportunityTypeId", handled by the basic mapping
      // resolution above) -- authoring-time `field.opportunityTypeId` tags are scoped to the
      // builder canvas only and must never leak into the runtime-selected type.
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
  actorId: string | null;
  data: Record<string, unknown>;
  client?: Queryable;
}): Promise<{ id: string | null; warning?: string }> {
  if (!input.leadId || Object.keys(input.data).length === 0) return { id: null };
  if (input.opportunityId) {
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ["title", "amount", "expectedCloseDate", "priority", "stageId", "opportunityTypeId"]) {
      if (input.data[key] !== undefined && input.data[key] !== "") updatePayload[key] = key === "amount" ? Number(input.data[key]) : input.data[key];
    }
    await updateReturning("Opportunity", updatePayload, 'where "tenantId" = $1 and id = $2', [input.tenantId, input.opportunityId], "id", input.client);
    return { id: input.opportunityId };
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
  if (types.length === 0) {
    return { id: null, warning: "The Lead was created, but no Opportunity could be added: this tenant has no active Opportunity Type configured." };
  }
  const selectedType = input.data.opportunityTypeId ? types.find((type: any) => type.id === input.data.opportunityTypeId) : types[0];
  if (!selectedType?.id) {
    return { id: null, warning: "The Lead was created, but no Opportunity could be added: the selected Opportunity Type is no longer active." };
  }

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
  }, "*", input.client);

  await createFormAuditLog(input.tenantId, input.actorId, "CREATE", "OPPORTUNITY", opportunity.id, opportunity, input.client);
  const distribution = await distributeRecord(user, "OPPORTUNITY", opportunity.id, opportunity).catch(() => null);
  const opportunityWithOwner = distribution?.assignedUserId ? { ...opportunity, ownerId: distribution.assignedUserId } : opportunity;
  await runAutomationsForEvent({ id: input.actorId ?? "public-form", tenantId: input.tenantId }, "OPPORTUNITY_CREATED", "OPPORTUNITY", opportunity.id, opportunityWithOwner).catch(() => undefined);

  return { id: opportunity.id as string };
}

async function upsertActivityFromFormModule(input: {
  tenantId: string;
  leadId: string | null;
  activityId: string | null;
  opportunityId: string | null;
  actorId: string | null;
  data: Record<string, unknown>;
  client?: Queryable;
}): Promise<{ id: string | null; warning?: string }> {
  if (!input.leadId || Object.keys(input.data).length === 0) return { id: null };
  if (input.activityId) {
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ["typeId", "outcome", "notes", "dueAt", "opportunityId"]) {
      const value = key === "opportunityId" ? input.opportunityId : input.data[key];
      if (value !== undefined && value !== "") updatePayload[key] = value;
    }
    await updateReturning("Activity", updatePayload, 'where "tenantId" = $1 and id = $2', [input.tenantId, input.activityId], "id", input.client);
    return { id: input.activityId };
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
  if (!type?.id) return { id: null };

  // "Activity"."createdBy" is NOT NULL with a foreign key to a real "User" row -- unlike
  // Lead/Opportunity/Task, it cannot be left null for a public submission with no resolvable
  // actor (see resolveFormActorId). Skip creating the Activity rather than violate the constraint.
  if (!input.actorId) {
    return { id: null, warning: "Could not create an Activity from this submission: this tenant has no active user to attribute it to." };
  }

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
    createdBy: input.actorId,
    createdAt: now,
    updatedAt: now,
  }, "*", input.client);

  await createFormAuditLog(input.tenantId, input.actorId, "CREATE", "ACTIVITY", activity.id, activity, input.client);
  const automationUser = { id: input.actorId, tenantId: input.tenantId };
  await runAutomationsForEvent(automationUser, "ACTIVITY_CREATED", "ACTIVITY", activity.id, activity).catch(() => undefined);
  if (activity.opportunityId) {
    await runAutomationsForEvent(automationUser, "ACTIVITY_CREATED_ON_OPPORTUNITY", "ACTIVITY", activity.id, activity).catch(() => undefined);
  }

  return { id: activity.id as string };
}

async function upsertTaskFromFormModule(input: {
  tenantId: string;
  leadId: string | null;
  opportunityId: string | null;
  activityId: string | null;
  ownerId: string | null;
  actorId: string | null;
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
    createdBy: input.actorId,
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
  }, "*", input.client);

  await createFormAuditLog(input.tenantId, input.actorId, "CREATE", "TASK", task.id, task, input.client);
  // Mirrors emitTaskAutomation's exact naming/behavior (tasks-postgres.ts): both events fire
  // independently when a Task is linked to both an Opportunity and its parent Lead.
  const automationUser = { id: input.actorId ?? "public-form", tenantId: input.tenantId };
  const baseRecord = { ...task, taskId: task.id, leadId: task.leadId ?? null, opportunityId: task.opportunityId ?? null, activityId: task.activityId ?? null };
  if (task.opportunityId) {
    await runAutomationsForEvent(automationUser, "TASK_CREATED_ON_OPPORTUNITY", "TASK", task.id, baseRecord).catch(() => undefined);
  }
  if (task.leadId) {
    await runAutomationsForEvent(automationUser, "TASK_CREATED_ON_LEAD", "TASK", task.id, baseRecord).catch(() => undefined);
  }

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
  // Every submission (complete data): the reader returns at most 100 per call, so page through.
  const rows: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getFormSubmissionsForTenant(user, formId, 100, offset);
    rows.push(...page.submissions);
    if (page.submissions.length < 100) break;
  }
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

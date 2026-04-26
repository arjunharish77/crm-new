import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { distributeRecord } from "@/lib/server/distribution-engine";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  role?: { permissions?: any } | string | null;
};

type ActivityFilterCondition = {
  field: string;
  operator?: string;
  value: string | number | boolean | null;
};

type ActivityFilterConfig = {
  conditions?: ActivityFilterCondition[];
  logic?: "AND" | "OR";
};

type NoteEntityType = "LEAD" | "OPPORTUNITY" | "ACTIVITY";

type DashboardWidgetInput = {
  title: string;
  type: string;
  config: Record<string, unknown>;
  layout?: {
    w?: number;
    h?: number;
    x?: number;
    y?: number;
  };
};

type SavedViewInput = {
  name: string;
  module: string;
  filters: Record<string, unknown>;
  isDefault?: boolean;
  isShared?: boolean;
};

type LeadListInput = {
  name?: string;
  description?: string | null;
  type?: "STATIC" | "SMART";
  filters?: LeadFilterInput[] | null;
  leadIds?: string[];
};

type ImportModule = "LEAD" | "OPPORTUNITY" | "ACTIVITY";

type ImportMapping = {
  source: string;
  target: string;
};

type ImportInput = {
  module?: string;
  rows?: Record<string, unknown>[];
  mappings?: ImportMapping[];
  duplicateMode?: "SKIP" | "UPDATE" | "CREATE";
};

type WebhookInput = {
  name?: string;
  url?: string;
  events?: string[];
  secret?: string;
  isActive?: boolean;
};

type GlobalSearchResults = {
  leads: Array<{ id: string; type: "lead"; name: string; company: string | null }>;
  opportunities: Array<{ id: string; type: "opportunity"; title: string; amount: number | null }>;
  activities: Array<{ id: string; type: "activity"; notes: string | null }>;
};

async function createAuditLog(
  user: TenantUser,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  diff: Record<string, unknown> | null
) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("AuditLog").insert({
    id: randomUUID(),
    tenantId: user.tenantId,
    userId: user.id,
    action,
    entityType,
    entityId,
    before,
    after,
    diff,
    metadata: null,
    createdAt: now,
  });

  if (error) {
    throw error;
  }
}

const AUDIT_SKIP_FIELDS = new Set([
  "tenantId",
  "objectId",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deletedBy",
  "hash",
  "type",
  "user",
  "lead",
  "opportunity",
  "duration",
  "assignedUserId",
]);

function auditValuesEqual(before: unknown, after: unknown) {
  return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
}

function buildFieldDiff(before: Record<string, any> | null, after: Record<string, any> | null) {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (AUDIT_SKIP_FIELDS.has(key)) continue;
    const beforeValue = before?.[key] ?? null;
    const afterValue = after?.[key] ?? null;
    if (!auditValuesEqual(beforeValue, afterValue)) {
      diff[key] = { before: beforeValue, after: afterValue };
    }
  }
  return diff;
}

function fieldPermissionMap(user: TenantUser, module: "leads" | "opportunities" | "activities") {
  const role = user.role && typeof user.role === "object" ? user.role : null;
  const permissions = role?.permissions?.fieldPermissions?.[module];
  return permissions && typeof permissions === "object" ? permissions as Record<string, string> : {};
}

function maskFieldsForUser<T extends Record<string, any>>(user: TenantUser, module: "leads" | "opportunities" | "activities", record: T): T {
  const permissions = fieldPermissionMap(user, module);
  const masked: Record<string, any> = { ...record };
  for (const [field, access] of Object.entries(permissions)) {
    if (access === "hidden" && field in masked) {
      masked[field] = null;
      masked[`${field}Hidden`] = true;
    }
  }
  return masked as T;
}

function editablePayloadForUser(user: TenantUser, module: "leads" | "opportunities" | "activities", payload: Record<string, unknown>) {
  const permissions = fieldPermissionMap(user, module);
  const next = { ...payload };
  for (const [field, access] of Object.entries(permissions)) {
    if ((access === "hidden" || access === "readonly") && field in next) {
      delete next[field];
    }
  }
  return next;
}

function normalizeEntityType(entityType: string) {
  return entityType.toUpperCase() as NoteEntityType;
}

function valueAtPath(record: Record<string, unknown>, field: string) {
  const parts = field.split(".");
  if (parts.length > 1) {
    const scoped = parts[0].toUpperCase();
    if (!record[parts[0]] && ["LEAD", "OPPORTUNITY", "ACTIVITY"].includes(scoped)) {
      return valueAtPath(record, parts.slice(1).join("."));
    }
  }
  return field.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, record);
}

function automationConditionMatches(record: Record<string, unknown>, nodeData: Record<string, unknown>): boolean {
  const conditions = Array.isArray(nodeData.conditions) ? nodeData.conditions : [];
  if (conditions.length > 0) {
    const logic = String(nodeData.conditionLogic ?? nodeData.logic ?? "AND").toUpperCase();
    const checks: boolean[] = conditions.map((condition) => automationConditionMatches(record, condition as Record<string, unknown>));
    return logic === "OR" ? checks.some(Boolean) : checks.every(Boolean);
  }

  const actual = valueAtPath(record, String(nodeData.field ?? ""));
  const expected = nodeData.value;
  const operator = String(nodeData.operator ?? "equals");

  if (!nodeData.field) return true;
  if (operator === "contains_data") return actual !== undefined && actual !== null && String(actual).length > 0;
  if (operator === "not_contains_data") return actual === undefined || actual === null || String(actual).length === 0;
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "greater_than") return Number(actual) > Number(expected);
  if (operator === "less_than") return Number(actual) < Number(expected);
  if (operator === "before") return new Date(String(actual)).getTime() < new Date(String(expected)).getTime();
  if (operator === "after") return new Date(String(actual)).getTime() > new Date(String(expected)).getTime();
  return String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
}

function automationBranchLabelForNode(record: Record<string, unknown>, nodeData: Record<string, unknown>, edgeCount = 0) {
  const nodeType = String(nodeData.type ?? "");

  if (nodeType === "split_test") {
    if (edgeCount <= 0) return null;
    const index = Math.floor(Math.random() * edgeCount);
    return `__index:${index}`;
  }

  if (nodeType === "multi_if_else") {
    const primaryMatched = automationConditionMatches(record, nodeData);
    if (primaryMatched) return "if 1";

    const branchSource = nodeData.branches ?? nodeData.branchesJson;
    let branches: Array<Record<string, unknown>> = [];
    if (Array.isArray(branchSource)) {
      branches = branchSource as Array<Record<string, unknown>>;
    } else if (typeof branchSource === "string" && branchSource.trim()) {
      try {
        const parsed = JSON.parse(branchSource);
        branches = Array.isArray(parsed) ? parsed : [];
      } catch {
        branches = [];
      }
    }

    const matchedIndex = branches.findIndex((branch) => automationConditionMatches(record, branch));
    return matchedIndex >= 0 ? `else if ${matchedIndex + 1}` : "else";
  }

  return automationConditionMatches(record, nodeData) ? "yes" : "no";
}

function automationNextEdges(edges: any[], nodeId: string, record: Record<string, unknown>, nodeData: Record<string, unknown>) {
  const nextEdges = edges.filter((edge) => edge.source === nodeId);
  const nodeType = String(nodeData.type ?? "");
  if (!["condition", "if_else", "compare", "multi_if_else", "split_test"].includes(nodeType)) return nextEdges;

  const branchLabel = automationBranchLabelForNode(record, nodeData, nextEdges.length);
  if (branchLabel?.startsWith("__index:")) {
    const index = Number(branchLabel.replace("__index:", ""));
    return nextEdges[index] ? [nextEdges[index]] : [];
  }

  const preferred = nextEdges.filter((edge) => {
    const label = String(edge.label ?? edge.sourceHandle ?? "").toLowerCase();
    if (!branchLabel) return false;
    if (branchLabel === "else") return label === "else" || label === "no" || label === "false";
    return label === branchLabel || label.startsWith(branchLabel);
  });

  return preferred.length ? preferred : nextEdges;
}

function automationDelayDate(nodeData: Record<string, unknown>) {
  const duration = Math.max(1, Number(nodeData.duration ?? 1));
  const unit = String(nodeData.unit ?? "hours");
  const multiplier = unit === "days" ? 24 * 60 * 60 * 1000 : unit === "minutes" ? 60 * 1000 : 60 * 60 * 1000;
  return new Date(Date.now() + duration * multiplier);
}

async function automationWaitUntilActivitySatisfied(
  user: TenantUser,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  nodeData: Record<string, unknown>
) {
  if (!user.tenantId) return false;
  const supabase = createSupabaseAdminClient();
  const typeId = String(nodeData.activityTypeId ?? nodeData.typeId ?? "");
  const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
  const opportunityId = entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "");

  let query = supabase.from("Activity").select("id").eq("tenantId", user.tenantId).limit(1);
  if (typeId) query = query.eq("typeId", typeId);
  if (opportunityId) query = query.eq("opportunityId", opportunityId);
  else if (leadId) query = query.eq("leadId", leadId);
  else return false;

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return !!data?.id;
}

function triggerMatches(trigger: Record<string, unknown>, eventType: string, record: Record<string, unknown>) {
  if (String(trigger.type ?? "MANUAL") !== eventType) return false;
  if (trigger.opportunityTypeId && String(record.opportunityTypeId ?? "") !== String(trigger.opportunityTypeId)) return false;
  if (trigger.activityTypeId && String(record.typeId ?? "") !== String(trigger.activityTypeId)) return false;
  const conditions = Array.isArray(trigger.conditions) ? trigger.conditions : [];
  return conditions.every((condition) => automationConditionMatches(record, condition as Record<string, unknown>));
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
    _count: {
      submissions: submissionCount,
    },
  };
}

async function getObjectId(user: TenantUser, objectName: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("ObjectDefinition")
    .select("id")
    .eq("name", objectName)
    .limit(1);

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    const supportedObjects = new Map([
      ["lead", "Lead"],
      ["opportunity", "Opportunity"],
      ["activity", "Activity"],
    ]);
    const label = supportedObjects.get(objectName);

    if (!label) {
      throw new Error(`Missing object definition for ${objectName}`);
    }

    const { data: created, error: createError } = await supabase
      .from("ObjectDefinition")
      .insert({
        id: randomUUID(),
        tenantId: user.tenantId,
        name: objectName,
        label,
        isCustom: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createError || !created?.id) {
      throw createError ?? new Error(`Missing object definition for ${objectName}`);
    }

    return created.id;
  }

  return data.id;
}

type LeadFilterCondition = {
  field?: string;
  operator?: string;
  value?: unknown;
};

type LeadFilterInput =
  | LeadFilterCondition
  | {
      logic?: "AND" | "OR";
      conditions?: LeadFilterCondition[];
    };

function applyLeadFilters(query: any, filters: LeadFilterInput[] | null) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return query;
  }

  let scopedQuery = query;

  for (const group of filters) {
    const conditions: LeadFilterCondition[] =
      "conditions" in group && Array.isArray(group.conditions)
        ? group.conditions
        : [group as LeadFilterCondition];

    for (const condition of conditions) {
      if (!condition?.field) {
        continue;
      }

      const operator = condition.operator ?? "equals";
      const value = condition.value;

      if (operator === "equals") {
        scopedQuery = scopedQuery.eq(condition.field, value as never);
      } else if (operator === "not_equals") {
        scopedQuery = scopedQuery.neq(condition.field, value as never);
      } else if (operator === "contains" && typeof value === "string") {
        scopedQuery = scopedQuery.ilike(condition.field, `%${value}%`);
      } else if (operator === "greater_than") {
        scopedQuery = scopedQuery.gt(condition.field, value as never);
      } else if (operator === "less_than") {
        scopedQuery = scopedQuery.lt(condition.field, value as never);
      }
    }
  }

  return scopedQuery;
}

function normalizeLeadListFilters(filters: unknown): LeadFilterInput[] {
  if (Array.isArray(filters)) return filters as LeadFilterInput[];
  if (filters && typeof filters === "object" && Array.isArray((filters as any).conditions)) {
    return [(filters as any) as LeadFilterInput];
  }
  return [];
}

export async function listLeadsForTenant(
  user: TenantUser,
  page: number,
  limit: number,
  filters: LeadFilterInput[] | null = null
) {
  const supabase = createSupabaseAdminClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const query = supabase
    .from("Lead")
    .select("id,name,email,phone,company,source,status,score,tags,createdBy,createdAt,updatedAt,ownerId", {
      count: "exact",
    })
    .order("createdAt", { ascending: false })
    .range(from, to);

  const tenantScopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const filteredQuery = applyLeadFilters(tenantScopedQuery, filters);
  const { data, count, error } = await filteredQuery;

  if (error) {
    throw error;
  }

  return {
    data: (data ?? []).map((lead: any) => maskFieldsForUser(user, "leads", {
      ...lead,
      assignedUserId: lead.ownerId ?? null,
    })),
    meta: {
      total: count ?? 0,
      page,
      last_page: Math.max(1, Math.ceil((count ?? 0) / limit)),
      limit,
    },
  };
}

export async function createLeadForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  try {
    const objectId = await getObjectId(user, "lead");
    const now = new Date().toISOString();

    const insertPayload = {
      id: randomUUID(),
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      company: payload.company || null,
      source: payload.source || null,
      status: payload.status || "NEW",
      tenantId: user.tenantId,
      createdBy: user.id,
      objectId,
      score: 0,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    const { data, error } = await supabase
      .from("Lead")
      .insert(insertPayload)
      .select("id,name,email,phone,company,source,status,score,tags,createdBy,createdAt,updatedAt,ownerId")
      .single();

    if (error) {
      throw new Error(`LEAD_INSERT_FAILED: ${error.message}`);
    }

    const lead = {
      ...data,
      assignedUserId: data.ownerId ?? null,
    };

    await createAuditLog(user, "CREATE", "LEAD", lead.id, null, lead, null);
    const distribution = user.tenantId
      ? await distributeRecord(user, "LEAD", lead.id, { ...insertPayload, ...lead })
      : null;
    if (user.tenantId) {
      await runAutomationsForEvent(user, "LEAD_CREATED", "LEAD", lead.id, { ...insertPayload, ...lead });
    }

    return {
      ...lead,
      ownerId: distribution?.assignedUserId ?? lead.ownerId ?? null,
      assignedUserId: distribution?.assignedUserId ?? lead.assignedUserId ?? null,
      distribution,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`CREATE_LEAD_FAILED: ${error.message}`);
    }

    throw error;
  }
}

export async function getLeadForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("Lead")
    .select("id,name,email,phone,company,source,status,score,tags,createdBy,createdAt,updatedAt,ownerId")
    .eq("id", id);

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return maskFieldsForUser(user, "leads", {
    ...data,
    assignedUserId: data.ownerId ?? null,
  });
}

export async function updateLeadForTenant(
  user: TenantUser,
  id: string,
  payload: Record<string, unknown>
) {
  const supabase = createSupabaseAdminClient();
  const existing = await getLeadForTenant(user, id);
  const editablePayload = editablePayloadForUser(user, "leads", payload);

  if (!existing) {
    return null;
  }

  const updatePayload = {
    name: editablePayload.name,
    email: editablePayload.email || null,
    phone: editablePayload.phone || null,
    company: editablePayload.company || null,
    source: editablePayload.source || null,
    status: editablePayload.status || existing.status,
    ownerId: editablePayload.ownerId || null,
  };

  const scopedQuery = user.tenantId
    ? supabase.from("Lead").update(updatePayload).eq("tenantId", user.tenantId).eq("id", id)
    : supabase.from("Lead").update(updatePayload).is("tenantId", null).eq("id", id);

  const { data, error } = await scopedQuery
    .select("id,name,email,phone,company,source,status,score,tags,createdBy,createdAt,updatedAt,ownerId")
    .single();

  if (error) {
    throw error;
  }

  const lead = {
    ...data,
    assignedUserId: data.ownerId ?? null,
  };

  const diff = buildFieldDiff(existing as Record<string, any>, data as Record<string, any>);

  await createAuditLog(
    user,
    "UPDATE",
    "LEAD",
    lead.id,
    existing,
    lead,
    Object.keys(diff).length > 0 ? diff : null
  );
  if (user.tenantId) {
    await runAutomationsForEvent(user, "LEAD_UPDATED", "LEAD", lead.id, lead);
  }

  return maskFieldsForUser(user, "leads", lead);
}

export async function deleteLeadsForTenant(user: TenantUser, ids: string[]) {
  if (ids.length === 0) {
    return 0;
  }

  const supabase = createSupabaseAdminClient();
  const scopedDelete = user.tenantId
    ? supabase.from("Lead").delete().eq("tenantId", user.tenantId).in("id", ids)
    : supabase.from("Lead").delete().is("tenantId", null).in("id", ids);

  const { error } = await scopedDelete;
  if (error) {
    throw error;
  }

  return ids.length;
}

export async function listOpportunityTypesForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const typesQuery = supabase
    .from("OpportunityType")
    .select("id,tenantId,name,description,icon,color,order,isActive")
    .order("order", { ascending: true });

  const scopedTypesQuery = user.tenantId
    ? typesQuery.eq("tenantId", user.tenantId)
    : typesQuery.is("tenantId", null);

  const { data: types, error: typeError } = await scopedTypesQuery;

  if (typeError) {
    throw typeError;
  }

  const { data: stages, error: stageError } = await (user.tenantId
    ? supabase
        .from("StageDefinition")
        .select("id,tenantId,opportunityTypeId,name,order,probability,color,isClosed,isWon")
        .eq("tenantId", user.tenantId)
        .order("order", { ascending: true })
    : supabase
        .from("StageDefinition")
        .select("id,tenantId,opportunityTypeId,name,order,probability,color,isClosed,isWon")
        .is("tenantId", null)
        .order("order", { ascending: true }));

  if (stageError) {
    throw stageError;
  }

  return (types ?? []).map((type) => ({
    ...type,
    stages: (stages ?? [])
      .filter((stage) => stage.opportunityTypeId === type.id)
      .map((stage) => ({
        ...stage,
        label: stage.name,
      })),
  }));
}

export async function listObjectDefinitionsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("ObjectDefinition")
    .select("id,name,label,description,isCustom,createdAt,updatedAt")
    .order("label", { ascending: true });

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listOpportunitiesForTenant(user: TenantUser, limit: number) {
  return listOpportunitiesForTenantByType(user, limit, null);
}

export async function listOpportunitiesForTenantByType(user: TenantUser, limit: number, opportunityTypeId: string | null) {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("Opportunity")
    .select("id,tenantId,objectId,leadId,opportunityTypeId,stageId,title,amount,expectedCloseDate,priority,tags,ownerId,createdAt,updatedAt")
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (opportunityTypeId) {
    query = query.eq("opportunityTypeId", opportunityTypeId);
  }

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data: opportunities, error } = await scopedQuery;

  if (error) {
    throw error;
  }

  const [types, leads] = await Promise.all([
    listOpportunityTypesForTenant(user),
    listLeadsForTenant(user, 1, 200),
  ]);

  const stageMap = new Map(
    types.flatMap((type: any) => (type.stages ?? []).map((stage: any) => [stage.id, stage]))
  );
  const typeMap = new Map(types.map((type: any) => [type.id, type]));
  const leadMap = new Map(leads.data.map((lead: any) => [lead.id, lead]));

  return {
    data: (opportunities ?? []).map((opportunity: any) => maskFieldsForUser(user, "opportunities", {
      ...opportunity,
      tags: opportunity.tags ?? [],
      lead: leadMap.get(opportunity.leadId) ?? null,
      opportunityType: typeMap.get(opportunity.opportunityTypeId),
      stage: stageMap.get(opportunity.stageId),
    })),
    meta: {
      total: opportunities?.length ?? 0,
      page: 1,
      last_page: 1,
      limit,
    },
  };
}

export async function getOpportunityForTenant(user: TenantUser, id: string) {
  const opportunities = await listOpportunitiesForTenant(user, 500);
  return opportunities.data.find((opportunity) => opportunity.id === id) ?? null;
}

export async function createOpportunityForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  try {
    const objectId = await getObjectId(user, "opportunity");
    const types = await listOpportunityTypesForTenant(user);
    const now = new Date().toISOString();
    const selectedType = types.find((type) => type.id === payload.opportunityTypeId);
    const stageId =
      (payload.stageId as string | undefined) ??
      selectedType?.stages?.[0]?.id;

    const insertPayload = {
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId,
      leadId: payload.leadId,
      opportunityTypeId: payload.opportunityTypeId,
      stageId,
      title: payload.title,
      amount: payload.amount || null,
      expectedCloseDate: payload.expectedCloseDate || null,
      priority: payload.priority || "MEDIUM",
      tags: [],
      ownerId: null,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };

    const { data, error } = await supabase
      .from("Opportunity")
      .insert(insertPayload)
      .select("id,tenantId,objectId,leadId,opportunityTypeId,stageId,title,amount,expectedCloseDate,priority,tags,ownerId,createdAt,updatedAt")
      .single();

    if (error) {
      throw new Error(`OPPORTUNITY_INSERT_FAILED: ${error.message}`);
    }

    const { error: historyError } = await supabase.from("OpportunityStageHistory").insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      opportunityId: data.id,
      fromStageId: null,
      toStageId: data.stageId,
      changedById: user.id,
      notes: null,
    });

    if (historyError) {
      throw new Error(`OPPORTUNITY_HISTORY_INSERT_FAILED: ${historyError.message}`);
    }

    await createAuditLog(user, "CREATE", "OPPORTUNITY", data.id, null, data, null);
    const distribution = user.tenantId
      ? await distributeRecord(user, "OPPORTUNITY", data.id, { ...insertPayload, ...data })
      : null;
    if (user.tenantId) {
      await runAutomationsForEvent(user, "OPPORTUNITY_CREATED", "OPPORTUNITY", data.id, data);
    }

    return {
      ...data,
      ownerId: distribution?.assignedUserId ?? data.ownerId ?? null,
      distribution,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`CREATE_OPPORTUNITY_FAILED: ${error.message}`);
    }

    throw error;
  }
}

export async function getOpportunityHistoryForTenant(user: TenantUser, opportunityId: string) {
  const supabase = createSupabaseAdminClient();

  const query = supabase
    .from("OpportunityStageHistory")
    .select("id,tenantId,opportunityId,fromStageId,toStageId,changedById,changedAt,notes")
    .eq("opportunityId", opportunityId)
    .order("changedAt", { ascending: false });

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data: history, error } = await scopedQuery;

  if (error) {
    throw error;
  }

  const [types, users] = await Promise.all([
    listOpportunityTypesForTenant(user),
    user.tenantId
      ? supabase.from("User").select("id,name,email").eq("tenantId", user.tenantId)
      : supabase.from("User").select("id,name,email").is("tenantId", null),
  ]);

  if (users.error) {
    throw users.error;
  }

  const stageMap = new Map(
    types.flatMap((type: any) =>
      (type.stages ?? []).map((stage: any) => [
        stage.id,
        { name: stage.name, label: stage.label ?? stage.name },
      ])
    )
  );
  const userMap = new Map((users.data ?? []).map((record: any) => [record.id, record]));

  return (history ?? []).map((item: any) => ({
    ...item,
    fromStage: item.fromStageId ? stageMap.get(item.fromStageId) ?? null : null,
    toStage: stageMap.get(item.toStageId) ?? { name: "Unknown", label: "Unknown" },
    changedBy: userMap.get(item.changedById) ?? { name: "Unknown User", email: "" },
  }));
}

function applyActivityFilters(query: any, filters: ActivityFilterConfig | null) {
  if (!filters?.conditions?.length) {
    return query;
  }

  let scopedQuery = query;

  for (const condition of filters.conditions) {
    if (!condition.field) {
      continue;
    }

    const operator = condition.operator ?? "equals";
    if (operator === "equals") {
      scopedQuery = scopedQuery.eq(condition.field, condition.value as never);
    } else if (operator === "contains" && typeof condition.value === "string") {
      scopedQuery = scopedQuery.ilike(condition.field, `%${condition.value}%`);
    }
  }

  return scopedQuery;
}

export async function listActivityTypesForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const coreTypes = [
    { name: "Call", icon: "Phone", color: "#3b82f6", defaultOutcome: "FOLLOW_UP_NEEDED", defaultSLA: 60, order: 0 },
    { name: "Email", icon: "Mail", color: "#8b5cf6", defaultOutcome: "SUCCESS", defaultSLA: 240, order: 1 },
    { name: "Meeting", icon: "Calendar", color: "#10b981", defaultOutcome: "SUCCESS", defaultSLA: 1440, order: 2 },
    { name: "Page Visit", icon: "Globe", color: "#0ea5e9", defaultOutcome: "SUCCESS", defaultSLA: null, order: 3 },
    { name: "Form Submitted", icon: "FileCheck", color: "#22c55e", defaultOutcome: "SUCCESS", defaultSLA: null, order: 4 },
    { name: "Automation Activity", icon: "Workflow", color: "#f97316", defaultOutcome: "SUCCESS", defaultSLA: null, order: 5 },
    { name: "Lead Captured", icon: "UserPlus", color: "#14b8a6", defaultOutcome: "SUCCESS", defaultSLA: null, order: 6 },
  ];
  const fetchTypes = async () => {
    const query = supabase
      .from("ActivityType")
      .select("id,name,icon,color,defaultOutcome,defaultSLA,isActive,createdAt,updatedAt")
      .order("order", { ascending: true });

    const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
    const { data, error } = await scopedQuery;

    if (error) {
      throw error;
    }

    return data ?? [];
  };

  let data = await fetchTypes();

  if (user.tenantId) {
    const activityObjectId = await getObjectId(user, "activity");
    const now = new Date().toISOString();
    const existingNames = new Set(data.map((item: any) => String(item.name).toLowerCase()));
    const missingTypes = coreTypes.filter((item) => !existingNames.has(item.name.toLowerCase()));
    if (missingTypes.length > 0) {
      const { error: seedError } = await supabase.from("ActivityType").insert(missingTypes.map((item) => ({
        id: randomUUID(),
        tenantId: user.tenantId,
        objectId: activityObjectId,
        name: item.name,
        icon: item.icon,
        color: item.color,
        defaultOutcome: item.defaultOutcome,
        defaultSLA: item.defaultSLA,
        order: item.order,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })));

      if (seedError) {
        throw seedError;
      }
      data = await fetchTypes();
    }
  }

  return data.map((item) => ({
    ...item,
    defaultSLA: item.defaultSLA ?? null,
    description: null,
  }));
}

async function ensureSystemActivityType(user: TenantUser, name: string, icon: string, color: string) {
  const supabase = createSupabaseAdminClient();
  const objectId = await getObjectId(user, "activity");
  const query = supabase.from("ActivityType").select("id,name").eq("name", name).limit(1);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id;

  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from("ActivityType")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId,
      name,
      icon,
      color,
      defaultOutcome: "SUCCESS",
      defaultSLA: null,
      order: 100,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

export async function listActivitiesForTenant(
  user: TenantUser,
  limit: number,
  filters: ActivityFilterConfig | null
) {
  const supabase = createSupabaseAdminClient();
  const baseQuery = supabase
    .from("Activity")
    .select("id,tenantId,typeId,leadId,opportunityId,outcome,notes,dueAt,completedAt,slaStatus,slaTarget,isRecurring,recurrenceRule,seriesId,createdAt,updatedAt,createdBy", {
      count: "exact",
    })
    .order("createdAt", { ascending: false })
    .limit(limit);

  const tenantScoped = user.tenantId ? baseQuery.eq("tenantId", user.tenantId) : baseQuery.is("tenantId", null);
  const filteredQuery = applyActivityFilters(tenantScoped, filters);
  const { data, count, error } = await filteredQuery;

  if (error) {
    throw error;
  }

  const [types, users, leads, opportunities] = await Promise.all([
    listActivityTypesForTenant(user),
    user.tenantId
      ? supabase.from("User").select("id,name,email").eq("tenantId", user.tenantId)
      : supabase.from("User").select("id,name,email").is("tenantId", null),
    listLeadsForTenant(user, 1, 500),
    listOpportunitiesForTenant(user, 500),
  ]);

  if (users.error) {
    throw users.error;
  }

  const typeMap = new Map(types.map((type: any) => [type.id, type]));
  const activityTypeLabelMap = new Map(types.map((type: any) => [type.id, type.name]));
  const userMap = new Map((users.data ?? []).map((record: any) => [record.id, record]));
  const leadMap = new Map(leads.data.map((record: any) => [record.id, record]));
  const opportunityMap = new Map(opportunities.data.map((record: any) => [record.id, record]));
  const opportunityStageLabelMap = new Map(
    opportunities.data
      .map((opportunity: any) => opportunity.stage)
      .filter(Boolean)
      .map((stage: any) => [stage.id, stage.label || stage.name || stage.id])
  );
  const opportunityTypeLabelMap = new Map(
    opportunities.data
      .map((opportunity: any) => opportunity.opportunityType)
      .filter(Boolean)
      .map((type: any) => [type.id, type.name])
  );
  const activityIds = (data ?? []).map((item: any) => item.id);
  const auditQuery = activityIds.length > 0
    ? supabase
      .from("AuditLog")
      .select("id,action,entityId,diff,before,after,createdAt,userId")
      .eq("entityType", "ACTIVITY")
      .in("entityId", activityIds)
      .order("createdAt", { ascending: false })
    : null;
  const scopedAuditQuery = auditQuery
    ? user.tenantId ? auditQuery.eq("tenantId", user.tenantId) : auditQuery.is("tenantId", null)
    : null;
  const auditResult = scopedAuditQuery ? await scopedAuditQuery : { data: [], error: null };
  if (auditResult.error) throw auditResult.error;
  const auditByActivityId = new Map<string, any[]>();
  for (const entry of auditResult.data ?? []) {
    const existingEntries = auditByActivityId.get(entry.entityId) ?? [];
    existingEntries.push({
      ...entry,
      user: userMap.get(entry.userId) ?? { name: "Unknown User", email: "" },
      valueLabels: {
        activityTypes: Object.fromEntries(activityTypeLabelMap),
        stages: Object.fromEntries(opportunityStageLabelMap),
        opportunityTypes: Object.fromEntries(opportunityTypeLabelMap),
      },
    });
    auditByActivityId.set(entry.entityId, existingEntries);
  }

  return {
    data: (data ?? []).map((item: any) => maskFieldsForUser(user, "activities", {
      ...item,
      duration: null,
      customFields: null,
      type: typeMap.get(item.typeId),
      user: userMap.get(item.createdBy) ?? null,
      lead: item.leadId ? leadMap.get(item.leadId) ?? null : null,
      opportunity: item.opportunityId ? opportunityMap.get(item.opportunityId) ?? null : null,
      auditEvents: auditByActivityId.get(item.id) ?? [],
    })),
    meta: {
      total: count ?? 0,
      page: 1,
      last_page: 1,
      limit,
    },
  };
}

export async function createActivityForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  try {
    const objectId = await getObjectId(user, "activity");
    const now = new Date().toISOString();

    const insertPayload = {
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId,
      typeId: payload.typeId,
      leadId: payload.leadId || null,
      opportunityId: payload.opportunityId || null,
      outcome: payload.outcome || null,
      notes: payload.notes || null,
      dueAt: payload.dueAt || null,
      completedAt: null,
      slaStatus: "PENDING",
      slaTarget: null,
      isRecurring: false,
      recurrenceRule: null,
      seriesId: null,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };

    const { data, error } = await supabase
      .from("Activity")
      .insert(insertPayload)
      .select("id,tenantId,typeId,leadId,opportunityId,outcome,notes,dueAt,completedAt,slaStatus,slaTarget,isRecurring,recurrenceRule,seriesId,createdAt,updatedAt,createdBy")
      .single();

    if (error) {
      throw new Error(`ACTIVITY_INSERT_FAILED: ${error.message}`);
    }

    const [types, users] = await Promise.all([
      listActivityTypesForTenant(user),
      user.tenantId
        ? supabase.from("User").select("id,name,email").eq("tenantId", user.tenantId)
        : supabase.from("User").select("id,name,email").is("tenantId", null),
    ]);

    if (users.error) {
      throw new Error(`ACTIVITY_USER_LOOKUP_FAILED: ${users.error.message}`);
    }

    const activity = {
      ...data,
      duration: null,
      customFields: null,
      type: types.find((item: any) => item.id === data.typeId),
      user: (users.data ?? []).find((item: any) => item.id === data.createdBy) ?? null,
    };

    await createAuditLog(user, "CREATE", "ACTIVITY", activity.id, null, activity, null);
    if (user.tenantId) {
      const activityEvent = activity.opportunityId ? "ACTIVITY_CREATED_ON_OPPORTUNITY" : "ACTIVITY_CREATED";
      await runAutomationsForEvent(user, activityEvent, "ACTIVITY", activity.id, activity);
    }

    return activity;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`CREATE_ACTIVITY_FAILED: ${error.message}`);
    }

    throw error;
  }
}

export async function updateActivityForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const editablePayload = editablePayloadForUser(user, "activities", payload);
  const existingQuery = supabase
    .from("Activity")
    .select("id,tenantId,typeId,leadId,opportunityId,outcome,notes,dueAt,completedAt,slaStatus,slaTarget,isRecurring,recurrenceRule,seriesId,createdAt,updatedAt,createdBy")
    .eq("id", id);
  const scopedExisting = user.tenantId ? existingQuery.eq("tenantId", user.tenantId) : existingQuery.is("tenantId", null);
  const { data: existing, error: existingError } = await scopedExisting.maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("ACTIVITY_NOT_FOUND");

  const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["typeId", "leadId", "opportunityId", "outcome", "notes", "dueAt", "completedAt", "slaStatus", "slaTarget"] as const) {
    if (editablePayload[key] !== undefined) updatePayload[key] = editablePayload[key] || null;
  }

  const updateQuery = supabase
    .from("Activity")
    .update(updatePayload)
    .eq("id", id)
    .select("id,tenantId,typeId,leadId,opportunityId,outcome,notes,dueAt,completedAt,slaStatus,slaTarget,isRecurring,recurrenceRule,seriesId,createdAt,updatedAt,createdBy");
  const scopedUpdate = user.tenantId ? updateQuery.eq("tenantId", user.tenantId) : updateQuery.is("tenantId", null);
  const { data, error } = await scopedUpdate.single();
  if (error) throw error;

  const diff = buildFieldDiff(existing as Record<string, any>, data as Record<string, any>);
  await createAuditLog(user, "UPDATE", "ACTIVITY", data.id, existing, data, Object.keys(diff).length > 0 ? diff : null);
  if (user.tenantId) {
    const activityEvent = data.opportunityId ? "ACTIVITY_UPDATED_ON_OPPORTUNITY" : "ACTIVITY_UPDATED";
    await runAutomationsForEvent(user, activityEvent, "ACTIVITY", data.id, data);
  }

  return data;
}

export async function getOpportunityStatsForTenant(user: TenantUser) {
  const opportunities = await listOpportunitiesForTenant(user, 500);
  const summary = new Map<string, { stage: string; value: number; count: number; order: number }>();

  for (const opportunity of opportunities.data) {
    const stageName = opportunity.stage?.name ?? "Unassigned";
    const current = summary.get(stageName) ?? {
      stage: stageName,
      value: 0,
      count: 0,
      order: opportunity.stage?.order ?? Number.MAX_SAFE_INTEGER,
    };

    current.value += Number(opportunity.amount ?? 0);
    current.count += 1;
    current.order = Math.min(current.order, opportunity.stage?.order ?? Number.MAX_SAFE_INTEGER);
    summary.set(stageName, current);
  }

  return [...summary.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...item }) => item);
}

export async function getActivityStatsForTenant(user: TenantUser) {
  const activities = await listActivitiesForTenant(user, 500, null);
  const byTypeMap = new Map<string, number>();
  const trendMap = new Map<string, number>();

  for (const activity of activities.data) {
    const typeName = activity.type?.name ?? "Activity";
    byTypeMap.set(typeName, (byTypeMap.get(typeName) ?? 0) + 1);

    const dateKey = new Date(activity.createdAt).toISOString().slice(0, 10);
    trendMap.set(dateKey, (trendMap.get(dateKey) ?? 0) + 1);
  }

  const today = new Date();
  const trend = Array.from({ length: 7 }).map((_, index) => {
    const current = new Date(today);
    current.setDate(today.getDate() - (6 - index));
    const key = current.toISOString().slice(0, 10);

    return {
      date: key,
      count: trendMap.get(key) ?? 0,
    };
  });

  return {
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })),
    trend,
  };
}

export async function getGovernanceHistoryForTenant(
  user: TenantUser,
  entityType: string,
  entityId: string
) {
  const supabase = createSupabaseAdminClient();
  const normalizedType = entityType.toUpperCase();
  const query = supabase
    .from("AuditLog")
    .select("id,action,before,after,diff,createdAt,userId")
    .eq("entityType", normalizedType)
    .eq("entityId", entityId)
    .order("createdAt", { ascending: false });

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;

  if (error) {
    throw error;
  }

  const userIds = [...new Set((data ?? []).map((item) => item.userId).filter(Boolean))];
  const usersQuery = supabase.from("User").select("id,name,email").in("id", userIds);
  const scopedUsersQuery = user.tenantId ? usersQuery.eq("tenantId", user.tenantId) : usersQuery.is("tenantId", null);
  const usersResult = userIds.length > 0 ? await scopedUsersQuery : { data: [], error: null };

  if (usersResult.error) {
    throw usersResult.error;
  }

  const userMap = new Map((usersResult.data ?? []).map((record) => [record.id, record]));
  const [opportunityTypes, activityTypes] = await Promise.all([
    listOpportunityTypesForTenant(user).catch(() => []),
    listActivityTypesForTenant(user).catch(() => []),
  ]);
  const stageMap = new Map(
    (opportunityTypes as any[]).flatMap((type) => (type.stages ?? []).map((stage: any) => [stage.id, stage.label || stage.name || stage.id]))
  );
  const opportunityTypeMap = new Map((opportunityTypes as any[]).map((type) => [type.id, type.name]));
  const activityTypeMap = new Map((activityTypes as any[]).map((type) => [type.id, type.name]));

  return (data ?? []).map((item) => ({
    id: item.id,
    action: item.action,
    createdAt: item.createdAt,
    user: userMap.get(item.userId) ?? { name: "Unknown User", email: "" },
    valueLabels: {
      stages: Object.fromEntries(stageMap),
      opportunityTypes: Object.fromEntries(opportunityTypeMap),
      activityTypes: Object.fromEntries(activityTypeMap),
    },
    changes: {
      before: item.before,
      after: item.after,
      diff: item.diff,
    },
  }));
}

export async function listAuditLogsForTenant(
  user: TenantUser,
  filters?: { entityType?: string; entityId?: string; action?: string }
) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("AuditLog")
    .select("id,action,entityType,entityId,before,after,diff,metadata,createdAt,userId")
    .order("createdAt", { ascending: false })
    .limit(200);

  if (filters?.entityType) {
    query = query.eq("entityType", filters.entityType.toUpperCase());
  }

  if (filters?.entityId) {
    query = query.eq("entityId", filters.entityId);
  }

  if (filters?.action) {
    query = query.eq("action", filters.action.toUpperCase());
  }

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;

  if (error) throw error;

  const userIds = [...new Set((data ?? []).map((item: any) => item.userId).filter(Boolean))];
  const usersQuery = supabase.from("User").select("id,name,email").in("id", userIds);
  const scopedUsersQuery = user.tenantId ? usersQuery.eq("tenantId", user.tenantId) : usersQuery.is("tenantId", null);
  const usersResult = userIds.length > 0 ? await scopedUsersQuery : { data: [], error: null };
  if (usersResult.error) throw usersResult.error;
  const userMap = new Map((usersResult.data ?? []).map((record: any) => [record.id, record]));

  return (data ?? []).map((item: any) => ({
    id: item.id,
    action: item.action,
    entityType: item.entityType,
    entityId: item.entityId,
    createdAt: item.createdAt,
    user: userMap.get(item.userId) ?? { name: "Unknown User", email: "" },
    changes: {
      before: item.before,
      after: item.after,
      diff: item.diff,
    },
    metadata: item.metadata,
  }));
}

export async function listNotesForTenant(
  user: TenantUser,
  entityType: string,
  entityId: string
) {
  const supabase = createSupabaseAdminClient();
  const normalizedType = normalizeEntityType(entityType);
  const query = supabase
    .from("Note")
    .select("id,content,authorId,isPinned,createdAt,updatedAt")
    .eq("entityType", normalizedType)
    .eq("entityId", entityId)
    .order("isPinned", { ascending: false })
    .order("createdAt", { ascending: false });

  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;

  if (error) {
    throw error;
  }

  const authorIds = [...new Set((data ?? []).map((item) => item.authorId).filter(Boolean))];
  const usersQuery = supabase.from("User").select("id,name,email").in("id", authorIds);
  const scopedUsersQuery = user.tenantId ? usersQuery.eq("tenantId", user.tenantId) : usersQuery.is("tenantId", null);
  const usersResult = authorIds.length ? await scopedUsersQuery : { data: [], error: null };

  if (usersResult.error) {
    throw usersResult.error;
  }

  const userMap = new Map((usersResult.data ?? []).map((item: any) => [item.id, item]));

  return (data ?? []).map((item: any) => ({
    id: item.id,
    content: item.content,
    isPinned: item.isPinned ?? false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    author: userMap.get(item.authorId) ?? { id: item.authorId, name: "Unknown User", email: "" },
  }));
}

export async function createNoteForTenant(
  user: TenantUser,
  entityType: string,
  entityId: string,
  content: string
) {
  const supabase = createSupabaseAdminClient();
  const normalizedType = normalizeEntityType(entityType);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("Note")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      entityType: normalizedType,
      entityId,
      content,
      authorId: user.id,
      mentions: [],
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,content,authorId,isPinned,createdAt,updatedAt")
    .single();

  if (error) {
    throw error;
  }

  await createAuditLog(user, "CREATE", "NOTE", data.id, null, data, null);

  return {
    ...data,
    author: { id: user.id, name: user.name ?? "Unknown User", email: user.email ?? "" },
  };
}

export async function updateNoteForTenant(user: TenantUser, noteId: string, content: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("Note")
    .update({ content })
    .eq("id", noteId)
    .eq("authorId", user.id)
    .select("id,content,authorId,isPinned,createdAt,updatedAt");
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    author: { id: user.id, name: user.name ?? "Unknown User", email: user.email ?? "" },
  };
}

export async function deleteNoteForTenant(user: TenantUser, noteId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase.from("Note").delete().eq("id", noteId).eq("authorId", user.id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await scopedQuery;

  if (error) {
    throw error;
  }
}

export async function toggleNotePinForTenant(user: TenantUser, noteId: string) {
  const supabase = createSupabaseAdminClient();
  const existingQuery = supabase
    .from("Note")
    .select("id,content,authorId,isPinned,createdAt,updatedAt")
    .eq("id", noteId);
  const existingScoped = user.tenantId ? existingQuery.eq("tenantId", user.tenantId) : existingQuery.is("tenantId", null);
  const { data: existing, error: existingError } = await existingScoped.single();

  if (existingError) {
    throw existingError;
  }

  const updateQuery = supabase
    .from("Note")
    .update({ isPinned: !existing.isPinned })
    .eq("id", noteId)
    .select("id,content,authorId,isPinned,createdAt,updatedAt");
  const updateScoped = user.tenantId ? updateQuery.eq("tenantId", user.tenantId) : updateQuery.is("tenantId", null);
  const { data, error } = await updateScoped.single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    author: { id: user.id, name: user.name ?? "Unknown User", email: user.email ?? "" },
  };
}

export async function listDashboardWidgetsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("DashboardWidget")
    .select("id,title,type,config,w,h,x,y,createdAt,updatedAt")
    .eq("userId", user.id)
    .order("y", { ascending: true })
    .order("x", { ascending: true })
    .order("createdAt", { ascending: true });
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;

  if (error) {
    throw error;
  }

  return (data ?? []).map(formatWidgetRecord);
}

export async function createDashboardWidgetForTenant(user: TenantUser, input: DashboardWidgetInput) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("DashboardWidget")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      userId: user.id,
      title: input.title,
      type: input.type,
      config: input.config ?? {},
      w: input.layout?.w ?? 1,
      h: input.layout?.h ?? 1,
      x: input.layout?.x ?? 0,
      y: input.layout?.y ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,title,type,config,w,h,x,y,createdAt,updatedAt")
    .single();

  if (error) {
    throw error;
  }

  return formatWidgetRecord(data);
}

export async function updateDashboardWidgetForTenant(
  user: TenantUser,
  id: string,
  input: Partial<DashboardWidgetInput>
) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    updatedAt: now,
  };

  if (input.title !== undefined) updatePayload.title = input.title;
  if (input.type !== undefined) updatePayload.type = input.type;
  if (input.config !== undefined) updatePayload.config = input.config;
  if (input.layout?.w !== undefined) updatePayload.w = input.layout.w;
  if (input.layout?.h !== undefined) updatePayload.h = input.layout.h;
  if (input.layout?.x !== undefined) updatePayload.x = input.layout.x;
  if (input.layout?.y !== undefined) updatePayload.y = input.layout.y;

  const query = supabase
    .from("DashboardWidget")
    .update(updatePayload)
    .eq("id", id)
    .eq("userId", user.id)
    .select("id,title,type,config,w,h,x,y,createdAt,updatedAt");
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.single();

  if (error) {
    throw error;
  }

  return formatWidgetRecord(data);
}

export async function deleteDashboardWidgetForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase.from("DashboardWidget").delete().eq("id", id).eq("userId", user.id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await scopedQuery;

  if (error) {
    throw error;
  }
}

export async function getDashboardWidgetForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("DashboardWidget")
    .select("id,title,type,config,w,h,x,y,createdAt,updatedAt")
    .eq("id", id)
    .eq("userId", user.id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();

  if (error) {
    throw error;
  }

  return data ? formatWidgetRecord(data) : null;
}

export async function getDashboardWidgetDataForTenant(user: TenantUser, id: string) {
  const widget = await getDashboardWidgetForTenant(user, id);

  if (!widget) {
    return null;
  }

  const moduleName = String((widget.config as any)?.module ?? "").toUpperCase();
  const metric = String((widget.config as any)?.metric ?? "COUNT").toUpperCase();

  if (widget.type === "STAT") {
    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      return metric === "COUNT" ? leads.meta.total : leads.meta.total;
    }

    if (moduleName === "OPPORTUNITIES") {
      const opportunities = await listOpportunitiesForTenant(user, 500);
      return opportunities.data.filter((item: any) => {
        const stage = item.stage;
        const filters = (widget.config as any)?.filters?.stage;
        if (!filters) return true;
        if (filters.isWon === false && stage?.isWon) return false;
        if (filters.isLost === false && stage?.isClosed && !stage?.isWon) return false;
        return true;
      }).length;
    }

    if (moduleName === "ACTIVITIES") {
      const activities = await listActivitiesForTenant(user, 500, null);
      return activities.meta.total;
    }

    return 0;
  }

  if (widget.type === "FUNNEL") {
    const stats = await getOpportunityStatsForTenant(user);
    return stats.map((item) => ({ stage: item.stage, count: item.count, value: item.value }));
  }

  if (widget.type === "TREND") {
    if (moduleName === "ACTIVITIES") {
      const activityStats = await getActivityStatsForTenant(user);
      return activityStats.trend.map((item) => ({ group: item.date, value: item.count }));
    }

    const days = Array.from({ length: 7 }).map((_, index) => {
      const current = new Date();
      current.setDate(current.getDate() - (6 - index));
      return current.toISOString().slice(0, 10);
    });

    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      const counts = new Map<string, number>();
      leads.data.forEach((item: any) => {
        const key = new Date(item.createdAt).toISOString().slice(0, 10);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return days.map((day) => ({ group: day, value: counts.get(day) ?? 0 }));
    }

    if (moduleName === "OPPORTUNITIES") {
      const opportunities = await listOpportunitiesForTenant(user, 500);
      const counts = new Map<string, number>();
      opportunities.data.forEach((item: any) => {
        const key = new Date(item.createdAt).toISOString().slice(0, 10);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return days.map((day) => ({ group: day, value: counts.get(day) ?? 0 }));
    }
  }

  if (widget.type === "BAR") {
    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      const counts = new Map<string, number>();
      leads.data.forEach((item: any) => {
        const key = item.status ?? "Unknown";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return [...counts.entries()].map(([group, value]) => ({ group, value }));
    }

    if (moduleName === "OPPORTUNITIES") {
      const stats = await getOpportunityStatsForTenant(user);
      return stats.map((item) => ({ group: item.stage, value: item.count }));
    }

    if (moduleName === "ACTIVITIES") {
      const activityStats = await getActivityStatsForTenant(user);
      return activityStats.byType.map((item) => ({ group: item.type, value: item.count }));
    }
  }

  return [];
}

export async function listFormsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("Form")
    .select("id,name,description,fields,config,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
    .order("createdAt", { ascending: false });
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;

  if (error) throw error;

  const formIds = (data ?? []).map((item: any) => item.id);
  const submissionCounts = new Map<string, number>();

  if (formIds.length > 0) {
    const submissionsQuery = supabase.from("FormSubmission").select("formId");
    const scopedSubmissions = user.tenantId
      ? submissionsQuery.eq("tenantId", user.tenantId).in("formId", formIds)
      : submissionsQuery.is("tenantId", null).in("formId", formIds);
    const submissionsResult = await scopedSubmissions;
    if (submissionsResult.error) throw submissionsResult.error;
    (submissionsResult.data ?? []).forEach((item: any) => {
      submissionCounts.set(item.formId, (submissionCounts.get(item.formId) ?? 0) + 1);
    });
  }

  return (data ?? []).map((item: any) => formatFormRecord(item, submissionCounts.get(item.id) ?? 0));
}

export async function listAvailableFormsForPlacement(user: TenantUser, placement: string) {
  const forms = await listFormsForTenant(user);
  if (!user.tenantId) return [];

  const supabase = createSupabaseAdminClient();
  const { data: memberships } = await supabase
    .from("SalesGroupMember")
    .select("groupId")
    .eq("tenantId", user.tenantId)
    .eq("userId", user.id);
  const salesGroupIds = new Set((memberships ?? []).map((item) => item.groupId));
  const { data: teamMemberships } = await supabase
    .from("TeamMember")
    .select("teamId")
    .eq("tenantId", user.tenantId)
    .eq("userId", user.id);
  const teamIds = new Set((teamMemberships ?? []).map((item) => item.teamId));
  const { data: currentUserRecord } = await supabase
    .from("User")
    .select("id,email,name,roleId,managerId,skills")
    .eq("tenantId", user.tenantId)
    .eq("id", user.id)
    .maybeSingle();
  const currentUser = { ...(currentUserRecord ?? {}), id: user.id, tenantId: user.tenantId };
  const visibilityAllows = (config: any, modeKey = "visibilityMode") => {
    const mode = String(config?.[modeKey] ?? "ALL");
    if (mode === "INHERIT") return true;
    if (mode === "ALL") return true;
    if (mode === "ROLES") return Array.isArray(config.visibleRoleIds) && config.visibleRoleIds.includes(currentUserRecord?.roleId);
    if (mode === "USERS") return Array.isArray(config.visibleUserIds) && config.visibleUserIds.includes(user.id);
    if (mode === "SALES_GROUPS") {
      return Array.isArray(config.visibleSalesGroupIds) && config.visibleSalesGroupIds.some((id: string) => salesGroupIds.has(id));
    }
    if (mode === "TEAMS") {
      const configuredTeamIds = Array.isArray(config.visibleTeamIds) ? config.visibleTeamIds : [];
      return configuredTeamIds.some((id: string) => teamIds.has(id));
    }
    return false;
  };

  return forms.filter((form: any) => {
    const config = form.config ?? {};
    const placements = Array.isArray(config.placements) ? config.placements : [];
    const placementRules = Array.isArray(config.placementRules) ? config.placementRules : [];
    const matchingRule = placementRules.find((rule: any) => rule.placement === placement && rule.enabled !== false);
    const ruleEnabled = Boolean(matchingRule);
    if (!form.isActive || (!placements.includes(placement) && !ruleEnabled)) return false;

    if (!visibilityAllows(config)) return false;
    if (matchingRule && String(matchingRule.visibilityMode ?? "INHERIT") !== "INHERIT") {
      if (!visibilityAllows(matchingRule)) return false;
    }
    if (matchingRule) {
      const userConditions = Array.isArray(matchingRule.userConditions)
        ? matchingRule.userConditions.filter((condition: any) => condition.field)
        : [];
      if (userConditions.length > 0) {
        const checks = userConditions.map((condition: any) => processConditionMatches(currentUser, condition));
        return String(matchingRule.userConditionLogic ?? "AND") === "OR" ? checks.some(Boolean) : checks.every(Boolean);
      }
    }
    return true;
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
  const supabase = createSupabaseAdminClient();
  const objectId = await getObjectId(user, "lead");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("Form")
    .insert({
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
    })
    .select("id,name,description,fields,config,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return formatFormRecord(data, 0);
}

export async function getFormForTenant(user: TenantUser, formId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("Form")
    .select("id,name,description,fields,config,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
    .eq("id", formId);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();

  if (error) throw error;
  return data ? formatFormRecord(data, 0) : null;
}

export async function updateFormForTenant(user: TenantUser, formId: string, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const config = (payload.config as Record<string, unknown> | undefined) ?? {};
  const updatePayload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (payload.description !== undefined) updatePayload.description = payload.description;
  if (config.fields !== undefined || payload.fields !== undefined) {
    updatePayload.fields = config.fields ?? payload.fields;
  }
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

  const query = supabase
    .from("Form")
    .update(updatePayload)
    .eq("id", formId)
    .select("id,name,description,fields,config,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt");
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.single();

  if (error) throw error;
  return formatFormRecord(data, 0);
}

export async function deleteFormForTenant(user: TenantUser, formId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase.from("Form").delete().eq("id", formId);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await scopedQuery;
  if (error) throw error;
}

export async function getPublicForm(identifier: string) {
  const supabase = createSupabaseAdminClient();
  const byId = await supabase
    .from("Form")
    .select("id,name,description,fields,config,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
    .eq("id", identifier)
    .maybeSingle();

  if (byId.error) throw byId.error;
  if (byId.data) return formatFormRecord(byId.data, 0);

  return null;
}

export async function submitPublicForm(identifier: string, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const form = await getPublicForm(identifier);
  if (!form) throw new Error("FORM_NOT_FOUND");
  if (!form.isActive) throw new Error("FORM_INACTIVE");
  const formTenant = await supabase.from("Form").select("tenantId").eq("id", form.id).single();
  if (formTenant.error || !formTenant.data?.tenantId) throw formTenant.error ?? new Error("FORM_NOT_FOUND");
  const tenantId = formTenant.data.tenantId;
  const context = payload._context && typeof payload._context === "object"
    ? (payload._context as Record<string, unknown>)
    : {};

  const moduleData = splitFormPayloadByModule(form, payload);
  const leadData = { ...payload, ...moduleData.lead };
  const leadsQuery = supabase
    .from("Lead")
    .select("id,name,email")
    .eq("tenantId", tenantId)
    .limit(1);

  let leadId: string | null = typeof context.leadId === "string" ? context.leadId : null;
  const email = typeof leadData.email === "string" ? leadData.email : typeof leadData.Email === "string" ? leadData.Email : null;
  if (!leadId && email) {
    const existingLead = await leadsQuery.eq("email", email).maybeSingle();
    if (existingLead.error) throw existingLead.error;
    if (existingLead.data?.id) {
      leadId = existingLead.data.id;
    }
  }

  const now = new Date().toISOString();
  if (!leadId) {
    const objectId = await getObjectId({ id: "public-form", tenantId }, "lead");
    const createdLead = await supabase
      .from("Lead")
      .insert({
        id: randomUUID(),
        tenantId,
        objectId,
        name: String((leadData.name ?? leadData.Name ?? "Website Lead") as string),
        email: email,
        phone: typeof leadData.phone === "string" ? leadData.phone : typeof leadData.Phone === "string" ? leadData.Phone : null,
        company: typeof leadData.company === "string" ? leadData.company : null,
        source: "FORM",
        status: "NEW",
        score: 0,
        tags: [],
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .select("id,name,email,phone,company,source,status,score,tags,createdBy,createdAt,updatedAt,ownerId")
      .single();
    if (createdLead.error) throw createdLead.error;
    leadId = createdLead.data.id;
    await distributeRecord({ id: "public-form", tenantId }, "LEAD", createdLead.data.id, createdLead.data);
  } else if (form.config?.duplicateAction === "UPDATE") {
    const updatePayload: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const key of ["name", "email", "phone", "company", "source", "status"]) {
      if (leadData[key] !== undefined && leadData[key] !== "") updatePayload[key] = leadData[key];
    }

    await supabase.from("Lead").update(updatePayload).eq("tenantId", tenantId).eq("id", leadId);
  }

  const opportunityId = await upsertOpportunityFromFormModule({
    tenantId,
    leadId,
    opportunityId: typeof context.opportunityId === "string" ? context.opportunityId : null,
    data: moduleData.opportunity,
  });
  await upsertActivityFromFormModule({
    tenantId,
    leadId,
    activityId: typeof context.activityId === "string" ? context.activityId : null,
    opportunityId,
    data: moduleData.activity,
  });

  const utmParams = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key.startsWith("utm_"))
  );

  const { error } = await supabase.from("FormSubmission").insert({
    id: randomUUID(),
    tenantId,
    formId: form.id,
    leadId,
    data: {
      ...payload,
      _modules: moduleData,
      leadId,
      opportunityId,
    },
    utmParams: Object.keys(utmParams).length ? utmParams : null,
    ipAddress: null,
    userAgent: null,
    referrer: null,
    status: "PROCESSED",
    spamScore: 0,
    isDuplicate: false,
    duplicateLeadId: null,
    errorMessage: null,
  });

  if (error) throw error;

  return { success: true, leadId, opportunityId };
}

function splitFormPayloadByModule(form: any, payload: Record<string, unknown>) {
  const output: Record<"lead" | "opportunity" | "activity", Record<string, unknown>> = {
    lead: {},
    opportunity: {},
    activity: {},
  };

  for (const field of form.config?.fields ?? []) {
    const rawValue = payload[field.mapping] ?? payload[field.label] ?? payload[field.id];
    if (rawValue === undefined || rawValue === "") continue;

    const sourceModule = String(field.sourceModule ?? field.module ?? "").toLowerCase();
    const mapping = String(field.mapping ?? "");
    const [moduleFromMapping, fieldFromMapping] = mapping.includes(".")
      ? mapping.split(".", 2)
      : ["", mapping];
    const moduleName = (sourceModule || moduleFromMapping || "lead").toLowerCase();
    const fieldName = fieldFromMapping || mapping || field.label;

    if (moduleName === "opportunity" || moduleName === "activity" || moduleName === "lead") {
      output[moduleName][fieldName] = rawValue;
      if (moduleName === "opportunity" && field.opportunityTypeId) {
        output.opportunity.opportunityTypeId = field.opportunityTypeId;
      }
      if (moduleName === "activity" && field.activityTypeId) {
        output.activity.typeId = field.activityTypeId;
      }
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (!key.includes(".") || value === undefined || value === "") continue;
    const [moduleName, fieldName] = key.split(".", 2);
    if ((moduleName === "lead" || moduleName === "opportunity" || moduleName === "activity") && fieldName) {
      output[moduleName][fieldName] = value;
    }
  }

  return output;
}

async function upsertOpportunityFromFormModule(input: {
  tenantId: string;
  leadId: string | null;
  opportunityId: string | null;
  data: Record<string, unknown>;
}) {
  if (!input.leadId || Object.keys(input.data).length === 0) return null;

  const supabase = createSupabaseAdminClient();
  if (input.opportunityId) {
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ["title", "amount", "expectedCloseDate", "priority", "stageId", "opportunityTypeId"]) {
      if (input.data[key] !== undefined && input.data[key] !== "") {
        updatePayload[key] = key === "amount" ? Number(input.data[key]) : input.data[key];
      }
    }
    const { error } = await supabase
      .from("Opportunity")
      .update(updatePayload)
      .eq("tenantId", input.tenantId)
      .eq("id", input.opportunityId);
    if (error) throw error;
    return input.opportunityId;
  }

  const user = { id: "public-form", tenantId: input.tenantId };
  const [objectId, types] = await Promise.all([
    getObjectId(user, "opportunity"),
    listOpportunityTypesForTenant(user),
  ]);
  const selectedType = input.data.opportunityTypeId
    ? types.find((type: any) => type.id === input.data.opportunityTypeId)
    : types[0];

  if (!selectedType?.id) return null;

  const now = new Date().toISOString();
  const insertPayload = {
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
  };

  const { data, error } = await supabase
    .from("Opportunity")
    .insert(insertPayload)
    .select("id,tenantId,objectId,leadId,opportunityTypeId,stageId,title,amount,expectedCloseDate,priority,tags,ownerId,createdAt,updatedAt")
    .single();

  if (error) throw error;
  await distributeRecord(user, "OPPORTUNITY", data.id, data);

  return data.id as string;
}

async function upsertActivityFromFormModule(input: {
  tenantId: string;
  leadId: string | null;
  activityId: string | null;
  opportunityId: string | null;
  data: Record<string, unknown>;
}) {
  if (!input.leadId || Object.keys(input.data).length === 0) return null;

  const supabase = createSupabaseAdminClient();
  if (input.activityId) {
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ["typeId", "outcome", "notes", "dueAt", "opportunityId"]) {
      const value = key === "opportunityId" ? input.opportunityId : input.data[key];
      if (value !== undefined && value !== "") updatePayload[key] = value;
    }
    const { error } = await supabase
      .from("Activity")
      .update(updatePayload)
      .eq("tenantId", input.tenantId)
      .eq("id", input.activityId);
    if (error) throw error;
    return input.activityId;
  }

  const user = { id: "public-form", tenantId: input.tenantId };
  const objectId = await getObjectId(user, "activity");
  const typeResult = input.data.typeId
    ? { data: { id: String(input.data.typeId) }, error: null }
    : await supabase
        .from("ActivityType")
        .select("id")
        .eq("tenantId", input.tenantId)
        .eq("isActive", true)
        .order("order", { ascending: true })
        .limit(1)
        .maybeSingle();

  if (typeResult.error) throw typeResult.error;
  if (!typeResult.data?.id) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("Activity")
    .insert({
      id: randomUUID(),
      tenantId: input.tenantId,
      objectId,
      typeId: typeResult.data.id,
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
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function getFormStatsForTenant(user: TenantUser, formId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("FormSubmission")
    .select("status,isDuplicate,spamScore,createdAt")
    .eq("formId", formId);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;

  const submissions = data ?? [];
  const total = submissions.length;
  const processed = submissions.filter((item: any) => item.status === "PROCESSED").length;
  const spam = submissions.filter((item: any) => item.status === "SPAM").length;
  const duplicate = submissions.filter((item: any) => item.isDuplicate || item.status === "DUPLICATE").length;
  const errors = submissions.filter((item: any) => item.status === "ERROR").length;
  const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentTrend = submissions.filter((item: any) => new Date(item.createdAt).getTime() >= threshold).length;

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
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("FormSubmission")
    .select("id,createdAt,status,spamScore,data,leadId", { count: "exact" })
    .eq("formId", formId)
    .order("createdAt", { ascending: false })
    .range(offset, offset + limit - 1);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, count, error } = await scopedQuery;
  if (error) throw error;

  const leadIds = [...new Set((data ?? []).map((item: any) => item.leadId).filter(Boolean))];
  const leadsQuery = supabase.from("Lead").select("id,name,email,status").in("id", leadIds);
  const scopedLeadsQuery = user.tenantId ? leadsQuery.eq("tenantId", user.tenantId) : leadsQuery.is("tenantId", null);
  const leadsResult = leadIds.length ? await scopedLeadsQuery : { data: [], error: null };
  if (leadsResult.error) throw leadsResult.error;
  const leadMap = new Map((leadsResult.data ?? []).map((item: any) => [item.id, item]));

  return {
    submissions: (data ?? []).map((item: any) => ({
      ...item,
      lead: item.leadId ? leadMap.get(item.leadId) ?? null : null,
    })),
    total: count ?? 0,
  };
}

export async function exportFormSubmissionsForTenant(user: TenantUser, formId: string) {
  const submissions = await getFormSubmissionsForTenant(user, formId, 1000, 0);
  const rows = submissions.submissions;
  const headers = ["id", "createdAt", "status", "spamScore", "leadName", "leadEmail", "data"];
  const csv = [
    headers.join(","),
    ...rows.map((item: any) =>
      [
        item.id,
        item.createdAt,
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
  return csv;
}

export async function getLeadsReportForTenant(user: TenantUser) {
  const leads = await listLeadsForTenant(user, 1, 500);
  const bySource = new Map<string, number>();
  leads.data.forEach((item: any) => {
    const key = item.source || "Unknown";
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  });
  return {
    total: leads.meta.total,
    bySource: [...bySource.entries()].map(([source, count]) => ({ source, count })),
  };
}

export async function getOpportunitiesReportForTenant(user: TenantUser) {
  const opportunities = await listOpportunitiesForTenant(user, 500);
  const byStage = new Map<string, { stage: string; count: number; value: number }>();
  let totalRevenue = 0;
  opportunities.data.forEach((item: any) => {
    const key = item.stage?.name || "Unassigned";
    const current = byStage.get(key) ?? { stage: key, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(item.amount ?? 0);
    totalRevenue += Number(item.amount ?? 0);
    byStage.set(key, current);
  });
  return {
    total: opportunities.meta.total,
    totalRevenue,
    byStage: [...byStage.values()],
  };
}

export async function getActivitiesReportForTenant(user: TenantUser) {
  const activities = await listActivitiesForTenant(user, 500, null);
  return {
    total: activities.meta.total,
    byType: (await getActivityStatsForTenant(user)).byType,
  };
}

export async function listCustomReportsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("CustomReport")
    .select("id,name,description,module,config,chartType,isPublic,isActive,createdAt,updatedAt")
    .neq("chartType", "SAVED_VIEW")
    .order("createdAt", { ascending: false });
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;
  return data ?? [];
}

export async function exportCustomReportForTenant(user: TenantUser, reportId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("CustomReport")
    .select("id,name,module,config,chartType")
    .eq("id", reportId);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();
  if (error) throw error;
  if (!data) return "id,name\n";

  let rows: Array<Record<string, unknown>> = [];
  const moduleName = String(data.module).toUpperCase();
  if (moduleName === "LEADS") {
    const report = await getLeadsReportForTenant(user);
    rows = report.bySource.map((item) => ({ source: item.source, count: item.count }));
  } else if (moduleName === "OPPORTUNITIES") {
    const report = await getOpportunitiesReportForTenant(user);
    rows = report.byStage.map((item) => ({ stage: item.stage, count: item.count, value: item.value }));
  } else if (moduleName === "ACTIVITIES") {
    const report = await getActivitiesReportForTenant(user);
    rows = report.byType.map((item: any) => ({ type: item.type, count: item.count }));
  }

  if (rows.length === 0) return "id,name\n";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "")}"`).join(","))].join("\n");
}

export async function listSavedViewsForTenant(user: TenantUser, module: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("CustomReport")
    .select("id,name,isPublic,config")
    .eq("chartType", "SAVED_VIEW")
    .eq("module", module.toUpperCase())
    .order("createdAt", { ascending: true });
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    id: item.id,
    name: item.name,
    isDefault: Boolean((item.config as any)?.isDefault),
    isShared: Boolean(item.isPublic),
    filters: (item.config as any)?.filters ?? { conditions: [], logic: "AND" },
  }));
}

export async function createSavedViewForTenant(user: TenantUser, input: SavedViewInput) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  if (input.isDefault) {
    const clearQuery = supabase
      .from("CustomReport")
      .update({ config: { filters: {}, isDefault: false } })
      .eq("chartType", "SAVED_VIEW")
      .eq("module", input.module.toUpperCase());
    const clearScoped = user.tenantId ? clearQuery.eq("tenantId", user.tenantId) : clearQuery.is("tenantId", null);
    await clearScoped;
  }

  const { data, error } = await supabase
    .from("CustomReport")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      name: input.name,
      description: null,
      module: input.module.toUpperCase(),
      config: {
        filters: input.filters,
        isDefault: Boolean(input.isDefault),
      },
      schedule: null,
      chartType: "SAVED_VIEW",
      isPublic: Boolean(input.isShared),
      isActive: true,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,isPublic,config")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    isDefault: Boolean((data.config as any)?.isDefault),
    isShared: Boolean(data.isPublic),
    filters: (data.config as any)?.filters ?? { conditions: [], logic: "AND" },
  };
}

export async function deleteSavedViewForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("CustomReport")
    .delete()
    .eq("id", id)
    .eq("chartType", "SAVED_VIEW");
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await scopedQuery;
  if (error) throw error;
}

export async function listLeadListsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("LeadList")
    .select("id,name,description,type,filters,isActive,createdAt,updatedAt,createdBy")
    .order("updatedAt", { ascending: false });
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;

  const staticListIds = (data ?? []).filter((list: any) => list.type === "STATIC").map((list: any) => list.id);
  const memberResult = staticListIds.length > 0
    ? await supabase.from("LeadListMember").select("listId,leadId").in("listId", staticListIds)
    : { data: [], error: null };
  if (memberResult.error) throw memberResult.error;

  const memberCounts = new Map<string, number>();
  for (const member of memberResult.data ?? []) {
    memberCounts.set(member.listId, (memberCounts.get(member.listId) ?? 0) + 1);
  }

  const smartCounts = new Map<string, number>();
  for (const list of data ?? []) {
    if (list.type !== "SMART") continue;
    const result = await listLeadsForTenant(user, 1, 1, normalizeLeadListFilters(list.filters));
    smartCounts.set(list.id, result.meta.total);
  }

  return (data ?? []).map((list: any) => ({
    ...list,
    count: list.type === "SMART" ? smartCounts.get(list.id) ?? 0 : memberCounts.get(list.id) ?? 0,
  }));
}

export async function createLeadListForTenant(user: TenantUser, input: LeadListInput) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const type = input.type === "SMART" ? "SMART" : "STATIC";
  const name = String(input.name ?? "").trim();
  if (!name) {
    throw new Error("LEAD_LIST_NAME_REQUIRED");
  }
  const { data, error } = await supabase
    .from("LeadList")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      name,
      description: input.description ? String(input.description) : null,
      type,
      filters: type === "SMART" ? normalizeLeadListFilters(input.filters) : null,
      isActive: true,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,type,filters,isActive,createdAt,updatedAt,createdBy")
    .single();
  if (error) throw error;

  const leadIds = Array.isArray(input.leadIds) ? [...new Set(input.leadIds)] : [];
  if (type === "STATIC" && leadIds.length > 0) {
    const { error: memberError } = await supabase.from("LeadListMember").insert(
      leadIds.map((leadId) => ({
        id: randomUUID(),
        tenantId: user.tenantId,
        listId: data.id,
        leadId,
        addedBy: user.id,
        createdAt: now,
      }))
    );
    if (memberError) throw memberError;
  }

  await createAuditLog(user, "CREATE", "LEAD_LIST", data.id, null, data, null).catch((auditError) => {
    console.error("Lead list audit log failed", auditError);
  });
  return { ...data, count: leadIds.length };
}

export async function getLeadListForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("LeadList")
    .select("id,name,description,type,filters,isActive,createdAt,updatedAt,createdBy")
    .eq("id", id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data: list, error } = await scopedQuery.maybeSingle();
  if (error) throw error;
  if (!list) return null;

  if (list.type === "SMART") {
    const leads = await listLeadsForTenant(user, 1, 500, normalizeLeadListFilters(list.filters));
    return { ...list, leads: leads.data, count: leads.meta.total };
  }

  const memberQuery = supabase
    .from("LeadListMember")
    .select("leadId,createdAt")
    .eq("listId", id)
    .order("createdAt", { ascending: false });
  const scopedMemberQuery = user.tenantId ? memberQuery.eq("tenantId", user.tenantId) : memberQuery.is("tenantId", null);
  const { data: members, error: memberError } = await scopedMemberQuery;
  if (memberError) throw memberError;

  const leadIds = (members ?? []).map((member: any) => member.leadId);
  const leads = leadIds.length > 0
    ? await supabase.from("Lead").select("id,name,email,phone,company,source,status,score,tags,createdAt,updatedAt,ownerId").in("id", leadIds)
    : { data: [], error: null };
  if (leads.error) throw leads.error;
  return { ...list, leads: leads.data ?? [], count: leadIds.length };
}

export async function addLeadsToLeadListForTenant(user: TenantUser, id: string, leadIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const list = await getLeadListForTenant(user, id);
  if (!list) throw new Error("LEAD_LIST_NOT_FOUND");
  if (list.type !== "STATIC") throw new Error("SMART_LIST_MEMBERSHIP_IS_FILTER_BASED");
  const now = new Date().toISOString();
  const uniqueLeadIds = [...new Set(leadIds)];
  if (uniqueLeadIds.length === 0) return list;

  const existingQuery = supabase
    .from("LeadListMember")
    .select("leadId")
    .eq("listId", id)
    .in("leadId", uniqueLeadIds);
  const scopedExistingQuery = user.tenantId
    ? existingQuery.eq("tenantId", user.tenantId)
    : existingQuery.is("tenantId", null);
  const { data: existingMembers, error: existingError } = await scopedExistingQuery;
  if (existingError) throw existingError;

  const existingLeadIds = new Set((existingMembers ?? []).map((member: any) => member.leadId));
  const newLeadIds = uniqueLeadIds.filter((leadId) => !existingLeadIds.has(leadId));
  if (newLeadIds.length === 0) return list;

  const { error } = await supabase.from("LeadListMember").upsert(
    newLeadIds.map((leadId) => ({
      id: randomUUID(),
      tenantId: user.tenantId,
      listId: id,
      leadId,
      addedBy: user.id,
      createdAt: now,
    })),
    { onConflict: "tenantId,listId,leadId" }
  );
  if (error) throw error;
  await createAuditLog(user, "UPDATE", "LEAD_LIST", id, null, null, { addedLeadIds: newLeadIds }).catch((auditError) => {
    console.error("Lead list audit log failed", auditError);
  });
  for (const leadId of newLeadIds) {
    await runAutomationsForEvent(user, "LEAD_ADDED_TO_LIST", "LEAD", leadId, { id: leadId, leadId, listId: id });
  }
  return getLeadListForTenant(user, id);
}

export async function removeLeadFromLeadListForTenant(user: TenantUser, id: string, leadId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase.from("LeadListMember").delete().eq("listId", id).eq("leadId", leadId);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await scopedQuery;
  if (error) throw error;
  await createAuditLog(user, "UPDATE", "LEAD_LIST", id, null, null, { removedLeadId: leadId }).catch((auditError) => {
    console.error("Lead list audit log failed", auditError);
  });
}

export async function ingestWebsiteVisitForTenant(input: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const tenantId = String(input.tenantId ?? "");
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  const { data: trackingUser } = await supabase
    .from("User")
    .select("id,name,email,tenantId")
    .eq("tenantId", tenantId)
    .limit(1)
    .maybeSingle();
  const user: TenantUser = trackingUser ?? { id: "website-tracker", tenantId };
  const email = typeof input.email === "string" ? input.email.toLowerCase() : "";
  const leadId = typeof input.leadId === "string" ? input.leadId : "";
  let lead: any = null;
  if (leadId) {
    const { data } = await supabase.from("Lead").select("id,name,email").eq("tenantId", tenantId).eq("id", leadId).maybeSingle();
    lead = data;
  }
  if (!lead && email) {
    const { data } = await supabase.from("Lead").select("id,name,email").eq("tenantId", tenantId).eq("email", email).maybeSingle();
    lead = data;
  }
  if (!lead?.id) return { tracked: false, reason: "NO_MATCHING_LEAD" };

  const typeId = await ensureSystemActivityType(user, "Page Visit", "Globe", "#0ea5e9");
  const pageUrl = String(input.url ?? "");
  const title = input.title ? String(input.title) : "Website visit";
  const referrer = input.referrer ? `\nReferrer: ${input.referrer}` : "";
  const notes = `${title}${pageUrl ? `\n${pageUrl}` : ""}${referrer}`;
  const activity = await createActivityForTenant(user, {
    typeId,
    leadId: lead.id,
    outcome: "SUCCESS",
    notes,
  });
  return { tracked: true, activityId: activity.id, leadId: lead.id };
}

function normalizeImportModule(module: string | undefined): ImportModule {
  const normalized = String(module ?? "").toUpperCase();
  if (normalized === "LEAD" || normalized === "OPPORTUNITY" || normalized === "ACTIVITY") return normalized;
  throw new Error("UNSUPPORTED_IMPORT_MODULE");
}

function mapImportRow(row: Record<string, unknown>, mappings: ImportMapping[] | undefined) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return Object.fromEntries(Object.entries(row).filter(([key, value]) => key.trim() && value !== ""));
  }

  const mapped: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (!mapping.source || !mapping.target) continue;
    const value = row[mapping.source];
    if (value !== undefined && value !== "") mapped[mapping.target] = value;
  }
  return mapped;
}

async function findDuplicateForImport(user: TenantUser, module: ImportModule, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  let query: any = null;

  if (module === "LEAD" && payload.email) {
    query = supabase.from("Lead").select("id").eq("email", String(payload.email));
  } else if (module === "OPPORTUNITY" && payload.leadId && payload.title) {
    query = supabase
      .from("Opportunity")
      .select("id")
      .eq("leadId", String(payload.leadId))
      .eq("title", String(payload.title));
  } else if (module === "ACTIVITY" && payload.leadId && payload.typeId && payload.dueAt) {
    query = supabase
      .from("Activity")
      .select("id")
      .eq("leadId", String(payload.leadId))
      .eq("typeId", String(payload.typeId))
      .eq("dueAt", String(payload.dueAt));
  }

  if (!query) return null;
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function updateImportedRecord(user: TenantUser, module: ImportModule, id: string, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const table = module === "LEAD" ? "Lead" : module === "OPPORTUNITY" ? "Opportunity" : "Activity";
  const allowedFields = new Set(
    module === "LEAD"
      ? ["name", "email", "phone", "company", "source", "status", "ownerId"]
      : module === "OPPORTUNITY"
        ? ["title", "amount", "expectedCloseDate", "priority", "stageId", "ownerId"]
        : ["outcome", "notes", "dueAt", "completedAt", "opportunityId"]
  );
  const updatePayload = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => allowedFields.has(key) && value !== undefined)
  );
  if (Object.keys(updatePayload).length === 0) return { id, updated: false };

  const query = supabase.from(table).update({ ...updatePayload, updatedAt: new Date().toISOString() }).eq("id", id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.select("id").single();
  if (error) throw error;
  await createAuditLog(user, "UPDATE", module, id, null, null, updatePayload);
  return { id: data.id, updated: true };
}

async function createImportedRecord(user: TenantUser, module: ImportModule, payload: Record<string, unknown>) {
  if (module === "LEAD") return createLeadForTenant(user, payload);
  if (module === "OPPORTUNITY") return createOpportunityForTenant(user, payload);
  return createActivityForTenant(user, payload);
}

export async function listImportJobsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("ImportJob")
    .select("id,module,fileName,status,stats,errors,createdAt,createdBy")
    .order("createdAt", { ascending: false })
    .limit(50);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;
  return data ?? [];
}

export async function runImportForTenant(user: TenantUser, input: ImportInput) {
  const supabase = createSupabaseAdminClient();
  const module = normalizeImportModule(input.module);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const duplicateMode = input.duplicateMode === "UPDATE" || input.duplicateMode === "CREATE" ? input.duplicateMode : "SKIP";
  const now = new Date().toISOString();
  const jobId = randomUUID();
  const rowErrors: Array<{ row: number; message: string }> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const { error: jobError } = await supabase.from("ImportJob").insert({
    id: jobId,
    tenantId: user.tenantId,
    module,
    fileName: null,
    status: "PROCESSING",
    mappings: input.mappings ?? [],
    duplicateMode,
    stats: { total: rows.length, processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
    errors: [],
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  });
  if (jobError) throw jobError;

  for (const [index, row] of rows.entries()) {
    try {
      const payload = mapImportRow(row, input.mappings);
      const duplicateId = await findDuplicateForImport(user, module, payload);
      if (duplicateId && duplicateMode === "SKIP") {
        skipped += 1;
        continue;
      }
      if (duplicateId && duplicateMode === "UPDATE") {
        await updateImportedRecord(user, module, duplicateId, payload);
        updated += 1;
        continue;
      }
      await createImportedRecord(user, module, payload);
      created += 1;
    } catch (error) {
      rowErrors.push({
        row: index + 1,
        message: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  const stats = {
    total: rows.length,
    processed: rows.length,
    created,
    updated,
    skipped,
    failed: rowErrors.length,
  };

  const { data, error } = await supabase
    .from("ImportJob")
    .update({
      status: rowErrors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      stats,
      errors: rowErrors,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select("id,module,fileName,status,stats,errors,createdAt,createdBy")
    .single();
  if (error) throw error;
  await createAuditLog(user, "CREATE", "IMPORT_JOB", jobId, null, data, stats);
  return data;
}

export async function listWebhooksForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("WebhookSubscription")
    .select("id,name,url,events,isActive,secret,createdAt,updatedAt")
    .order("createdAt", { ascending: false });
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;
  return data ?? [];
}

export async function createWebhookForTenant(user: TenantUser, input: WebhookInput) {
  const supabase = createSupabaseAdminClient();
  const name = String(input.name ?? "").trim();
  const url = String(input.url ?? "").trim();
  if (!name || !url) throw new Error("WEBHOOK_NAME_URL_REQUIRED");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("WebhookSubscription")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      name,
      url,
      events: Array.isArray(input.events) && input.events.length > 0 ? input.events : ["LEAD_CREATED"],
      secret: input.secret ? String(input.secret) : null,
      isActive: input.isActive !== false,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,url,events,isActive,secret,createdAt,updatedAt")
    .single();
  if (error) throw error;
  await createAuditLog(user, "CREATE", "WEBHOOK", data.id, null, data, null);
  return data;
}

export async function deleteWebhookForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase.from("WebhookSubscription").delete().eq("id", id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await scopedQuery;
  if (error) throw error;
  await createAuditLog(user, "DELETE", "WEBHOOK", id, null, null, null);
}

export async function getTelephonySettingsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase.from("IntegrationSetting").select("id,type,config,isActive,updatedAt").eq("type", "TELEPHONY").limit(1);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();
  if (error) throw error;
  return data ?? { type: "TELEPHONY", config: { provider: "", agentPopupUrl: "", clickToCallUrl: "" }, isActive: false };
}

export async function saveTelephonySettingsForTenant(user: TenantUser, config: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const existing = await getTelephonySettingsForTenant(user) as { id?: string };
  const payload = {
    id: existing.id ?? randomUUID(),
    tenantId: user.tenantId,
    type: "TELEPHONY",
    config,
    isActive: Boolean(config.isActive),
    updatedBy: user.id,
    createdAt: existing.id ? undefined : now,
    updatedAt: now,
  };
  const { data, error } = await supabase
    .from("IntegrationSetting")
    .upsert(payload, { onConflict: "tenantId,type" })
    .select("id,type,config,isActive,updatedAt")
    .single();
  if (error) throw error;
  await createAuditLog(user, "UPDATE", "INTEGRATION_SETTING", data.id, null, data, { type: "TELEPHONY" });
  return data;
}

export async function listTelephonyCallLogsForTenant(user: TenantUser, limit = 100) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("TelephonyCallLog")
    .select("id,provider,callId,direction,fromNumber,toNumber,status,duration,recordingUrl,agentId,leadId,opportunityId,activityId,metadata,startedAt,endedAt,createdAt")
    .order("startedAt", { ascending: false })
    .limit(limit);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;
  return data ?? [];
}

export async function createTelephonyCallLogForTenant(user: TenantUser, input: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const callTypeId = await ensureSystemActivityType(user, "Call", "Phone", "#3b82f6");
  let activityId: string | null = null;

  if (input.leadId || input.opportunityId) {
    const activity = await createActivityForTenant(user, {
      typeId: callTypeId,
      leadId: input.leadId,
      opportunityId: input.opportunityId,
      outcome: input.status === "completed" ? "SUCCESS" : input.status ?? null,
      notes: [
        input.direction ? `Direction: ${input.direction}` : null,
        input.fromNumber ? `From: ${input.fromNumber}` : null,
        input.toNumber ? `To: ${input.toNumber}` : null,
        input.duration ? `Duration: ${input.duration}s` : null,
        input.recordingUrl ? `Recording: ${input.recordingUrl}` : null,
      ].filter(Boolean).join("\n"),
    });
    activityId = activity.id;
  }

  const { data, error } = await supabase
    .from("TelephonyCallLog")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      provider: input.provider ? String(input.provider) : "manual",
      callId: input.callId ? String(input.callId) : randomUUID(),
      direction: input.direction ? String(input.direction) : "OUTBOUND",
      fromNumber: input.fromNumber ? String(input.fromNumber) : null,
      toNumber: input.toNumber ? String(input.toNumber) : null,
      status: input.status ? String(input.status) : "completed",
      duration: input.duration == null ? null : Number(input.duration),
      recordingUrl: input.recordingUrl ? String(input.recordingUrl) : null,
      agentId: input.agentId ? String(input.agentId) : user.id,
      leadId: input.leadId ? String(input.leadId) : null,
      opportunityId: input.opportunityId ? String(input.opportunityId) : null,
      activityId,
      metadata: input.metadata ?? {},
      startedAt: input.startedAt ? String(input.startedAt) : now,
      endedAt: input.endedAt ? String(input.endedAt) : null,
      createdAt: now,
    })
    .select("id,provider,callId,direction,fromNumber,toNumber,status,duration,recordingUrl,agentId,leadId,opportunityId,activityId,metadata,startedAt,endedAt,createdAt")
    .single();
  if (error) throw error;
  await createAuditLog(user, "CREATE", "TELEPHONY_CALL_LOG", data.id, null, data, null).catch(() => undefined);
  return data;
}

export async function buildClickToCallPayloadForTenant(user: TenantUser, input: Record<string, unknown>) {
  const settings = await getTelephonySettingsForTenant(user);
  const config = (settings as any)?.config ?? {};
  const phoneNumber = String(input.phoneNumber ?? input.toNumber ?? "");
  if (!phoneNumber) throw new Error("PHONE_NUMBER_REQUIRED");
  const leadId = input.leadId ? String(input.leadId) : null;
  let lead: any = null;
  if (leadId) {
    const supabase = createSupabaseAdminClient();
    const query = supabase.from("Lead").select("id,name,email,phone,company,ownerId").eq("id", leadId).limit(1);
    const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
    const { data } = await scopedQuery.maybeSingle();
    lead = data;
  }
  const replacements: Record<string, string> = {
    "@leadPhone": phoneNumber,
    "@LeadPhone": phoneNumber,
    "@phoneNumber": phoneNumber,
    "@AgentNumberWithoutCC": String((user as any).phone ?? config.defaultAgentNumber ?? config.outboundCallerId ?? ""),
    "@agentPhone": String((user as any).phone ?? config.defaultAgentNumber ?? config.outboundCallerId ?? ""),
    "@AgentEmail": user.email ?? "",
    "@agentEmail": user.email ?? "",
    "@LeadId": leadId ?? "",
    "@leadId": leadId ?? "",
    "@LeadName": lead?.name ?? "",
    "@leadName": lead?.name ?? "",
  };
  const merge = (value: unknown) => {
    let text = String(value ?? "");
    for (const [token, replacement] of Object.entries(replacements)) {
      text = text.split(token).join(replacement);
    }
    return text;
  };
  const method = String(config.clickToCallMethod ?? "POST").toUpperCase();
  const requestType = String(config.clickToCallRequestType ?? "JSON").toUpperCase();
  const url = merge(config.clickToCallUrl ?? "");
  const headers = {
    ...(requestType === "JSON" ? { "Content-Type": "application/json" } : {}),
    ...((Array.isArray(config.clickToCallHeaders) ? config.clickToCallHeaders : []) as any[]).reduce((acc, header) => {
      if (header?.key) acc[String(header.key)] = merge(header.value);
      return acc;
    }, {} as Record<string, string>),
  };
  const rawBody = config.clickToCallTemplate
    ? merge(config.clickToCallTemplate)
    : JSON.stringify({ phoneNumber, leadId, agentId: input.agentId ?? user.id });
  const body = method === "GET" ? undefined : rawBody;
  let providerResponse: Record<string, unknown> | null = null;
  let executed = false;
  let success = false;

  if (url && input.execute !== false) {
    executed = true;
    try {
      const response = await fetch(url, { method, headers, body });
      const responseText = await response.text();
      const responseKeyword = String(config.clickToCallResponseKeyword ?? "success").toLowerCase();
      success = response.ok && (!responseKeyword || responseText.toLowerCase().includes(responseKeyword));
      providerResponse = { status: response.status, ok: response.ok, body: responseText.slice(0, 2000) };
    } catch (error: any) {
      providerResponse = { error: error?.message ?? "Provider request failed" };
    }
  }

  return {
    provider: config.provider ?? "",
    clickToCallUrl: url,
    agentPopupUrl: config.agentPopupUrl ?? "",
    executed,
    success,
    providerResponse,
    request: { method, headers, body },
    payload: {
      agentId: input.agentId ?? user.id,
      phoneNumber,
      leadId,
      opportunityId: input.opportunityId ?? null,
      metadata: input.metadata ?? {},
    },
  };
}

export async function getAgentPopupContextForTenant(user: TenantUser, input: Record<string, unknown>) {
  const phone = String(input.phoneNumber ?? input.fromNumber ?? input.toNumber ?? "");
  const supabase = createSupabaseAdminClient();
  let lead: any = null;
  if (phone) {
    const query = supabase.from("Lead").select("id,name,email,phone,company,status,source,ownerId").eq("phone", phone).limit(1);
    const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
    const { data } = await scopedQuery.maybeSingle();
    lead = data;
  }
  const opportunities = lead?.id ? await listOpportunitiesForTenant(user, 50) : { data: [] };
  return {
    lead: lead ? maskFieldsForUser(user, "leads", lead) : null,
    opportunities: (opportunities.data ?? []).filter((opportunity: any) => opportunity.leadId === lead?.id),
    recentCalls: phone ? (await listTelephonyCallLogsForTenant(user, 20)).filter((call: any) => call.fromNumber === phone || call.toNumber === phone) : [],
  };
}

export async function searchTenantData(user: TenantUser, term: string): Promise<GlobalSearchResults> {
  const supabase = createSupabaseAdminClient();
  const normalized = term.trim();

  if (!normalized) {
    return { leads: [], opportunities: [], activities: [] };
  }

  const leadQuery = supabase
    .from("Lead")
    .select("id,name,company")
    .or(`name.ilike.%${normalized}%,email.ilike.%${normalized}%,company.ilike.%${normalized}%`)
    .limit(8);
  const scopedLeadQuery = user.tenantId ? leadQuery.eq("tenantId", user.tenantId) : leadQuery.is("tenantId", null);

  const opportunityQuery = supabase
    .from("Opportunity")
    .select("id,title,amount")
    .or(`title.ilike.%${normalized}%`)
    .limit(8);
  const scopedOpportunityQuery = user.tenantId
    ? opportunityQuery.eq("tenantId", user.tenantId)
    : opportunityQuery.is("tenantId", null);

  const activityQuery = supabase
    .from("Activity")
    .select("id,notes")
    .or(`notes.ilike.%${normalized}%`)
    .limit(8);
  const scopedActivityQuery = user.tenantId ? activityQuery.eq("tenantId", user.tenantId) : activityQuery.is("tenantId", null);

  const [leadResult, opportunityResult, activityResult] = await Promise.all([
    scopedLeadQuery,
    scopedOpportunityQuery,
    scopedActivityQuery,
  ]);

  if (leadResult.error) throw leadResult.error;
  if (opportunityResult.error) throw opportunityResult.error;
  if (activityResult.error) throw activityResult.error;

  return {
    leads: (leadResult.data ?? []).map((item: any) => ({
      id: item.id,
      type: "lead" as const,
      name: item.name,
      company: item.company ?? null,
    })),
    opportunities: (opportunityResult.data ?? []).map((item: any) => ({
      id: item.id,
      type: "opportunity" as const,
      title: item.title,
      amount: item.amount == null ? null : Number(item.amount),
    })),
    activities: (activityResult.data ?? []).map((item: any) => ({
      id: item.id,
      type: "activity" as const,
      notes: item.notes ?? null,
    })),
  };
}

export async function listAutomationsForTenant(user: TenantUser) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("AutomationV2")
    .select("id,name,description,trigger,workflow,isActive,createdAt,updatedAt")
    .order("createdAt", { ascending: false });
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;

  const automationIds = (data ?? []).map((item: any) => item.id);
  const countMap = new Map<string, number>();
  if (automationIds.length > 0) {
    const execQuery = supabase.from("AutomationExecution").select("automationId");
    const scopedExecQuery = user.tenantId
      ? execQuery.eq("tenantId", user.tenantId).in("automationId", automationIds)
      : execQuery.is("tenantId", null).in("automationId", automationIds);
    const execResult = await scopedExecQuery;
    if (execResult.error) throw execResult.error;
    (execResult.data ?? []).forEach((item: any) => {
      countMap.set(item.automationId, (countMap.get(item.automationId) ?? 0) + 1);
    });
  }

  return (data ?? []).map((item: any) => ({
    ...item,
    _count: {
      executions: countMap.get(item.id) ?? 0,
    },
  }));
}

export async function getAutomationForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("AutomationV2")
    .select("id,name,description,trigger,workflow,isActive,createdAt,updatedAt,tenantId")
    .eq("id", id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();
  if (error) throw error;
  return data;
}

export async function createActivityTypeForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const objectId = await getObjectId(user, "activity");
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("ActivityType")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId,
      name: String(payload.name ?? "").trim(),
      icon: payload.icon ? String(payload.icon) : null,
      color: payload.color ? String(payload.color) : null,
      defaultOutcome: payload.defaultOutcome ? String(payload.defaultOutcome) : null,
      defaultSLA: payload.defaultSLA ? Number(payload.defaultSLA) : null,
      order: Number(payload.order ?? Date.now()),
      isActive: payload.isActive !== false,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,icon,color,defaultOutcome,defaultSLA,order,isActive,createdAt,updatedAt")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateActivityTypeForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const updatePayload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  for (const key of ["name", "icon", "color", "defaultOutcome"]) {
    if (key in payload) {
      updatePayload[key] = payload[key] === "" ? null : payload[key];
    }
  }

  if ("defaultSLA" in payload) {
    updatePayload.defaultSLA = payload.defaultSLA ? Number(payload.defaultSLA) : null;
  }

  if ("order" in payload) {
    updatePayload.order = Number(payload.order ?? 0);
  }

  if ("isActive" in payload) {
    updatePayload.isActive = payload.isActive !== false;
  }

  let query = supabase
    .from("ActivityType")
    .update(updatePayload)
    .eq("id", id);

  query = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);

  const { data, error } = await query
    .select("id,name,icon,color,defaultOutcome,defaultSLA,order,isActive,createdAt,updatedAt")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteActivityTypeForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("ActivityType").delete().eq("id", id);
  query = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await query;

  if (error) {
    throw error;
  }
}

export async function createAutomationForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("AutomationV2")
    .insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      name: payload.name,
      description: payload.description ?? null,
      trigger: payload.trigger ?? { type: "MANUAL" },
      steps: null,
      workflow: payload.workflow ?? { nodes: [], edges: [] },
      isActive: payload.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,trigger,workflow,isActive,createdAt,updatedAt,tenantId")
    .single();
  if (error) throw error;
  await createAuditLog(user, "CREATE", "AUTOMATION", data.id, null, data, null);
  return data;
}

export async function updateAutomationForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const existing = await getAutomationForTenant(user, id);
  const query = supabase
    .from("AutomationV2")
    .update({
      name: payload.name,
      description: payload.description,
      trigger: payload.trigger,
      workflow: payload.workflow,
      isActive: payload.isActive,
    })
    .eq("id", id)
    .select("id,name,description,trigger,workflow,isActive,createdAt,updatedAt,tenantId");
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.single();
  if (error) throw error;

  const diff: Record<string, unknown> = {};
  for (const key of ["name", "description", "trigger", "workflow", "isActive"] as const) {
    if (existing && JSON.stringify((existing as any)[key]) !== JSON.stringify((data as any)[key])) {
      diff[key] = { before: (existing as any)[key], after: (data as any)[key] };
    }
  }

  await createAuditLog(user, "UPDATE", "AUTOMATION", data.id, existing, data, Object.keys(diff).length ? diff : null);
  return data;
}

export async function deleteAutomationForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase.from("AutomationV2").delete().eq("id", id);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { error } = await scopedQuery;
  if (error) throw error;
}

export async function listAutomationExecutionsForTenant(user: TenantUser, automationId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("AutomationExecution")
    .select("id,status,entityType,entityId,executionLog,startedAt,completedAt,error")
    .eq("automationId", automationId)
    .order("startedAt", { ascending: false })
    .limit(50);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery;
  if (error) throw error;
  return data ?? [];
}

export async function testAutomationForTenant(
  user: TenantUser,
  automationId: string,
  input: { entityType: string; entityId: string }
) {
  const supabase = createSupabaseAdminClient();
  const automation = await getAutomationForTenant(user, automationId);
  if (!automation) throw new Error("AUTOMATION_NOT_FOUND");

  const record = await loadAutomationTestRecord(user, input.entityType, input.entityId);
  const log = await executeAutomationWorkflow(user, automation, input.entityType, input.entityId, record, "TEST");

  const executionRecord = {
    id: randomUUID(),
    tenantId: user.tenantId,
    automationId,
    status: "COMPLETED",
    entityType: input.entityType,
    entityId: input.entityId,
    context: { mode: "TEST" },
    executionLog: { steps: log, mode: "TEST" },
    workflowSnapshot: automation.workflow,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: null,
  };

  const { error } = await supabase.from("AutomationExecution").insert(executionRecord);
  if (error) throw error;

  return {
    success: true,
    log,
  };
}

async function loadAutomationTestRecord(user: TenantUser, entityType: string, entityId: string) {
  const supabase = createSupabaseAdminClient();
  const type = entityType.toUpperCase();
  const table = type === "OPPORTUNITY" ? "Opportunity" : type === "ACTIVITY" ? "Activity" : "Lead";
  const query = supabase.from(table).select("*").eq("id", entityId);
  const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
  const { data, error } = await scopedQuery.maybeSingle();
  if (error) throw error;
  return (data ?? { id: entityId }) as Record<string, unknown>;
}

async function executeAutomationWorkflow(
  user: TenantUser,
  automation: any,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  mode: "LIVE" | "TEST",
  options: { startNodeIds?: string[]; resumeJobId?: string } = {}
) {
  const workflow = (automation.workflow ?? {}) as { nodes?: any[]; edges?: any[] };
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const firstNode = nodes.find((node) => node.data?.type === "trigger") ?? nodes[0];
  const queue = options.startNodeIds?.length ? [...options.startNodeIds] : firstNode ? [firstNode.id] : [];
  const visited = new Set<string>();
  const log: Array<Record<string, unknown>> = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find((item) => item.id === nodeId);
    if (!node) continue;

    const nodeData = (node.data ?? {}) as Record<string, unknown>;
    const nodeType = String(nodeData.type ?? "step");
    const stepLog: Record<string, unknown> = {
      node: node.id,
      type: nodeType,
      action: nodeData.label ?? nodeType,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
    };

    const branchTypes = ["condition", "if_else", "compare", "multi_if_else", "split_test"];
    if (nodeType === "stop") {
      stepLog.status = "STOPPED";
      stepLog.reason = nodeData.reason ?? null;
    } else if (branchTypes.includes(nodeType)) {
      const nextEdges = automationNextEdges(edges, node.id, record, nodeData);
      stepLog.result = automationBranchLabelForNode(record, nodeData, edges.filter((edge) => edge.source === node.id).length);
      queue.push(...nextEdges.map((edge) => edge.target));
    } else if (["delay", "wait", "wait_until_activity"].includes(nodeType)) {
      const nextNodeIds = automationNextEdges(edges, node.id, record, nodeData).map((edge) => edge.target);
      if (nodeType === "wait_until_activity" && mode === "LIVE") {
        const satisfied = await automationWaitUntilActivitySatisfied(user, entityType, entityId, record, nodeData);
        stepLog.result = satisfied;
        if (satisfied) {
          queue.push(...nextNodeIds);
          log.push(stepLog);
          continue;
        }
      }
      const runAt = automationDelayDate(nodeData);
      stepLog.status = mode === "LIVE" ? "WAITING" : "TEST_WAIT_SKIPPED";
      stepLog.resumeNodeIds = nextNodeIds;
      stepLog.runAt = runAt.toISOString();

      if (mode === "LIVE" && nextNodeIds.length > 0 && user.tenantId) {
        await scheduleAutomationResume(user, automation, entityType, entityId, record, nextNodeIds, runAt, node.id);
      } else if (mode === "TEST") {
        queue.push(...nextNodeIds);
      }
    } else {
      if (mode === "LIVE") {
        await executeAutomationAction(user, entityType, entityId, record, nodeData);
      }
      queue.push(...automationNextEdges(edges, node.id, record, nodeData).map((edge) => edge.target));
    }

    log.push(stepLog);
  }

  return log;
}

async function scheduleAutomationResume(
  user: TenantUser,
  automation: any,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  resumeNodeIds: string[],
  runAt: Date,
  waitingNodeId: string
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("AutomationQueue").insert({
    id: randomUUID(),
    tenantId: user.tenantId,
    userId: user.id,
    automationId: automation.id,
    entityType,
    entityId,
    record,
    resumeNodeIds,
    waitingNodeId,
    status: "PENDING",
    runAt: runAt.toISOString(),
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function runAutomationsForEvent(
  user: TenantUser,
  eventType: string,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>
) {
  if (!user.tenantId) return [];

  const supabase = createSupabaseAdminClient();
  const { data: automations, error } = await supabase
    .from("AutomationV2")
    .select("id,name,trigger,workflow,isActive")
    .eq("tenantId", user.tenantId)
    .eq("isActive", true);

  if (error) throw error;

  const matched = (automations ?? []).filter((automation) =>
    triggerMatches((automation.trigger ?? {}) as Record<string, unknown>, eventType, record)
  );

  const results = [];
  for (const automation of matched) {
    const startedAt = new Date().toISOString();
    const log: Array<Record<string, unknown>> = [];

    try {
      log.push(...await executeAutomationWorkflow(user, automation, entityType, entityId, record, "LIVE"));

      const isWaiting = log.some((step) => step.status === "WAITING");
      const completedAt = isWaiting ? null : new Date().toISOString();
      await supabase.from("AutomationExecution").insert({
        id: randomUUID(),
        tenantId: user.tenantId,
        automationId: automation.id,
        status: isWaiting ? "WAITING" : "COMPLETED",
        entityType,
        entityId,
        context: { eventType },
        executionLog: { steps: log },
        workflowSnapshot: automation.workflow,
        startedAt,
        completedAt,
        error: null,
      });
      results.push({ automationId: automation.id, status: isWaiting ? "WAITING" : "COMPLETED" });
    } catch (executionError) {
      const message = executionError instanceof Error ? executionError.message : "Automation failed";
      await supabase.from("AutomationExecution").insert({
        id: randomUUID(),
        tenantId: user.tenantId,
        automationId: automation.id,
        status: "FAILED",
        entityType,
        entityId,
        context: { eventType },
        executionLog: { steps: log },
        workflowSnapshot: automation.workflow,
        startedAt,
        completedAt: new Date().toISOString(),
        error: message,
      });
      results.push({ automationId: automation.id, status: "FAILED", error: message });
    }
  }

  return results;
}

export async function processDueAutomationJobsForTenant(user: TenantUser, limit = 25) {
  if (!user.tenantId) return { processed: 0, failed: 0 };
  return processDueAutomationJobsInternal({ tenantId: user.tenantId, fallbackUser: user, limit });
}

export async function processDueAutomationJobs(limit = 50) {
  return processDueAutomationJobsInternal({ limit });
}

async function processDueAutomationJobsInternal(input: {
  tenantId?: string;
  fallbackUser?: TenantUser;
  limit: number;
}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("AutomationQueue")
    .select("id,tenantId,userId,automationId,entityType,entityId,record,resumeNodeIds,attempts")
    .eq("status", "PENDING")
    .lte("runAt", new Date().toISOString())
    .order("runAt", { ascending: true })
    .limit(input.limit);

  if (input.tenantId) query = query.eq("tenantId", input.tenantId);

  const { data: jobs, error } = await query;
  if (error) throw error;

  let processed = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const user = await resolveAutomationJobUser(job, input.fallbackUser);
    const startedAt = new Date().toISOString();
    const automation = await getAutomationForTenant(user, job.automationId);
    if (!automation || !automation.isActive) {
      await supabase.from("AutomationQueue").update({ status: "CANCELLED", updatedAt: new Date().toISOString() }).eq("id", job.id);
      continue;
    }

    try {
      await supabase.from("AutomationQueue").update({ status: "RUNNING", attempts: Number(job.attempts ?? 0) + 1, updatedAt: new Date().toISOString() }).eq("id", job.id);
      const log = await executeAutomationWorkflow(
        user,
        automation,
        job.entityType,
        job.entityId,
        (job.record ?? {}) as Record<string, unknown>,
        "LIVE",
        { startNodeIds: Array.isArray(job.resumeNodeIds) ? job.resumeNodeIds : [], resumeJobId: job.id }
      );
      const waiting = log.some((step) => step.status === "WAITING");
      await supabase.from("AutomationExecution").insert({
        id: randomUUID(),
        tenantId: user.tenantId,
        automationId: automation.id,
        status: waiting ? "WAITING" : "COMPLETED",
        entityType: job.entityType,
        entityId: job.entityId,
        context: { mode: "RESUME", queueId: job.id },
        executionLog: { steps: log, mode: "RESUME" },
        workflowSnapshot: automation.workflow,
        startedAt,
        completedAt: waiting ? null : new Date().toISOString(),
        error: null,
      });
      await supabase.from("AutomationQueue").update({ status: "COMPLETED", updatedAt: new Date().toISOString() }).eq("id", job.id);
      processed += 1;
    } catch (jobError) {
      const message = jobError instanceof Error ? jobError.message : "Automation resume failed";
      const attempts = Number(job.attempts ?? 0) + 1;
      const shouldRetry = attempts < 3;
      const updatePayload: Record<string, unknown> = {
        status: shouldRetry ? "PENDING" : "FAILED",
        lastError: message,
        updatedAt: new Date().toISOString(),
      };
      if (shouldRetry) {
        updatePayload.runAt = new Date(Date.now() + attempts * attempts * 60_000).toISOString();
      }
      await supabase
        .from("AutomationQueue")
        .update(updatePayload)
        .eq("id", job.id);
      failed += 1;
    }
  }

  return { processed, failed };
}

async function resolveAutomationJobUser(job: any, fallbackUser?: TenantUser): Promise<TenantUser> {
  if (fallbackUser && fallbackUser.tenantId === job.tenantId) return fallbackUser;
  const supabase = createSupabaseAdminClient();
  if (job.userId) {
    const { data } = await supabase
      .from("User")
      .select("id,name,email,tenantId")
      .eq("id", job.userId)
      .eq("tenantId", job.tenantId)
      .maybeSingle();
    if (data?.id) return data;
  }
  const { data } = await supabase
    .from("User")
    .select("id,name,email,tenantId")
    .eq("tenantId", job.tenantId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();
  return data ?? { id: "automation-worker", tenantId: job.tenantId };
}

async function executeAutomationAction(
  user: TenantUser,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  nodeData: Record<string, unknown>
) {
  const supabase = createSupabaseAdminClient();
  const type = String(nodeData.type ?? "");

  if (type === "trigger" || type === "branch" || type === "delay" || type === "wait" || type === "wait_until_activity" || type === "split_test") return;

  if (type === "update_field" || type === "update_lead" || type === "update_opportunity") {
    const updates = Array.isArray(nodeData.updates)
      ? nodeData.updates as Array<Record<string, unknown>>
      : nodeData.field
        ? [{ field: nodeData.field, value: nodeData.value }]
        : [];
    const table = type === "update_opportunity" ? "Opportunity" : type === "update_lead" ? "Lead" : entityType === "OPPORTUNITY" ? "Opportunity" : "Lead";
    const targetId = table === "Lead" && entityType === "OPPORTUNITY" ? String(record.leadId ?? "") : entityId;
    if (!targetId) return;
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const update of updates) {
      const field = String(update.field ?? "");
      if (!field) continue;
      updatePayload[field.replace(/^(lead|opportunity)\./, "")] = update.value ?? null;
    }
    if (Object.keys(updatePayload).length <= 1) return;
    await supabase.from(table).update(updatePayload).eq("id", targetId);
    return;
  }

  if (type === "update_activity") {
    const updates = Array.isArray(nodeData.updates)
      ? nodeData.updates as Array<Record<string, unknown>>
      : nodeData.field
        ? [{ field: nodeData.field, value: nodeData.value }]
        : [];
    const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const update of updates) {
      const field = String(update.field ?? "");
      if (!field) continue;
      updatePayload[field.replace(/^activity\./, "")] = update.value ?? null;
    }
    if (Object.keys(updatePayload).length <= 1) return;
    await supabase.from("Activity").update(updatePayload).eq("id", entityId);
    return;
  }

  if (type === "clear_field") {
    const field = String(nodeData.field ?? "");
    if (!field) return;
    const table = field.startsWith("opportunity.") ? "Opportunity" : field.startsWith("activity.") ? "Activity" : "Lead";
    const targetId = table === "Opportunity"
      ? entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "")
      : table === "Activity"
        ? entityType === "ACTIVITY" ? entityId : String(record.activityId ?? "")
        : entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!targetId) return;
    await supabase.from(table).update({ [field.replace(/^(lead|opportunity|activity)\./, "")]: null, updatedAt: new Date().toISOString() }).eq("id", targetId);
    return;
  }

  if (type === "create_activity" || type === "add_activity") {
    const activityObjectId = await getObjectId(user, "activity");
    const typeId = nodeData.activityTypeId ?? nodeData.typeId;
    if (!typeId) return;
    await supabase.from("Activity").insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId: activityObjectId,
      typeId,
      leadId: entityType === "LEAD" ? entityId : record.leadId ?? null,
      opportunityId: entityType === "OPPORTUNITY" ? entityId : null,
      outcome: nodeData.outcome ?? null,
      notes: nodeData.notes ?? nodeData.subject ?? null,
      dueAt: nodeData.dueAt ?? null,
      completedAt: null,
      slaStatus: "PENDING",
      slaTarget: null,
      isRecurring: false,
      recurrenceRule: null,
      seriesId: null,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (type === "distribute_lead" || type === "distribute_opportunity") {
    await distributeRecord(user, type === "distribute_opportunity" ? "OPPORTUNITY" : "LEAD", entityId, record);
    return;
  }

  if (type === "assign_owner") {
    const ownerId = String(nodeData.ownerId ?? "");
    if (!ownerId) return;
    const target = String(nodeData.target ?? "current");
    const table = target === "opportunity" || (target === "current" && entityType === "OPPORTUNITY") ? "Opportunity" : "Lead";
    const targetId = table === "Opportunity"
      ? entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "")
      : entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!targetId) return;
    await supabase.from(table).update({ ownerId, updatedAt: new Date().toISOString() }).eq("id", targetId);
    return;
  }

  if (type === "change_stage") {
    const stageId = String(nodeData.stageId ?? "");
    const targetId = entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "");
    if (!stageId || !targetId) return;
    await supabase.from("Opportunity").update({ stageId, updatedAt: new Date().toISOString() }).eq("id", targetId);
    return;
  }

  if (type === "add_opportunity") {
    const opportunityObjectId = await getObjectId(user, "opportunity");
    const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!leadId || !nodeData.opportunityTypeId) return;
    await supabase.from("Opportunity").insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      objectId: opportunityObjectId,
      leadId,
      opportunityTypeId: nodeData.opportunityTypeId,
      stageId: null,
      title: nodeData.title ?? "Automation Opportunity",
      amount: nodeData.amount ? Number(nodeData.amount) : null,
      expectedCloseDate: null,
      priority: nodeData.priority ?? "MEDIUM",
      tags: [],
      ownerId: null,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (type === "add_to_list" || type === "remove_from_list") {
    const listId = String(nodeData.listId ?? "");
    const targetId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!listId || !targetId) return;
    if (type === "add_to_list") {
      await addLeadsToLeadListForTenant(user, listId, [targetId]);
    } else {
      await removeLeadFromLeadListForTenant(user, listId, targetId);
    }
    return;
  }

  if (type === "tag_lead" || type === "star_lead" || type === "remove_tag") {
    const targetId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!targetId) return;
    const tagValue = type === "star_lead" ? "STARRED" : String(nodeData.value ?? "").trim();
    if (!tagValue) return;
    const { data } = await supabase.from("Lead").select("tags").eq("id", targetId).maybeSingle();
    const tags = Array.isArray(data?.tags) ? data.tags : [];
    const nextTags = type === "remove_tag" ? tags.filter((tag) => String(tag) !== tagValue) : [...new Set([...tags, tagValue])];
    await supabase.from("Lead").update({ tags: nextTags, updatedAt: new Date().toISOString() }).eq("id", targetId);
    return;
  }

  if (type === "increment_score") {
    const targetId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!targetId) return;
    const delta = Number(nodeData.value ?? 0);
    const { data } = await supabase.from("Lead").select("score").eq("id", targetId).maybeSingle();
    await supabase.from("Lead").update({ score: Number(data?.score ?? 0) + delta, updatedAt: new Date().toISOString() }).eq("id", targetId);
    return;
  }

  if (type === "notify_user") {
    const targetUserId = String(nodeData.userId ?? user.id);
    await supabase.from("Notification").insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      userId: targetUserId,
      title: nodeData.title ?? "Automation notification",
      message: nodeData.message ?? `${entityType} ${entityId} matched an automation rule.`,
      data: { entityType, entityId, automationNode: nodeData.label ?? type },
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    });
    return;
  }

  if (type === "webhook" && nodeData.url) {
    await fetch(String(nodeData.url), {
      method: String(nodeData.method ?? "POST"),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, record }),
    });
  }
}

export async function updateOpportunityForTenant(
  user: TenantUser,
  id: string,
  payload: Record<string, unknown>
) {
  const supabase = createSupabaseAdminClient();
  const editablePayload = editablePayloadForUser(user, "opportunities", payload);
  const existingQuery = supabase
    .from("Opportunity")
    .select("id,tenantId,objectId,leadId,opportunityTypeId,stageId,title,amount,expectedCloseDate,priority,tags,ownerId,createdAt,updatedAt")
    .eq("id", id);
  const existingScopedQuery = user.tenantId
    ? existingQuery.eq("tenantId", user.tenantId)
    : existingQuery.is("tenantId", null);
  const { data: existing, error: existingError } = await existingScopedQuery.maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const updatePayload = {
    stageId: editablePayload.stageId,
    title: editablePayload.title,
    amount: editablePayload.amount,
    expectedCloseDate: editablePayload.expectedCloseDate,
    priority: editablePayload.priority,
    opportunityTypeId: editablePayload.opportunityTypeId,
  };

  const { data, error } = await (user.tenantId
    ? supabase
        .from("Opportunity")
        .update(updatePayload)
        .eq("tenantId", user.tenantId)
        .eq("id", id)
        .select("id,tenantId,objectId,leadId,opportunityTypeId,stageId,title,amount,expectedCloseDate,priority,tags,ownerId,createdAt,updatedAt")
        .single()
    : supabase
        .from("Opportunity")
        .update(updatePayload)
        .is("tenantId", null)
        .eq("id", id)
        .select("id,tenantId,objectId,leadId,opportunityTypeId,stageId,title,amount,expectedCloseDate,priority,tags,ownerId,createdAt,updatedAt")
        .single());

  if (error) {
    throw error;
  }

  if (existing?.stageId && existing.stageId !== data.stageId) {
    const { error: historyError } = await supabase.from("OpportunityStageHistory").insert({
      id: randomUUID(),
      tenantId: user.tenantId,
      opportunityId: data.id,
      fromStageId: existing.stageId,
      toStageId: data.stageId,
      changedById: user.id,
      notes: null,
    });

    if (historyError) {
      throw historyError;
    }
  }

  const diff = buildFieldDiff(existing as Record<string, any>, data as Record<string, any>);

  await createAuditLog(
    user,
    "UPDATE",
    "OPPORTUNITY",
    data.id,
    existing ?? null,
    data,
    Object.keys(diff).length > 0 ? diff : null
  );
  if (user.tenantId) {
    await runAutomationsForEvent(
      user,
      existing?.stageId && existing.stageId !== data.stageId ? "STAGE_CHANGED" : "OPPORTUNITY_UPDATED",
      "OPPORTUNITY",
      data.id,
      data
    );
  }

  return maskFieldsForUser(user, "opportunities", data);
}

export async function deleteOpportunityForTenant(user: TenantUser, id: string) {
  const supabase = createSupabaseAdminClient();

  const scopedDelete = user.tenantId
    ? supabase.from("Opportunity").delete().eq("tenantId", user.tenantId).eq("id", id)
    : supabase.from("Opportunity").delete().is("tenantId", null).eq("id", id);

  const { error } = await scopedDelete;
  if (error) {
    throw error;
  }
}

import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
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

function normalizeEntityType(entityType: string) {
  return entityType.toUpperCase() as NoteEntityType;
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
    data: (data ?? []).map((lead: any) => ({
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

    return lead;
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

  return {
    ...data,
    assignedUserId: data.ownerId ?? null,
  };
}

export async function updateLeadForTenant(
  user: TenantUser,
  id: string,
  payload: Record<string, unknown>
) {
  const supabase = createSupabaseAdminClient();
  const existing = await getLeadForTenant(user, id);

  if (!existing) {
    return null;
  }

  const updatePayload = {
    name: payload.name,
    email: payload.email || null,
    phone: payload.phone || null,
    company: payload.company || null,
    source: payload.source || null,
    status: payload.status || existing.status,
    ownerId: payload.ownerId || null,
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

  const diff: Record<string, unknown> = {};
  for (const key of ["name", "email", "phone", "company", "source", "status", "ownerId"] as const) {
    if ((existing as any)[key] !== (data as any)[key]) {
      diff[key] = {
        before: (existing as any)[key] ?? null,
        after: (data as any)[key] ?? null,
      };
    }
  }

  await createAuditLog(
    user,
    "UPDATE",
    "LEAD",
    lead.id,
    existing,
    lead,
    Object.keys(diff).length > 0 ? diff : null
  );

  return lead;
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
  const supabase = createSupabaseAdminClient();

  const query = supabase
    .from("Opportunity")
    .select("id,tenantId,objectId,leadId,opportunityTypeId,stageId,title,amount,expectedCloseDate,priority,tags,ownerId,createdAt,updatedAt")
    .order("createdAt", { ascending: false })
    .limit(limit);

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
    data: (opportunities ?? []).map((opportunity: any) => ({
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

    return data;
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

  if (data.length === 0 && user.tenantId) {
    const activityObjectId = await getObjectId(user, "activity");
    const now = new Date().toISOString();
    const { error: seedError } = await supabase.from("ActivityType").insert([
      {
        id: randomUUID(),
        tenantId: user.tenantId,
        objectId: activityObjectId,
        name: "Call",
        icon: "Phone",
        color: "#3b82f6",
        defaultOutcome: "FOLLOW_UP_NEEDED",
        defaultSLA: 60,
        order: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        tenantId: user.tenantId,
        objectId: activityObjectId,
        name: "Email",
        icon: "Mail",
        color: "#8b5cf6",
        defaultOutcome: "SUCCESS",
        defaultSLA: 240,
        order: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        tenantId: user.tenantId,
        objectId: activityObjectId,
        name: "Meeting",
        icon: "Calendar",
        color: "#10b981",
        defaultOutcome: "SUCCESS",
        defaultSLA: 1440,
        order: 2,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    if (seedError) {
      throw seedError;
    }

    data = await fetchTypes();
  }

  return data.map((item) => ({
    ...item,
    defaultSLA: item.defaultSLA ?? null,
    description: null,
  }));
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
  const userMap = new Map((users.data ?? []).map((record: any) => [record.id, record]));
  const leadMap = new Map(leads.data.map((record: any) => [record.id, record]));
  const opportunityMap = new Map(opportunities.data.map((record: any) => [record.id, record]));

  return {
    data: (data ?? []).map((item: any) => ({
      ...item,
      duration: null,
      customFields: null,
      type: typeMap.get(item.typeId),
      user: userMap.get(item.createdBy) ?? null,
      lead: item.leadId ? leadMap.get(item.leadId) ?? null : null,
      opportunity: item.opportunityId ? opportunityMap.get(item.opportunityId) ?? null : null,
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

    return activity;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`CREATE_ACTIVITY_FAILED: ${error.message}`);
    }

    throw error;
  }
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

  return (data ?? []).map((item) => ({
    id: item.id,
    action: item.action,
    createdAt: item.createdAt,
    user: userMap.get(item.userId) ?? { name: "Unknown User", email: "" },
    changes: {
      before: item.before,
      after: item.after,
      diff: item.diff,
    },
  }));
}

export async function listAuditLogsForTenant(
  user: TenantUser,
  filters?: { entityType?: string; action?: string }
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
    .select("id,name,description,fields,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
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
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,fields,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return formatFormRecord(data, 0);
}

export async function getFormForTenant(user: TenantUser, formId: string) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("Form")
    .select("id,name,description,fields,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
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

  const query = supabase
    .from("Form")
    .update(updatePayload)
    .eq("id", formId)
    .select("id,name,description,fields,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt");
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
    .select("id,name,description,fields,isActive,submitButtonText,successMessage,redirectUrl,spamProtection,rateLimit,duplicateAction,theme,createdAt,updatedAt")
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

  const leadData = payload;
  const leadsQuery = supabase
    .from("Lead")
    .select("id,name,email")
    .eq("tenantId", tenantId)
    .limit(1);

  let leadId: string | null = null;
  const email = typeof leadData.email === "string" ? leadData.email : typeof leadData.Email === "string" ? leadData.Email : null;
  if (email) {
    const existingLead = await leadsQuery.eq("email", email).maybeSingle();
    if (existingLead.error) throw existingLead.error;
    if (existingLead.data?.id) {
      leadId = existingLead.data.id;
    }
  }

  if (!leadId) {
    const objectId = await getObjectId({ id: "public-form", tenantId }, "lead");
    const now = new Date().toISOString();
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
      .select("id")
      .single();
    if (createdLead.error) throw createdLead.error;
    leadId = createdLead.data.id;
  }

  const utmParams = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key.startsWith("utm_"))
  );

  const { error } = await supabase.from("FormSubmission").insert({
    id: randomUUID(),
    tenantId,
    formId: form.id,
    leadId,
    data: payload,
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

  return { success: true, leadId };
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

  const nodes = Array.isArray((automation.workflow as any)?.nodes) ? ((automation.workflow as any).nodes as any[]) : [];
  const log = nodes.map((node, index) => ({
    node: node.id,
    type: node.data?.type ?? "step",
    status: "TEST_SUCCESS",
    action: node.data?.label ?? `Step ${index + 1}`,
    result: true,
    timestamp: new Date().toISOString(),
  }));

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

export async function updateOpportunityForTenant(
  user: TenantUser,
  id: string,
  payload: Record<string, unknown>
) {
  const supabase = createSupabaseAdminClient();
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
    stageId: payload.stageId,
    title: payload.title,
    amount: payload.amount,
    expectedCloseDate: payload.expectedCloseDate,
    priority: payload.priority,
    opportunityTypeId: payload.opportunityTypeId,
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

  const diff: Record<string, unknown> = {};
  for (const key of ["stageId", "title", "amount", "expectedCloseDate", "priority", "opportunityTypeId"] as const) {
    if (existing && existing[key] !== data[key]) {
      diff[key] = { before: existing[key], after: data[key] };
    }
  }

  await createAuditLog(
    user,
    "UPDATE",
    "OPPORTUNITY",
    data.id,
    existing ?? null,
    data,
    Object.keys(diff).length > 0 ? diff : null
  );

  return data;
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

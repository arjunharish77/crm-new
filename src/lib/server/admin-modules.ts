import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
};

type GeneralSettings = {
  companyName: string;
  timezone: string;
  currency: string;
  language: string;
  dateFormat: string;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  return user.tenantId;
}

async function getObjectDefinitionId(tenantId: string, objectType: string) {
  const supabase = createSupabaseAdminClient();
  const objectNameMap: Record<string, string> = {
    LEAD: "lead",
    OPPORTUNITY: "opportunity",
    ACTIVITY: "activity",
  };

  const objectName = objectNameMap[objectType.toUpperCase()];
  if (!objectName) {
    throw new Error(`Unsupported object type: ${objectType}`);
  }

  const { data, error } = await supabase
    .from("ObjectDefinition")
    .select("id")
    .eq("tenantId", tenantId)
    .eq("name", objectName)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error(`Missing object definition for ${objectType}`);
  }

  return data.id;
}

function normalizeFieldType(type?: string) {
  if (!type) return "TEXT";
  if (type === "SELECT") return "DROPDOWN";
  if (type === "CHECKBOX") return "BOOLEAN";
  if (type === "TEXTAREA") return "TEXT";
  return type;
}

function denormalizeFieldType(type?: string) {
  if (!type) return "TEXT";
  if (type === "DROPDOWN") return "SELECT";
  if (type === "BOOLEAN") return "CHECKBOX";
  return type;
}

function getFieldOptions(type: string, options: unknown) {
  if (type !== "SELECT" && type !== "DROPDOWN" && type !== "MULTI_SELECT") {
    return [];
  }

  if (Array.isArray(options)) {
    return options.map((item) => String(item));
  }

  return [];
}

function getGeneralSettingsFromFeatureFlags(featureFlags: unknown): Omit<GeneralSettings, "companyName"> {
  const settings =
    featureFlags &&
    typeof featureFlags === "object" &&
    !Array.isArray(featureFlags) &&
    "generalSettings" in featureFlags &&
    featureFlags.generalSettings &&
    typeof featureFlags.generalSettings === "object" &&
    !Array.isArray(featureFlags.generalSettings)
      ? (featureFlags.generalSettings as Record<string, unknown>)
      : {};

  return {
    timezone: typeof settings.timezone === "string" ? settings.timezone : "America/New_York",
    currency: typeof settings.currency === "string" ? settings.currency : "USD",
    language: typeof settings.language === "string" ? settings.language : "en",
    dateFormat: typeof settings.dateFormat === "string" ? settings.dateFormat : "MM/dd/yyyy",
  };
}

function evaluateRuleAgainstLead(rule: any, lead: any) {
  const fieldValue = lead[rule.fieldKey];
  const compareValue = rule.value;

  switch (rule.operator) {
    case "EQUALS":
      return String(fieldValue ?? "") === String(compareValue ?? "");
    case "NOT_EQUALS":
      return String(fieldValue ?? "") !== String(compareValue ?? "");
    case "CONTAINS":
      return String(fieldValue ?? "").toLowerCase().includes(String(compareValue ?? "").toLowerCase());
    case "GT":
      return Number(fieldValue ?? 0) > Number(compareValue ?? 0);
    case "LT":
      return Number(fieldValue ?? 0) < Number(compareValue ?? 0);
    case "IS_SET":
      return fieldValue !== null && fieldValue !== undefined && String(fieldValue) !== "";
    case "IS_NOT_SET":
      return fieldValue === null || fieldValue === undefined || String(fieldValue) === "";
    default:
      return false;
  }
}

export async function listSalesGroupsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();

  const [{ data: groups, error: groupError }, { data: members, error: memberError }] = await Promise.all([
    supabase
      .from("SalesGroup")
      .select("id,name,description,managerId,isActive,createdAt,updatedAt")
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false }),
    supabase
      .from("SalesGroupMember")
      .select("id,groupId,userId,role,joinedAt")
      .eq("tenantId", tenantId),
  ]);

  if (groupError) throw groupError;
  if (memberError) throw memberError;

  const userIds = [...new Set((members ?? []).map((item) => item.userId).filter(Boolean))];
  const usersResult = userIds.length
    ? await supabase
        .from("User")
        .select("id,name,email")
        .eq("tenantId", tenantId)
        .in("id", userIds)
    : { data: [], error: null };

  if (usersResult.error) throw usersResult.error;

  const userMap = new Map((usersResult.data ?? []).map((record) => [record.id, record]));

  return (groups ?? []).map((group) => {
    const groupMembers = (members ?? [])
      .filter((member) => member.groupId === group.id)
      .map((member) => ({
        ...member,
        user: userMap.get(member.userId) ?? null,
      }))
      .filter((member) => member.user);

    return {
      ...group,
      members: groupMembers,
      _count: {
        members: groupMembers.length,
      },
    };
  });
}

export async function createSalesGroupForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("SalesGroup")
    .insert({
      id: randomUUID(),
      tenantId,
      name: String(input.name ?? "").trim(),
      description: input.description ? String(input.description) : null,
      managerId: input.managerId ? String(input.managerId) : null,
      territories: input.territories ?? null,
      zipCodes: input.zipCodes ?? null,
      states: input.states ?? null,
      countries: input.countries ?? null,
      skills: input.skills ?? null,
      languages: input.languages ?? null,
      productLines: input.productLines ?? null,
      maxLeadsPerMember: Number(input.maxLeadsPerMember ?? 50),
      workingHours: input.workingHours ?? null,
      timezone: input.timezone ? String(input.timezone) : "UTC",
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,managerId,isActive,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function updateSalesGroupForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();

  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  for (const key of [
    "name",
    "description",
    "managerId",
    "territories",
    "zipCodes",
    "states",
    "countries",
    "skills",
    "languages",
    "productLines",
    "workingHours",
    "timezone",
    "isActive",
  ]) {
    if (key in input) {
      payload[key] = input[key];
    }
  }

  if ("maxLeadsPerMember" in input) {
    payload.maxLeadsPerMember = Number(input.maxLeadsPerMember ?? 50);
  }

  const { data, error } = await supabase
    .from("SalesGroup")
    .update(payload)
    .eq("tenantId", tenantId)
    .eq("id", id)
    .select("id,name,description,managerId,isActive,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSalesGroupForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("SalesGroup").delete().eq("tenantId", tenantId).eq("id", id);
  if (error) throw error;
}

export async function addSalesGroupMemberForTenant(
  user: TenantUser,
  groupId: string,
  memberInput: { userId: string; role?: string }
) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("SalesGroupMember")
    .insert({
      id: randomUUID(),
      groupId,
      userId: memberInput.userId,
      tenantId,
      role: memberInput.role ?? "MEMBER",
    })
    .select("id,groupId,userId,role,joinedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function removeSalesGroupMemberForTenant(user: TenantUser, groupId: string, userId: string) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("SalesGroupMember")
    .delete()
    .eq("tenantId", tenantId)
    .eq("groupId", groupId)
    .eq("userId", userId);

  if (error) throw error;
}

export async function listAssignmentRulesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("AssignmentRule")
    .select("id,name,description,entityType,priority,isActive,conditions,strategy,targetGroupId,targetUserIds,createdAt,updatedAt")
    .eq("tenantId", tenantId)
    .order("priority", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((rule) => ({
    ...rule,
    type: rule.strategy,
    config: {
      salesGroupId: rule.targetGroupId ?? undefined,
      userPool: rule.targetUserIds ?? [],
      matchingKeys:
        rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions)
          ? (rule.conditions as Record<string, unknown>)
          : {},
    },
  }));
}

export async function createAssignmentRuleForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const config = (input.config as Record<string, unknown>) ?? {};
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("AssignmentRule")
    .insert({
      id: randomUUID(),
      tenantId,
      name: String(input.name ?? "").trim(),
      description: input.description ? String(input.description) : null,
      entityType: input.entityType ? String(input.entityType) : "LEAD",
      priority: Number(input.priority ?? 0),
      isActive: input.isActive !== false,
      conditions: (config.matchingKeys as Record<string, unknown>) ?? {},
      strategy: input.type ? String(input.type) : "ROUND_ROBIN",
      targetGroupId: config.salesGroupId ? String(config.salesGroupId) : null,
      targetUserIds: Array.isArray(config.userPool) ? config.userPool.map(String) : [],
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,entityType,priority,isActive,conditions,strategy,targetGroupId,targetUserIds,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function updateAssignmentRuleForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const config = (input.config as Record<string, unknown>) ?? {};

  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if ("name" in input) payload.name = String(input.name ?? "").trim();
  if ("description" in input) payload.description = input.description ? String(input.description) : null;
  if ("entityType" in input) payload.entityType = String(input.entityType ?? "LEAD");
  if ("priority" in input) payload.priority = Number(input.priority ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  if ("type" in input) payload.strategy = String(input.type ?? "ROUND_ROBIN");
  if ("config" in input) {
    payload.conditions = (config.matchingKeys as Record<string, unknown>) ?? {};
    payload.targetGroupId = config.salesGroupId ? String(config.salesGroupId) : null;
    payload.targetUserIds = Array.isArray(config.userPool) ? config.userPool.map(String) : [];
  }

  const { data, error } = await supabase
    .from("AssignmentRule")
    .update(payload)
    .eq("tenantId", tenantId)
    .eq("id", id)
    .select("id,name,description,entityType,priority,isActive,conditions,strategy,targetGroupId,targetUserIds,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAssignmentRuleForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("AssignmentRule").delete().eq("tenantId", tenantId).eq("id", id);
  if (error) throw error;
}

export async function listLeadScoringRulesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("LeadScoringRule")
    .select("id,name,description,fieldKey,operator,value,scoreChange,isActive,order,createdAt,updatedAt")
    .eq("tenantId", tenantId)
    .order("order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createLeadScoringRuleForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("LeadScoringRule")
    .insert({
      id: randomUUID(),
      tenantId,
      name: String(input.name ?? "").trim(),
      description: input.description ? String(input.description) : null,
      fieldKey: String(input.fieldKey ?? ""),
      operator: String(input.operator ?? "EQUALS"),
      value: input.value ? String(input.value) : null,
      scoreChange: Number(input.scoreChange ?? 0),
      isActive: input.isActive !== false,
      order: Number(input.order ?? 0),
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,fieldKey,operator,value,scoreChange,isActive,order,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function updateLeadScoringRuleForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "description", "fieldKey", "operator", "value"]) {
    if (key in input) {
      payload[key] = input[key] === "" ? null : input[key];
    }
  }
  if ("scoreChange" in input) payload.scoreChange = Number(input.scoreChange ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  if ("order" in input) payload.order = Number(input.order ?? 0);

  const { data, error } = await supabase
    .from("LeadScoringRule")
    .update(payload)
    .eq("tenantId", tenantId)
    .eq("id", id)
    .select("id,name,description,fieldKey,operator,value,scoreChange,isActive,order,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteLeadScoringRuleForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("LeadScoringRule").delete().eq("tenantId", tenantId).eq("id", id);
  if (error) throw error;
}

export async function recomputeLeadScoresForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const [rules, leadsResult] = await Promise.all([
    listLeadScoringRulesForTenant(user),
    supabase.from("Lead").select("id,name,email,phone,company,status,source,score").eq("tenantId", tenantId),
  ]);

  if (leadsResult.error) throw leadsResult.error;

  const activeRules = rules.filter((rule) => rule.isActive).sort((a, b) => a.order - b.order);
  const leads = leadsResult.data ?? [];

  await Promise.all(
    leads.map(async (lead) => {
      let score = 0;

      for (const rule of activeRules) {
        if (evaluateRuleAgainstLead(rule, lead)) {
          score += Number(rule.scoreChange ?? 0);
        }
      }

      const nextScore = Math.max(0, Math.min(100, score));
      const { error } = await supabase
        .from("Lead")
        .update({ score: nextScore, updatedAt: new Date().toISOString() })
        .eq("tenantId", tenantId)
        .eq("id", lead.id);

      if (error) throw error;
    })
  );

  return { count: leads.length };
}

export async function listCustomFieldsForTenant(user: TenantUser, objectType?: string | null) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const objectIds = objectType ? [await getObjectDefinitionId(tenantId, objectType)] : [];
  let query = supabase
    .from("FieldDefinition")
    .select("id,objectId,key,label,type,isRequired,isUnique,isImmutable,defaultValue,options,order,isActive,createdAt,updatedAt,isCustom")
    .eq("tenantId", tenantId)
    .eq("isCustom", true)
    .is("deletedAt", null)
    .order("order", { ascending: true });

  if (objectIds.length > 0) {
    query = query.eq("objectId", objectIds[0]);
  }

  const [{ data: fields, error }, { data: objects, error: objectError }] = await Promise.all([
    query,
    supabase.from("ObjectDefinition").select("id,name").eq("tenantId", tenantId),
  ]);

  if (error) throw error;
  if (objectError) throw objectError;

  const objectNameMap = new Map(
    (objects ?? []).map((object) => [object.id, object.name.toUpperCase()])
  );

  return (fields ?? []).map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    objectType: objectNameMap.get(field.objectId) ?? "LEAD",
    fieldType: denormalizeFieldType(field.type),
    type: field.type,
    required: field.isRequired ?? false,
    isRequired: field.isRequired ?? false,
    isSystem: !field.isCustom,
    metadata: {
      options: getFieldOptions(field.type, field.options),
    },
    options: getFieldOptions(field.type, field.options),
    order: field.order ?? 0,
    isActive: field.isActive ?? true,
  }));
}

export async function reorderCustomFieldsForTenant(user: TenantUser, ids: string[]) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  await Promise.all(
    ids.map(async (id, index) => {
      const { error } = await supabase
        .from("FieldDefinition")
        .update({ order: index + 1, updatedAt: now })
        .eq("tenantId", tenantId)
        .eq("id", id);

      if (error) throw error;
    })
  );
}

export async function createCustomFieldForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const objectType = String(input.objectType ?? "LEAD");
  const objectId = await getObjectDefinitionId(tenantId, objectType);
  const now = new Date().toISOString();
  const normalizedType = normalizeFieldType(String(input.type ?? input.fieldType ?? "TEXT"));

  const { data, error } = await supabase
    .from("FieldDefinition")
    .insert({
      id: randomUUID(),
      tenantId,
      objectId,
      key: String(input.key ?? ""),
      label: String(input.label ?? ""),
      type: normalizedType,
      storageStrategy: "HYBRID",
      isCustom: true,
      isRequired: input.required === true || input.isRequired === true,
      isUnique: false,
      isImmutable: false,
      defaultValue: null,
      options: Array.isArray(input.options) ? input.options : null,
      order: Number(input.order ?? 0),
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,objectId,key,label,type,isRequired,options,order,isActive,isCustom")
    .single();

  if (error) throw error;
  return data;
}

export async function updateCustomFieldForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if ("label" in input) payload.label = String(input.label ?? "");
  if ("key" in input) payload.key = String(input.key ?? "");
  if ("type" in input || "fieldType" in input) {
    payload.type = normalizeFieldType(String(input.type ?? input.fieldType ?? "TEXT"));
  }
  if ("required" in input || "isRequired" in input) {
    payload.isRequired = input.required === true || input.isRequired === true;
  }
  if ("options" in input) {
    payload.options = Array.isArray(input.options) ? input.options : null;
  }
  if ("order" in input) payload.order = Number(input.order ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;

  const { data, error } = await supabase
    .from("FieldDefinition")
    .update(payload)
    .eq("tenantId", tenantId)
    .eq("id", id)
    .select("id,objectId,key,label,type,isRequired,options,order,isActive,isCustom")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCustomFieldForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("FieldDefinition")
    .update({ deletedAt: new Date().toISOString(), isActive: false })
    .eq("tenantId", tenantId)
    .eq("id", id);

  if (error) throw error;
}

export async function listPipelinesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");

  const [{ data: types, error: typeError }, { data: stages, error: stageError }] = await Promise.all([
    supabase
      .from("OpportunityType")
      .select("id,name,description,order,createdAt,updatedAt")
      .eq("tenantId", tenantId)
      .eq("objectId", objectId)
      .order("order", { ascending: true }),
    supabase
      .from("StageDefinition")
      .select("id,opportunityTypeId,name,order,color,probability,isClosed,isWon")
      .eq("tenantId", tenantId)
      .order("order", { ascending: true }),
  ]);

  if (typeError) throw typeError;
  if (stageError) throw stageError;

  return (types ?? []).map((type, index) => ({
    id: type.id,
    name: type.name,
    isDefault: index === 0,
    stages: (stages ?? [])
      .filter((stage) => stage.opportunityTypeId === type.id)
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({
        id: stage.id,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        probability: stage.probability,
        isWon: stage.isWon,
        isLost: stage.isClosed && !stage.isWon,
      })),
  }));
}

export async function createPipelineForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");
  const now = new Date().toISOString();

  const { data: type, error: typeError } = await supabase
    .from("OpportunityType")
    .insert({
      id: randomUUID(),
      tenantId,
      objectId,
      name: String(input.name ?? "").trim(),
      description: null,
      order: Number(input.order ?? Date.now()),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .select("id")
    .single();

  if (typeError) throw typeError;

  const stages = Array.isArray(input.stages) ? input.stages : [];
  if (stages.length > 0) {
    const { error: stageError } = await supabase.from("StageDefinition").insert(
      stages.map((stage: any, index) => ({
        id: randomUUID(),
        tenantId,
        opportunityTypeId: type.id,
        name: String(stage.name ?? ""),
        order: index + 1,
        probability: Number(stage.probability ?? 0),
        color: stage.color ? String(stage.color) : null,
        isClosed: !!stage.isWon || !!stage.isLost,
        isWon: !!stage.isWon,
        createdAt: now,
        updatedAt: now,
      }))
    );

    if (stageError) throw stageError;
  }

  return type;
}

export async function updatePipelineForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error: typeError } = await supabase
    .from("OpportunityType")
    .update({
      name: String(input.name ?? "").trim(),
      updatedAt: now,
    })
    .eq("tenantId", tenantId)
    .eq("id", id);

  if (typeError) throw typeError;

  const stages = Array.isArray(input.stages) ? input.stages : [];
  const existingStagesResult = await supabase
    .from("StageDefinition")
    .select("id")
    .eq("tenantId", tenantId)
    .eq("opportunityTypeId", id);

  if (existingStagesResult.error) throw existingStagesResult.error;

  const existingStageIds = new Set((existingStagesResult.data ?? []).map((stage) => stage.id));
  const incomingIds = new Set(stages.map((stage: any) => stage.id).filter(Boolean));

  const stageUpdates = stages.filter((stage: any) => stage.id && existingStageIds.has(stage.id));
  const newStages = stages.filter((stage: any) => !stage.id);
  const deletedIds = [...existingStageIds].filter((stageId) => !incomingIds.has(stageId));

  await Promise.all(
    stageUpdates.map(async (stage: any, index: number) => {
      const { error } = await supabase
        .from("StageDefinition")
        .update({
          name: String(stage.name ?? ""),
          order: index + 1,
          probability: Number(stage.probability ?? 0),
          color: stage.color ? String(stage.color) : null,
          isClosed: !!stage.isWon || !!stage.isLost,
          isWon: !!stage.isWon,
          updatedAt: now,
        })
        .eq("tenantId", tenantId)
        .eq("id", stage.id);

      if (error) throw error;
    })
  );

  if (newStages.length > 0) {
    const { error } = await supabase.from("StageDefinition").insert(
      newStages.map((stage: any, index: number) => ({
        id: randomUUID(),
        tenantId,
        opportunityTypeId: id,
        name: String(stage.name ?? ""),
        order: stageUpdates.length + index + 1,
        probability: Number(stage.probability ?? 0),
        color: stage.color ? String(stage.color) : null,
        isClosed: !!stage.isWon || !!stage.isLost,
        isWon: !!stage.isWon,
        createdAt: now,
        updatedAt: now,
      }))
    );

    if (error) throw error;
  }

  if (deletedIds.length > 0) {
    const { error } = await supabase
      .from("StageDefinition")
      .delete()
      .eq("tenantId", tenantId)
      .in("id", deletedIds);

    if (error) throw error;
  }
}

export async function deletePipelineForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("OpportunityType").delete().eq("tenantId", tenantId).eq("id", id);
  if (error) throw error;
}

export async function listOpportunityTypeConfigsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");

  const [{ data: types, error: typeError }, { data: opportunities, error: opportunityError }, { data: fields, error: fieldError }] =
    await Promise.all([
      supabase
        .from("OpportunityType")
        .select("id,name,description,icon,color,order,isActive,createdAt,updatedAt")
        .eq("tenantId", tenantId)
        .eq("objectId", objectId)
        .order("order", { ascending: true }),
      supabase.from("Opportunity").select("id,opportunityTypeId").eq("tenantId", tenantId),
      supabase
        .from("FieldDefinition")
        .select("id")
        .eq("tenantId", tenantId)
        .eq("objectId", objectId)
        .eq("isCustom", true)
        .is("deletedAt", null),
    ]);

  if (typeError) throw typeError;
  if (opportunityError) throw opportunityError;
  if (fieldError) throw fieldError;

  return (types ?? []).map((type) => ({
    ...type,
    defaultPipelineId: type.id,
    defaultStageId: null,
    _count: {
      opportunities: (opportunities ?? []).filter((item) => item.opportunityTypeId === type.id).length,
      customFields: fields?.length ?? 0,
    },
  }));
}

export async function createOpportunityTypeConfigForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");
  const now = new Date().toISOString();

  const order =
    typeof input.order === "number"
      ? Number(input.order)
      : Date.now();

  const { data, error } = await supabase
    .from("OpportunityType")
    .insert({
      id: randomUUID(),
      tenantId,
      objectId,
      name: String(input.name ?? "").trim(),
      description: input.description ? String(input.description) : null,
      icon: input.icon ? String(input.icon) : null,
      color: input.color ? String(input.color) : null,
      order,
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,icon,color,order,isActive,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function updateOpportunityTypeConfigForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  for (const key of ["name", "description", "icon", "color"]) {
    if (key in input) {
      payload[key] = input[key] === "" ? null : input[key];
    }
  }

  if ("isActive" in input) {
    payload.isActive = input.isActive !== false;
  }

  if ("order" in input) {
    payload.order = Number(input.order ?? 0);
  }

  const { data, error } = await supabase
    .from("OpportunityType")
    .update(payload)
    .eq("tenantId", tenantId)
    .eq("id", id)
    .select("id,name,description,icon,color,order,isActive,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteOpportunityTypeConfigForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("OpportunityType").delete().eq("tenantId", tenantId).eq("id", id);
  if (error) throw error;
}

export async function reorderOpportunityTypesForTenant(user: TenantUser, ids: string[]) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  await Promise.all(
    ids.map(async (id, index) => {
      const { error } = await supabase
        .from("OpportunityType")
        .update({ order: index + 1, updatedAt: now })
        .eq("tenantId", tenantId)
        .eq("id", id);

      if (error) throw error;
    })
  );
}

export async function getGeneralSettingsForTenant(user: TenantUser): Promise<GeneralSettings> {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();

  const [{ data: tenant, error: tenantError }, { data: config, error: configError }] = await Promise.all([
    supabase.from("Tenant").select("name").eq("id", tenantId).maybeSingle(),
    supabase.from("TenantConfig").select("featureFlags").eq("tenantId", tenantId).maybeSingle(),
  ]);

  if (tenantError) throw tenantError;
  if (configError) throw configError;

  const defaults = getGeneralSettingsFromFeatureFlags(config?.featureFlags);

  return {
    companyName: tenant?.name ?? "",
    ...defaults,
  };
}

export async function updateGeneralSettingsForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const [{ data: tenantConfig, error: configError }, tenantUpdateResult] = await Promise.all([
    supabase
      .from("TenantConfig")
      .select("id,featureFlags,storageQuota,userLimit,suspendedAt,suspendedBy")
      .eq("tenantId", tenantId)
      .maybeSingle(),
    supabase
      .from("Tenant")
      .update({
        name: String(input.companyName ?? "").trim(),
      })
      .eq("id", tenantId),
  ]);

  if (configError) throw configError;
  if (tenantUpdateResult.error) throw tenantUpdateResult.error;

  const existingFeatureFlags =
    tenantConfig?.featureFlags && typeof tenantConfig.featureFlags === "object" && !Array.isArray(tenantConfig.featureFlags)
      ? { ...(tenantConfig.featureFlags as Record<string, unknown>) }
      : {};

  existingFeatureFlags.generalSettings = {
    timezone: String(input.timezone ?? "America/New_York"),
    currency: String(input.currency ?? "USD"),
    language: String(input.language ?? "en"),
    dateFormat: String(input.dateFormat ?? "MM/dd/yyyy"),
  };

  if (tenantConfig?.id) {
    const { error } = await supabase
      .from("TenantConfig")
      .update({
        featureFlags: existingFeatureFlags,
      })
      .eq("tenantId", tenantId)
      .eq("id", tenantConfig.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("TenantConfig")
      .insert({
        id: randomUUID(),
        tenantId,
        featureFlags: existingFeatureFlags,
      });

    if (error) throw error;
  }

  return getGeneralSettingsForTenant(user);
}

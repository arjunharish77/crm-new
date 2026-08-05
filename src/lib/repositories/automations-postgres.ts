import { randomUUID } from "crypto";
import { execute, query, queryOne, type Queryable } from "@/lib/db/query";
import { withAdvisoryLock, withTransaction } from "@/lib/db/transaction";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
};

const AUTOMATION_COLUMNS = 'id, name, description, trigger, workflow, "isActive", "createdAt", "updatedAt", "tenantId"';

function tenantWhere(user: TenantUser, startIndex = 1) {
  return user.tenantId ? { sql: `"tenantId" = $${startIndex}`, values: [user.tenantId] } : { sql: '"tenantId" is null', values: [] };
}

async function getObjectId(user: TenantUser, objectName: string, client?: Queryable) {
  const tenant = tenantWhere(user, 2);
  const existing = await queryOne<{ id: string }>(
    `select id from "ObjectDefinition" where name = $1 and ${tenant.sql} limit 1`,
    [objectName, ...tenant.values],
    client,
  );
  if (existing?.id) return existing.id;
  const label = new Map([
    ["lead", "Lead"],
    ["opportunity", "Opportunity"],
    ["activity", "Activity"],
  ]).get(objectName);
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

async function createAuditLog(user: TenantUser, action: string, entityType: string, entityId: string, before: unknown, after: unknown, diff: unknown, client?: Queryable) {
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10)`,
    [randomUUID(), user.tenantId, user.id, action, entityType, entityId, before, after, diff, new Date().toISOString()],
    client,
  );
}

function valueAtPath(record: Record<string, unknown>, field: string) {
  const scoringAliases: Record<string, string> = {
    scoreBand: "predictiveScore.scoreBand",
    scoreValue: "predictiveScore.conversionProbability",
    confidence: "predictiveScore.confidence",
    stallRisk: "predictiveScore.stallRisk",
    conversionProbability: "predictiveScore.conversionProbability",
    winProbability: "predictiveScore.winProbability",
    expectedResponseLikelihood: "predictiveScore.expectedResponseLikelihood",
    duplicateRisk: "predictiveScore.duplicateRisk",
    staleRisk: "predictiveScore.staleRisk",
    expectedCloseRisk: "predictiveScore.expectedCloseRisk",
  };
  const parts = field.split(".");
  if (parts.length > 1) {
    const scoped = parts[0].toUpperCase();
    if (!record[parts[0]] && ["LEAD", "OPPORTUNITY", "ACTIVITY", "TASK", "COMMUNICATION"].includes(scoped)) {
      return valueAtPath(record, parts.slice(1).join("."));
    }
  }
  if (scoringAliases[field]) return valueAtPath(record, scoringAliases[field]);
  return field.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, record);
}

export function automationConditionMatches(record: Record<string, unknown>, nodeData: Record<string, unknown>): boolean {
  const conditions = Array.isArray(nodeData.conditions) ? nodeData.conditions : [];
  if (conditions.length > 0) {
    const logic = String(nodeData.conditionLogic ?? nodeData.logic ?? "AND").toUpperCase();
    const checks = conditions.map((condition) => automationConditionMatches(record, condition as Record<string, unknown>));
    return logic === "OR" ? checks.some(Boolean) : checks.every(Boolean);
  }
  const actual = valueAtPath(record, String(nodeData.field ?? ""));
  const expected = nodeData.value;
  const operator = String(nodeData.operator ?? "equals");
  const expectedValues = Array.isArray(expected) ? expected.map(String) : [];
  if (!nodeData.field) return true;
  if (operator === "contains_data") return actual !== undefined && actual !== null && String(actual).length > 0;
  if (operator === "not_contains_data") return actual === undefined || actual === null || String(actual).length === 0;
  if ((operator === "equals" || operator === "in") && expectedValues.length > 0) return expectedValues.includes(String(actual ?? ""));
  if ((operator === "not_equals" || operator === "not_in") && expectedValues.length > 0) return !expectedValues.includes(String(actual ?? ""));
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "greater_than") return Number(actual) > Number(expected);
  if (operator === "less_than") return Number(actual) < Number(expected);
  if (operator === "greater_than_or_equal") return Number(actual) >= Number(expected);
  if (operator === "less_than_or_equal") return Number(actual) <= Number(expected);
  if (operator === "before") return new Date(String(actual)).getTime() < new Date(String(expected)).getTime();
  if (operator === "after") return new Date(String(actual)).getTime() > new Date(String(expected)).getTime();
  return String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
}

function automationBranchLabelForNode(record: Record<string, unknown>, nodeData: Record<string, unknown>, edgeCount = 0) {
  const nodeType = String(nodeData.type ?? "");
  if (nodeType === "split_test") {
    if (edgeCount <= 0) return null;
    const splits = Array.isArray(nodeData.splits) ? nodeData.splits as Array<Record<string, unknown>> : [];
    if (splits.length > 0) {
      const roll = Math.random() * 100;
      let cumulative = 0;
      for (let index = 0; index < splits.length; index += 1) {
        const split = splits[index];
        cumulative += Math.max(0, Number(split.percentage ?? 0));
        if (roll <= cumulative) return String(split.label ?? `Variant ${index + 1}`).toLowerCase();
      }
      const last = splits[splits.length - 1];
      return String(last?.label ?? `Variant ${splits.length}`).toLowerCase();
    }
    return `__index:${Math.floor(Math.random() * edgeCount)}`;
  }
  if (nodeType === "multi_if_else") {
    if (automationConditionMatches(record, nodeData)) return "if 1";
    const branchSource = nodeData.branches ?? nodeData.branchesJson;
    let branches: Array<Record<string, unknown>> = [];
    if (Array.isArray(branchSource)) branches = branchSource as Array<Record<string, unknown>>;
    else if (typeof branchSource === "string" && branchSource.trim()) {
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
    return label === branchLabel;
  });
  return preferred.length ? preferred : nextEdges;
}

function automationDelayDate(nodeData: Record<string, unknown>) {
  const exactRunAt = nodeData.runAt ? new Date(String(nodeData.runAt)) : null;
  if (exactRunAt && !Number.isNaN(exactRunAt.getTime()) && exactRunAt.getTime() > Date.now()) return exactRunAt;
  const duration = Math.max(1, Number(nodeData.duration ?? 1));
  const unit = String(nodeData.unit ?? "hours");
  const multiplier = unit === "days" ? 24 * 60 * 60 * 1000 : unit === "minutes" ? 60 * 1000 : 60 * 60 * 1000;
  const maxWaitMinutes = Number(nodeData.maxWaitMinutes ?? 0);
  const delayMs = maxWaitMinutes > 0 ? Math.min(duration * multiplier, maxWaitMinutes * 60 * 1000) : duration * multiplier;
  const runAt = new Date(Date.now() + delayMs);
  const allowedFrom = typeof nodeData.allowedFrom === "string" ? nodeData.allowedFrom : "";
  const allowedUntil = typeof nodeData.allowedUntil === "string" ? nodeData.allowedUntil : "";
  if (/^\d{2}:\d{2}$/.test(allowedFrom) && /^\d{2}:\d{2}$/.test(allowedUntil)) {
    const [fromHour, fromMinute] = allowedFrom.split(":").map(Number);
    const [untilHour, untilMinute] = allowedUntil.split(":").map(Number);
    const currentMinutes = runAt.getHours() * 60 + runAt.getMinutes();
    const fromMinutes = fromHour * 60 + fromMinute;
    const untilMinutes = untilHour * 60 + untilMinute;
    const insideWindow = fromMinutes <= untilMinutes
      ? currentMinutes >= fromMinutes && currentMinutes <= untilMinutes
      : currentMinutes >= fromMinutes || currentMinutes <= untilMinutes;
    if (!insideWindow) {
      runAt.setHours(fromHour, fromMinute, 0, 0);
      if (currentMinutes > untilMinutes && fromMinutes <= untilMinutes) runAt.setDate(runAt.getDate() + 1);
    }
  }
  return runAt;
}

async function automationWaitUntilActivitySatisfied(
  user: TenantUser,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  nodeData: Record<string, unknown>,
  client?: Queryable,
) {
  if (!user.tenantId) return false;
  const typeId = String(nodeData.activityTypeId ?? nodeData.typeId ?? "");
  const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
  const opportunityId = entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "");
  const values: unknown[] = [user.tenantId];
  const clauses = ['"tenantId" = $1'];
  if (typeId) {
    values.push(typeId);
    clauses.push(`"typeId" = $${values.length}`);
  }
  if (opportunityId) {
    values.push(opportunityId);
    clauses.push(`"opportunityId" = $${values.length}`);
  } else if (leadId) {
    values.push(leadId);
    clauses.push(`"leadId" = $${values.length}`);
  } else {
    return false;
  }
  const row = await queryOne('select id from "Activity" where ' + clauses.join(" and ") + " limit 1", values, client);
  return !!row?.id;
}

function triggerMatches(trigger: Record<string, unknown>, eventType: string, record: Record<string, unknown>) {
  if (String(trigger.type ?? "MANUAL") !== eventType) return false;
  if (trigger.opportunityTypeId && String(record.opportunityTypeId ?? "") !== String(trigger.opportunityTypeId)) return false;
  if (trigger.activityTypeId && String(record.typeId ?? "") !== String(trigger.activityTypeId)) return false;
  const conditions = Array.isArray(trigger.conditions) ? trigger.conditions : [];
  return conditions.every((condition) => automationConditionMatches(record, condition as Record<string, unknown>));
}

function normalizePatchField(field: string) {
  return field.replace(/^(lead|opportunity|activity)\./, "");
}

async function updateTable(table: "Lead" | "Opportunity" | "Activity" | "Task", tenantId: string | null, id: string, patch: Record<string, unknown>, client?: Queryable) {
  const columns = Object.keys(patch).filter((key) => patch[key] !== undefined);
  if (!columns.length) return;
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const tenantSql = tenantId ? `"tenantId" = $${columns.length + 2}` : '"tenantId" is null';
  await execute(
    `update "${table}" set ${assignments} where id = $${columns.length + 1} and ${tenantSql}`,
    tenantId ? [...values, id, tenantId] : [...values, id],
    client,
  );
}

async function executeAutomationAction(
  user: TenantUser,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  nodeData: Record<string, unknown>,
  _triggerEventType = "AUTOMATION",
  client?: Queryable,
) {
  const type = String(nodeData.type ?? "");
  if (["trigger", "branch", "delay", "wait", "wait_until_activity", "split_test"].includes(type)) return;

  if (type === "update_field" || type === "update_lead" || type === "update_opportunity") {
    const updates = Array.isArray(nodeData.updates) ? nodeData.updates as Array<Record<string, unknown>> : nodeData.field ? [{ field: nodeData.field, value: nodeData.value }] : [];
    const table = type === "update_opportunity" ? "Opportunity" : type === "update_lead" ? "Lead" : entityType === "OPPORTUNITY" ? "Opportunity" : "Lead";
    const targetId = table === "Lead" && entityType === "OPPORTUNITY" ? String(record.leadId ?? "") : entityId;
    if (!targetId) return;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const update of updates) {
      const field = String(update.field ?? "");
      if (field) patch[normalizePatchField(field)] = update.value ?? null;
    }
    if (Object.keys(patch).length > 1) await updateTable(table, user.tenantId, targetId, patch, client);
    return;
  }

  if (type === "update_activity") {
    const updates = Array.isArray(nodeData.updates) ? nodeData.updates as Array<Record<string, unknown>> : nodeData.field ? [{ field: nodeData.field, value: nodeData.value }] : [];
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const update of updates) {
      const field = String(update.field ?? "");
      if (field) patch[normalizePatchField(field)] = update.value ?? null;
    }
    if (Object.keys(patch).length > 1) await updateTable("Activity", user.tenantId, entityId, patch, client);
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
    if (targetId) await updateTable(table, user.tenantId, targetId, { [normalizePatchField(field)]: null, updatedAt: new Date().toISOString() }, client);
    return;
  }

  if (type === "create_activity" || type === "add_activity") {
    const typeId = nodeData.activityTypeId ?? nodeData.typeId;
    if (!typeId) return;
    const now = new Date().toISOString();
    await execute(
      `insert into "Activity"
       (id, "tenantId", "objectId", "typeId", "leadId", "opportunityId", outcome, notes, "dueAt", "completedAt", "slaStatus", "slaTarget", "isRecurring", "recurrenceRule", "seriesId", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, 'PENDING', null, false, null, null, $10, $11, $11)`,
      [
        randomUUID(),
        user.tenantId,
        await getObjectId(user, "activity", client),
        typeId,
        entityType === "LEAD" ? entityId : record.leadId ?? null,
        entityType === "OPPORTUNITY" ? entityId : null,
        nodeData.outcome ?? null,
        nodeData.notes ?? nodeData.subject ?? null,
        nodeData.dueAt ?? null,
        user.id,
        now,
      ],
      client,
    );
    return;
  }

  if (type === "assign_owner") {
    const ownerId = String(nodeData.ownerId ?? "");
    if (!ownerId) return;
    const target = String(nodeData.target ?? "current");
    const table = target === "opportunity" || (target === "current" && entityType === "OPPORTUNITY") ? "Opportunity" : "Lead";
    const targetId = table === "Opportunity" ? entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "") : entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (targetId) await updateTable(table, user.tenantId, targetId, { ownerId, updatedAt: new Date().toISOString() }, client);
    return;
  }

  if (type === "change_stage") {
    const stageId = String(nodeData.stageId ?? "");
    const targetId = entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "");
    if (stageId && targetId) await updateTable("Opportunity", user.tenantId, targetId, { stageId, updatedAt: new Date().toISOString() }, client);
    return;
  }

  if (type === "add_opportunity") {
    const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!leadId || !nodeData.opportunityTypeId) return;
    const now = new Date().toISOString();
    await execute(
      `insert into "Opportunity"
       (id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, amount, "expectedCloseDate", priority, tags, "ownerId", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, null, $6, $7, null, $8, '{}', null, $9, $10, $10)`,
      [
        randomUUID(),
        user.tenantId,
        await getObjectId(user, "opportunity", client),
        leadId,
        nodeData.opportunityTypeId,
        nodeData.title ?? "Automation Opportunity",
        nodeData.amount ? Number(nodeData.amount) : null,
        nodeData.priority ?? "MEDIUM",
        user.id,
        now,
      ],
      client,
    );
    return;
  }

  if (type === "tag_lead" || type === "star_lead" || type === "remove_tag") {
    const targetId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    const tagValue = type === "star_lead" ? "STARRED" : String(nodeData.value ?? "").trim();
    if (!targetId || !tagValue) return;
    const row = await queryOne<any>(
      `select tags from "Lead" where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'} limit 1`,
      user.tenantId ? [targetId, user.tenantId] : [targetId],
      client,
    );
    const tags = Array.isArray(row?.tags) ? row.tags : [];
    const nextTags = type === "remove_tag" ? tags.filter((tag: string) => String(tag) !== tagValue) : [...new Set([...tags, tagValue])];
    await updateTable("Lead", user.tenantId, targetId, { tags: nextTags, updatedAt: new Date().toISOString() }, client);
    return;
  }

  if (type === "increment_score") {
    const targetId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!targetId) return;
    const row = await queryOne<any>(
      `select score from "Lead" where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'} limit 1`,
      user.tenantId ? [targetId, user.tenantId] : [targetId],
      client,
    );
    await updateTable("Lead", user.tenantId, targetId, { score: Number(row?.score ?? 0) + Number(nodeData.value ?? 0), updatedAt: new Date().toISOString() }, client);
    return;
  }

  if (type === "create_task") {
    const title = String(nodeData.title ?? "Automation task").trim();
    const now = new Date().toISOString();
    const ownerId = String(nodeData.ownerId ?? record.ownerId ?? user.id);
    const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "") || null;
    const opportunityId = entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "") || null;
    const activityId = entityType === "ACTIVITY" ? entityId : String(record.activityId ?? "") || null;
    await execute(
      `insert into "Task"
       (id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "leadId", "opportunityId", "activityId", "dueAt", "reminderAt", "completedAt", "completedBy", metadata, "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11, $12, null, null, $13, $14, $14)`,
      [
        randomUUID(),
        user.tenantId,
        title || "Automation task",
        nodeData.description ?? null,
        nodeData.priority ?? "MEDIUM",
        ownerId,
        user.id,
        leadId,
        opportunityId,
        activityId,
        nodeData.dueAt ?? null,
        nodeData.reminderAt ?? null,
        { source: "AUTOMATION", entityType, entityId },
        now,
      ],
      client,
    );
    return;
  }

  if (["update_task", "assign_task", "reschedule_task", "complete_task"].includes(type)) {
    const targetId = entityType === "TASK" ? entityId : String(record.taskId ?? "");
    if (!targetId) return;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (type === "assign_task" && nodeData.ownerId) patch.ownerId = nodeData.ownerId;
    if (type === "reschedule_task") {
      if (nodeData.dueAt !== undefined) patch.dueAt = nodeData.dueAt || null;
      if (nodeData.reminderAt !== undefined) patch.reminderAt = nodeData.reminderAt || null;
    }
    if (type === "complete_task") {
      patch.status = "COMPLETED";
      patch.completedAt = new Date().toISOString();
      patch.completedBy = user.id;
    }
    if (type === "update_task") {
      for (const update of Array.isArray(nodeData.updates) ? nodeData.updates as Array<Record<string, unknown>> : []) {
        const field = String(update.field ?? "");
        if (["title", "description", "status", "priority", "ownerId", "dueAt", "reminderAt"].includes(field)) patch[field] = update.value ?? null;
      }
    }
    if (Object.keys(patch).length > 1) await updateTable("Task", user.tenantId, targetId, patch, client);
    return;
  }

  if (type === "send_email") {
    const channel = String(nodeData.channel ?? "EMAIL").toUpperCase();
    const recipient = String(nodeData.to ?? (channel === "EMAIL" ? record.email : record.phone) ?? "").trim();
    const body = String(nodeData.message ?? nodeData.body ?? "").trim();
    if (!["EMAIL", "WHATSAPP", "SMS"].includes(channel) || !recipient || !body) return;
    const now = new Date().toISOString();
    await execute(
      `insert into "CommunicationOutbox"
       (id, "tenantId", channel, "providerConfigId", "senderIdentityId", "templateId", recipient, subject, body,
        payload, status, "nextAttemptAt", "sourceType", "sourceId", "entityType", "entityId", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, null, null, null, $4, $5, $6, $7, 'QUEUED', $8, 'AUTOMATION', $9, $10, $11, $12, $8, $8)`,
      [
        randomUUID(),
        user.tenantId,
        channel,
        recipient,
        nodeData.subject ?? null,
        body,
        { automationNode: nodeData.label ?? type, sourceRecord: record },
        now,
        entityId,
        entityType,
        entityId,
        user.id,
      ],
      client,
    );
    return;
  }

  if (type === "notify_user") {
    await execute(
      `insert into "Notification" (id, "tenantId", "userId", title, message, data, "isRead", "createdAt", "readAt")
       values ($1, $2, $3, $4, $5, $6, false, $7, null)`,
      [
        randomUUID(),
        user.tenantId,
        String(nodeData.userId ?? user.id),
        nodeData.title ?? "Automation notification",
        nodeData.message ?? `${entityType} ${entityId} matched an automation rule.`,
        { entityType, entityId, automationNode: nodeData.label ?? type },
        new Date().toISOString(),
      ],
      client,
    );
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

async function scheduleAutomationResume(
  user: TenantUser,
  automation: any,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  resumeNodeIds: string[],
  runAt: Date,
  waitingNodeId: string,
  client?: Queryable,
) {
  await execute(
    `insert into "AutomationQueue"
      (id, "tenantId", "userId", "automationId", "entityType", "entityId", record, "resumeNodeIds", "waitingNodeId", status, "runAt", attempts, "lastError", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10, 0, null, $11, $11)`,
    [randomUUID(), user.tenantId, user.id, automation.id, entityType, entityId, record, resumeNodeIds, waitingNodeId, runAt.toISOString(), new Date().toISOString()],
    client,
  );
}

async function executeAutomationWorkflow(
  user: TenantUser,
  automation: any,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  mode: "LIVE" | "TEST",
  options: { startNodeIds?: string[]; resumeJobId?: string; client?: Queryable } = {},
) {
  const workflow = (automation.workflow ?? {}) as { nodes?: any[]; edges?: any[]; config?: Record<string, unknown> };
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const config = (workflow.config ?? {}) as Record<string, unknown>;
  const exitConditions = Array.isArray(config.exitConditions) ? config.exitConditions : [];
  const exitLogic = String(config.exitConditionLogic ?? "OR").toUpperCase();
  if (exitConditions.length > 0) {
    const checks = exitConditions.map((condition) => automationConditionMatches(record, condition as Record<string, unknown>));
    const shouldExit = exitLogic === "AND" ? checks.every(Boolean) : checks.some(Boolean);
    if (shouldExit) {
      return [{
        node: "__workflow_exit__",
        type: "exit_condition",
        action: "Workflow exit condition",
        status: "STOPPED",
        result: exitLogic,
        timestamp: new Date().toISOString(),
      }];
    }
  }
  const firstNode = nodes.find((node) => node.data?.type === "trigger") ?? nodes[0];
  const queue = options.startNodeIds?.length ? [...options.startNodeIds] : firstNode ? [firstNode.id] : [];
  const visited = new Set<string>();
  const log: Array<Record<string, unknown>> = [];
  const maxSteps = Math.max(1, Math.min(500, Number(config.maxStepsPerRun ?? 100)));

  while (queue.length > 0) {
    if (log.length >= maxSteps) {
      log.push({
        node: "__step_cap__",
        type: "guard",
        action: "Step cap reached",
        status: "STOPPED",
        result: maxSteps,
        timestamp: new Date().toISOString(),
      });
      break;
    }
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
        const satisfied = await automationWaitUntilActivitySatisfied(user, entityType, entityId, record, nodeData, options.client);
        stepLog.result = satisfied;
        if (satisfied) {
          queue.push(...nextNodeIds);
          log.push(stepLog);
          continue;
        }
      }
      const waitConfig = nodeType === "wait_until_activity" && nodeData.timeoutDuration
        ? { ...nodeData, duration: nodeData.timeoutDuration, unit: nodeData.timeoutUnit ?? nodeData.unit }
        : nodeData;
      const runAt = automationDelayDate(waitConfig);
      stepLog.status = mode === "LIVE" ? "WAITING" : "TEST_WAIT_SKIPPED";
      const resumeNodeIds = nodeType === "wait_until_activity" && String(nodeData.timeoutAction ?? "continue") === "exit" ? [] : nextNodeIds;
      stepLog.resumeNodeIds = resumeNodeIds;
      stepLog.runAt = runAt.toISOString();
      if (mode === "LIVE" && resumeNodeIds.length > 0 && user.tenantId) {
        await scheduleAutomationResume(user, automation, entityType, entityId, record, resumeNodeIds, runAt, node.id, options.client);
      } else if (mode === "TEST") {
        queue.push(...resumeNodeIds);
      }
    } else {
      if (mode === "LIVE") {
        await executeAutomationAction(user, entityType, entityId, record, nodeData, String((automation.trigger as Record<string, unknown> | undefined)?.type ?? "AUTOMATION"), options.client);
      }
      queue.push(...automationNextEdges(edges, node.id, record, nodeData).map((edge) => edge.target));
    }

    log.push(stepLog);
  }
  return log;
}

export async function listAutomationsForTenant(user: TenantUser) {
  const tenant = tenantWhere(user);
  const automations = await query<any>(
    `select id, name, description, trigger, workflow, "isActive", "createdAt", "updatedAt"
     from "AutomationV2"
     where ${tenant.sql}
     order by "createdAt" desc`,
    tenant.values,
  );
  const ids = automations.map((item) => item.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const executionRows = await query<any>(
      `select "automationId", count(*)::int as count
       from "AutomationExecution"
       where ${tenant.sql} and "automationId" = any($${tenant.values.length + 1}::text[])
       group by "automationId"`,
      [...tenant.values, ids],
    );
    for (const row of executionRows) counts.set(row.automationId, Number(row.count ?? 0));
  }
  return automations.map((item) => ({ ...item, _count: { executions: counts.get(item.id) ?? 0 } }));
}

export async function getAutomationForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 2);
  return queryOne<any>(
    `select ${AUTOMATION_COLUMNS} from "AutomationV2" where id = $1 and ${tenant.sql} limit 1`,
    [id, ...tenant.values],
  );
}

export async function createAutomationForTenant(user: TenantUser, payload: Record<string, unknown>) {
  return withTransaction(user, async (client) => {
    const now = new Date().toISOString();
    const row = await queryOne<any>(
      `insert into "AutomationV2" (id, "tenantId", name, description, trigger, steps, workflow, "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, null, $6, $7, $8, $8)
       returning ${AUTOMATION_COLUMNS}`,
      [
        randomUUID(),
        user.tenantId,
        payload.name,
        payload.description ?? null,
        payload.trigger ?? { type: "MANUAL" },
        payload.workflow ?? { nodes: [], edges: [] },
        payload.isActive ?? true,
        now,
      ],
      client,
    );
    if (!row) throw new Error("AUTOMATION_INSERT_FAILED");
    await createAuditLog(user, "CREATE", "AUTOMATION", row.id, null, row, null, client).catch(() => undefined);
    return row;
  });
}

export async function updateAutomationForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  return withTransaction(user, async (client) => {
    const existing = await getAutomationForTenant(user, id);
    if (!existing) throw new Error("AUTOMATION_NOT_FOUND");
    const patch = {
      name: payload.name,
      description: payload.description,
      trigger: payload.trigger,
      workflow: payload.workflow,
      isActive: payload.isActive,
      updatedAt: new Date().toISOString(),
    };
    const columns = Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] !== undefined);
    const values = columns.map((key) => (patch as Record<string, unknown>)[key]);
    const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
    const row = await queryOne<any>(
      `update "AutomationV2" set ${assignments} where id = $${columns.length + 1} and "tenantId" = $${columns.length + 2} returning ${AUTOMATION_COLUMNS}`,
      [...values, id, user.tenantId],
      client,
    );
    if (!row) throw new Error("AUTOMATION_NOT_FOUND");
    const diff: Record<string, unknown> = {};
    for (const key of ["name", "description", "trigger", "workflow", "isActive"] as const) {
      if (JSON.stringify(existing[key]) !== JSON.stringify(row[key])) diff[key] = { before: existing[key], after: row[key] };
    }
    await createAuditLog(user, "UPDATE", "AUTOMATION", row.id, existing, row, Object.keys(diff).length ? diff : null, client).catch(() => undefined);
    return row;
  });
}

export async function deleteAutomationForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 2);
  await execute(`delete from "AutomationV2" where id = $1 and ${tenant.sql}`, [id, ...tenant.values]);
}

export async function listAutomationExecutionsForTenant(user: TenantUser, automationId: string) {
  const tenant = tenantWhere(user, 2);
  return query<any>(
    `select id, status, "entityType", "entityId", "executionLog", "startedAt", "completedAt", error
     from "AutomationExecution"
     where "automationId" = $1 and ${tenant.sql}
     order by "startedAt" desc
     limit 50`,
    [automationId, ...tenant.values],
  );
}

async function loadAutomationTestRecord(user: TenantUser, entityType: string, entityId: string) {
  const type = entityType.toUpperCase();
  const table = type === "OPPORTUNITY" ? "Opportunity" : type === "ACTIVITY" ? "Activity" : "Lead";
  const tenant = tenantWhere(user, 2);
  return (await queryOne<any>(`select * from "${table}" where id = $1 and ${tenant.sql} limit 1`, [entityId, ...tenant.values])) ?? { id: entityId };
}

export async function testAutomationForTenant(user: TenantUser, automationId: string, input: { entityType: string; entityId: string }) {
  const automation = await getAutomationForTenant(user, automationId);
  if (!automation) throw new Error("AUTOMATION_NOT_FOUND");
  const record = await loadAutomationTestRecord(user, input.entityType, input.entityId);
  const log = await executeAutomationWorkflow(user, automation, input.entityType, input.entityId, record, "TEST");
  const now = new Date().toISOString();
  await execute(
    `insert into "AutomationExecution"
      (id, "tenantId", "automationId", status, "entityType", "entityId", context, "executionLog", "workflowSnapshot", "startedAt", "completedAt", error)
     values ($1, $2, $3, 'COMPLETED', $4, $5, $6, $7, $8, $9, $9, null)`,
    [randomUUID(), user.tenantId, automationId, input.entityType, input.entityId, { mode: "TEST" }, { steps: log, mode: "TEST" }, automation.workflow, now],
  );
  return { success: true, log };
}

export async function runAutomationsForEvent(user: TenantUser, eventType: string, entityType: string, entityId: string, record: Record<string, unknown>) {
  if (!user.tenantId) return [];
  const automations = await query<any>(
    `select id, name, trigger, workflow, "isActive"
     from "AutomationV2"
     where "tenantId" = $1 and "isActive" = true`,
    [user.tenantId],
  );
  const matched = automations.filter((automation) => triggerMatches((automation.trigger ?? {}) as Record<string, unknown>, eventType, record));
  const results = [];
  for (const automation of matched) {
    const workflowConfig = ((automation.workflow ?? {}) as { config?: Record<string, unknown> }).config ?? {};
    const maxExecutionsPerRecord = Math.max(1, Math.min(100, Number(workflowConfig.maxExecutionsPerRecord ?? 10)));
    const previousExecutions = await queryOne<{ count: number }>(
      `select count(*)::int as count
       from "AutomationExecution"
       where "tenantId" = $1 and "automationId" = $2 and "entityType" = $3 and "entityId" = $4`,
      [user.tenantId, automation.id, entityType, entityId],
    );
    if ((previousExecutions?.count ?? 0) >= maxExecutionsPerRecord) {
      results.push({ automationId: automation.id, status: "SKIPPED", reason: "MAX_EXECUTIONS_PER_RECORD" });
      continue;
    }
    const startedAt = new Date().toISOString();
    const log: Array<Record<string, unknown>> = [];
    try {
      await withTransaction(user, async (client) => {
        log.push(...await executeAutomationWorkflow(user, automation, entityType, entityId, record, "LIVE", { client }));
        const waiting = log.some((step) => step.status === "WAITING");
        await execute(
          `insert into "AutomationExecution"
            (id, "tenantId", "automationId", status, "entityType", "entityId", context, "executionLog", "workflowSnapshot", "startedAt", "completedAt", error)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null)`,
          [randomUUID(), user.tenantId, automation.id, waiting ? "WAITING" : "COMPLETED", entityType, entityId, { eventType }, { steps: log }, automation.workflow, startedAt, waiting ? null : new Date().toISOString()],
          client,
        );
      });
      results.push({ automationId: automation.id, status: log.some((step) => step.status === "WAITING") ? "WAITING" : "COMPLETED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automation failed";
      await execute(
        `insert into "AutomationExecution"
          (id, "tenantId", "automationId", status, "entityType", "entityId", context, "executionLog", "workflowSnapshot", "startedAt", "completedAt", error)
         values ($1, $2, $3, 'FAILED', $4, $5, $6, $7, $8, $9, $10, $11)`,
        [randomUUID(), user.tenantId, automation.id, entityType, entityId, { eventType }, { steps: log }, automation.workflow, startedAt, new Date().toISOString(), message],
      );
      results.push({ automationId: automation.id, status: "FAILED", error: message });
    }
  }
  return results;
}

async function resolveAutomationJobUser(job: any, fallbackUser?: TenantUser, client?: Queryable): Promise<TenantUser> {
  if (fallbackUser && fallbackUser.tenantId === job.tenantId) return fallbackUser;
  if (job.userId) {
    const user = await queryOne<TenantUser & Record<string, unknown>>(
      'select id, name, email, "tenantId" from "User" where id = $1 and "tenantId" = $2 limit 1',
      [job.userId, job.tenantId],
      client,
    );
    if (user?.id) return user;
  }
  const user = await queryOne<TenantUser & Record<string, unknown>>(
    `select id, name, email, "tenantId" from "User" where "tenantId" = $1 and status = 'ACTIVE' limit 1`,
    [job.tenantId],
    client,
  );
  return user ?? { id: "automation-worker", tenantId: job.tenantId };
}

async function processDueAutomationJobsInternal(input: { tenantId?: string; fallbackUser?: TenantUser; limit: number }) {
  const values: unknown[] = [new Date().toISOString(), input.limit];
  const tenantClause = input.tenantId ? ' and "tenantId" = $3' : "";
  if (input.tenantId) values.push(input.tenantId);
  const jobs = await query<any>(
    `select id, "tenantId", "userId", "automationId", "entityType", "entityId", record, "resumeNodeIds", attempts
     from "AutomationQueue"
     where status = 'PENDING' and "runAt" <= $1${tenantClause}
     order by "runAt" asc
     limit $2`,
    values,
  );
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    await withTransaction({ id: "automation-worker", tenantId: job.tenantId }, async (client) => {
      const locked = await withAdvisoryLock(client, `automation-queue:${job.id}`, async () => true);
      if (!locked) return;
      const user = await resolveAutomationJobUser(job, input.fallbackUser, client);
      const automation = await getAutomationForTenant(user, job.automationId);
      if (!automation || !automation.isActive) {
        await execute('update "AutomationQueue" set status = $1, "updatedAt" = $2 where id = $3', ["CANCELLED", new Date().toISOString(), job.id], client);
        return;
      }
      const startedAt = new Date().toISOString();
      try {
        await execute('update "AutomationQueue" set status = $1, attempts = $2, "updatedAt" = $3 where id = $4', ["RUNNING", Number(job.attempts ?? 0) + 1, new Date().toISOString(), job.id], client);
        const log = await executeAutomationWorkflow(user, automation, job.entityType, job.entityId, (job.record ?? {}) as Record<string, unknown>, "LIVE", {
          startNodeIds: Array.isArray(job.resumeNodeIds) ? job.resumeNodeIds : [],
          resumeJobId: job.id,
          client,
        });
        const waiting = log.some((step) => step.status === "WAITING");
        await execute(
          `insert into "AutomationExecution"
            (id, "tenantId", "automationId", status, "entityType", "entityId", context, "executionLog", "workflowSnapshot", "startedAt", "completedAt", error)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null)`,
          [randomUUID(), user.tenantId, automation.id, waiting ? "WAITING" : "COMPLETED", job.entityType, job.entityId, { mode: "RESUME", queueId: job.id }, { steps: log, mode: "RESUME" }, automation.workflow, startedAt, waiting ? null : new Date().toISOString()],
          client,
        );
        await execute('update "AutomationQueue" set status = $1, "updatedAt" = $2 where id = $3', ["COMPLETED", new Date().toISOString(), job.id], client);
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Automation resume failed";
        const attempts = Number(job.attempts ?? 0) + 1;
        const shouldRetry = attempts < 3;
        await execute(
          `update "AutomationQueue" set status = $1, "lastError" = $2, "runAt" = $3, "updatedAt" = $4 where id = $5`,
          [shouldRetry ? "PENDING" : "FAILED", message, shouldRetry ? new Date(Date.now() + attempts * attempts * 60_000).toISOString() : null, new Date().toISOString(), job.id],
          client,
        );
        failed += 1;
      }
    });
  }
  return { processed, failed };
}

export async function processDueAutomationJobsForTenant(user: TenantUser, limit = 25) {
  if (!user.tenantId) return { processed: 0, failed: 0 };
  return processDueAutomationJobsInternal({ tenantId: user.tenantId, fallbackUser: user, limit });
}

export async function processDueAutomationJobs(limit = 50) {
  return processDueAutomationJobsInternal({ limit });
}

import { randomUUID } from "crypto";
import { execute, query, queryOne, jsonbParam, queryAsSystem, type Queryable } from "@/lib/db/query";
import { withAdvisoryLock, withTransaction } from "@/lib/db/transaction";
import { getTenantTimeZone, normalizeTenantTimeZone } from "@/lib/server/date-format";
import { assertFeatureEnabled, isFeatureEnabledForTenant } from "@/lib/server/entitlements";
import { checkRateLimitWithAlert } from "@/lib/server/rate-limit";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  isPlatformAdmin?: boolean;
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

// Reads the wall-clock date/time parts a UTC instant corresponds to in a given IANA zone --
// used both to know "what time is it right now for this tenant" and, combined with
// zonedPartsToUtc below, to construct a new UTC instant for a specific wall-clock time in
// that zone (e.g. "9:00 AM tenant-local").
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTenantTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// Standard offset-correction trick: guess a UTC instant assuming zero offset, see how far
// that guess drifts when reinterpreted in the target zone, then correct by the drift.
function zonedPartsToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const reinterpreted = zonedParts(new Date(guessMs), timeZone);
  const reinterpretedMs = Date.UTC(reinterpreted.year, reinterpreted.month - 1, reinterpreted.day, reinterpreted.hour, reinterpreted.minute, 0);
  return new Date(guessMs - (reinterpretedMs - guessMs));
}

async function automationDelayDate(nodeData: Record<string, unknown>, tenantId: string | null) {
  const exactRunAt = nodeData.runAt ? new Date(String(nodeData.runAt)) : null;
  if (exactRunAt && !Number.isNaN(exactRunAt.getTime()) && exactRunAt.getTime() > Date.now()) return exactRunAt;
  const duration = Math.max(1, Number(nodeData.duration ?? 1));
  const unit = String(nodeData.unit ?? "hours");
  const multiplier = unit === "days" ? 24 * 60 * 60 * 1000 : unit === "minutes" ? 60 * 1000 : 60 * 60 * 1000;
  const maxWaitMinutes = Number(nodeData.maxWaitMinutes ?? 0);
  const delayMs = maxWaitMinutes > 0 ? Math.min(duration * multiplier, maxWaitMinutes * 60 * 1000) : duration * multiplier;
  let runAt = new Date(Date.now() + delayMs);
  const allowedFrom = typeof nodeData.allowedFrom === "string" ? nodeData.allowedFrom : "";
  const allowedUntil = typeof nodeData.allowedUntil === "string" ? nodeData.allowedUntil : "";
  if (/^\d{2}:\d{2}$/.test(allowedFrom) && /^\d{2}:\d{2}$/.test(allowedUntil)) {
    const timeZone = await getTenantTimeZone(tenantId);
    const [fromHour, fromMinute] = allowedFrom.split(":").map(Number);
    const [untilHour, untilMinute] = allowedUntil.split(":").map(Number);
    const current = zonedParts(runAt, timeZone);
    const currentMinutes = current.hour * 60 + current.minute;
    const fromMinutes = fromHour * 60 + fromMinute;
    const untilMinutes = untilHour * 60 + untilMinute;
    const insideWindow = fromMinutes <= untilMinutes
      ? currentMinutes >= fromMinutes && currentMinutes <= untilMinutes
      : currentMinutes >= fromMinutes || currentMinutes <= untilMinutes;
    if (!insideWindow) {
      const rollToNextDay = currentMinutes > untilMinutes && fromMinutes <= untilMinutes;
      const target = zonedPartsToUtc(current.year, current.month, current.day, fromHour, fromMinute, timeZone);
      runAt = rollToNextDay ? new Date(target.getTime() + 24 * 60 * 60 * 1000) : target;
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
  // App-originated trigger (gap checklist Module 16's app event bus "triggers" half) -- both
  // filters are optional so a trigger can be scoped to one specific installed app, one specific
  // event name from that app, or (with neither set) every app-originated event tenant-wide.
  if (trigger.type === "APP_EVENT") {
    if (trigger.appId && String(record.appId ?? "") !== String(trigger.appId)) return false;
    if (trigger.eventName && String(record.eventName ?? "") !== String(trigger.eventName)) return false;
  }
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
  visitedAutomationIds?: Set<string>,
  automationId: string | null = null,
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

  if (type === "share_opportunity" || type === "stop_share_opportunity") {
    const targetId = entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "");
    if (!targetId || !user.tenantId) return;
    const requestedUserIds = Array.isArray(nodeData.sharedUserIds) ? (nodeData.sharedUserIds as string[]).filter(Boolean) : [];
    const requestedTeamIds = Array.isArray(nodeData.sharedTeamIds) ? (nodeData.sharedTeamIds as string[]).filter(Boolean) : [];
    const existing = await queryOne<any>(
      'select "sharedUserIds", "sharedTeamIds" from "RecordShare" where "tenantId" = $1 and "recordType" = \'OPPORTUNITY\' and "recordId" = $2',
      [user.tenantId, targetId],
      client,
    );
    const existingUserIds: string[] = existing?.sharedUserIds ?? [];
    const existingTeamIds: string[] = existing?.sharedTeamIds ?? [];
    let sharedUserIds: string[];
    let sharedTeamIds: string[];
    if (type === "share_opportunity") {
      // Additive by design -- a recurring automation (e.g. re-firing on every stage change)
      // must not wipe out sharing a person set up manually via the Share dialog.
      sharedUserIds = [...new Set([...existingUserIds, ...requestedUserIds])];
      sharedTeamIds = [...new Set([...existingTeamIds, ...requestedTeamIds])];
    } else if (requestedUserIds.length || requestedTeamIds.length) {
      // Specific targets given -- remove just those, keep everything else shared.
      sharedUserIds = existingUserIds.filter((id) => !requestedUserIds.includes(id));
      sharedTeamIds = existingTeamIds.filter((id) => !requestedTeamIds.includes(id));
    } else {
      // No targets specified on a stop-share action -- clear all sharing on this record.
      sharedUserIds = [];
      sharedTeamIds = [];
    }
    await execute(
      `insert into "RecordShare" (id, "tenantId", "recordType", "recordId", "sharedUserIds", "sharedTeamIds", "createdBy", "updatedBy", "createdAt", "updatedAt")
       values ($1, $2, 'OPPORTUNITY', $3, $4, $5, $6, $6, $7, $7)
       on conflict ("tenantId", "recordType", "recordId") do update set
         "sharedUserIds" = excluded."sharedUserIds",
         "sharedTeamIds" = excluded."sharedTeamIds",
         "updatedBy" = excluded."updatedBy",
         "updatedAt" = excluded."updatedAt"`,
      [randomUUID(), user.tenantId, targetId, sharedUserIds, sharedTeamIds, user.id, new Date().toISOString()],
      client,
    );
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

  // Real bug found while building the app-backed automation node (Module 16, Phase 3): these
  // two node types have existed in the builder UI's palette and config panel (list picker) for
  // a while, but this file never had a matching branch to actually execute them -- a workflow
  // built with either node silently did nothing at runtime, with no error surfaced anywhere.
  // Reuses crm.ts's own add/removeLeadFromLeadListForTenant rather than writing to
  // LeadListMember directly, so this fires the exact same LEAD_ADDED_TO_LIST automation trigger
  // and audit-log entry the manual "add to list" UI action already does -- not a second,
  // divergent code path. Dynamic import to avoid a circular import (crm.ts imports this file as
  // pgAutomations), the same pattern this file's own call_app_action branch and crm.ts's NBA-
  // widget branch already use.
  if ((type === "add_to_list" || type === "remove_from_list") && nodeData.listId) {
    const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
    if (!leadId || !user.tenantId) return;
    const { addLeadsToLeadListForTenant, removeLeadFromLeadListForTenant } = await import("@/lib/server/crm");
    if (type === "add_to_list") {
      await addLeadsToLeadListForTenant(user, String(nodeData.listId), [leadId]).catch(() => undefined);
    } else {
      await removeLeadFromLeadListForTenant(user, String(nodeData.listId), leadId).catch(() => undefined);
    }
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
    const caseId = entityType === "CASE" ? entityId : String(record.caseId ?? "") || null;
    await execute(
      `insert into "Task"
       (id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "leadId", "opportunityId", "activityId", "caseId", "dueAt", "reminderAt", "completedAt", "completedBy", metadata, "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11, $12, $13, null, null, $14, $15, $15)`,
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
        caseId,
        nodeData.dueAt ?? null,
        nodeData.reminderAt ?? null,
        { source: "AUTOMATION", entityType, entityId },
        now,
      ],
      client,
    );
    return;
  }

  if (type === "apply_task_playbook") {
    const playbookId = String(nodeData.playbookId ?? "");
    if (!playbookId) return;
    const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "") || null;
    const opportunityId = entityType === "OPPORTUNITY" ? entityId : String(record.opportunityId ?? "") || null;
    if (!leadId && !opportunityId) return;

    const playbook = await queryOne<any>(
      'select id from "TaskPlaybook" where "tenantId" = $1 and id = $2 and "isActive" = true limit 1',
      [user.tenantId, playbookId],
      client,
    );
    if (!playbook) return;
    const items = await query<any>(
      'select id, title, description, priority, "dueInDays", "assignToRecordOwner" from "TaskPlaybookItem" where "tenantId" = $1 and "playbookId" = $2 order by "itemOrder" asc',
      [user.tenantId, playbookId],
      client,
    );
    if (!items.length) return;

    let recordOwnerId: string | null = null;
    if (opportunityId) {
      const opportunity = await queryOne<{ ownerId: string | null }>('select "ownerId" from "Opportunity" where "tenantId" = $1 and id = $2 limit 1', [user.tenantId, opportunityId], client);
      recordOwnerId = opportunity?.ownerId ?? null;
    }
    if (!recordOwnerId && leadId) {
      const lead = await queryOne<{ ownerId: string | null }>('select "ownerId" from "Lead" where "tenantId" = $1 and id = $2 limit 1', [user.tenantId, leadId], client);
      recordOwnerId = lead?.ownerId ?? null;
    }

    const now = new Date().toISOString();
    const taskIds: string[] = [];
    for (const item of items) {
      const taskId = randomUUID();
      const dueAt = new Date(Date.now() + Number(item.dueInDays ?? 1) * 24 * 60 * 60 * 1000).toISOString();
      const ownerId = item.assignToRecordOwner && recordOwnerId ? recordOwnerId : user.id;
      await execute(
        `insert into "Task"
         (id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "leadId", "opportunityId", "activityId", "dueAt", "reminderAt", "completedAt", "completedBy", metadata, "createdAt", "updatedAt")
         values ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, null, $10, null, null, null, $11, $12, $12)`,
        [
          taskId,
          user.tenantId,
          item.title,
          item.description,
          item.priority,
          ownerId,
          user.id,
          leadId,
          opportunityId,
          dueAt,
          { source: "TASK_PLAYBOOK", playbookId, playbookItemId: item.id },
          now,
        ],
        client,
      );
      taskIds.push(taskId);
    }

    await execute(
      `insert into "TaskPlaybookApplication" (id, "tenantId", "playbookId", "leadId", "opportunityId", "taskIds", "appliedBy", source, "createdAt")
       values ($1, $2, $3, $4, $5, $6, $7, 'AUTOMATION', $8)`,
      [randomUUID(), user.tenantId, playbookId, leadId, opportunityId, jsonbParam(taskIds), user.id, now],
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
    // Routed through the same consent/suppression checks every other send path uses
    // (queueCommunicationForTenant) instead of a raw insert -- this node previously
    // inserted 'QUEUED' unconditionally, so an automation (including every Marketing
    // Journey step) could message an opted-out or suppressed recipient. Dynamic import
    // avoids a top-level circular import: communications.ts already imports
    // runAutomationsForEvent from this file.
    const { queueCommunicationForTenant } = await import("@/lib/server/communications");

    // Channel fallback/throttle (gap checklist Module 8, item 8), configured per node --
    // journeys have no single canonical "campaign row" the way MarketingCampaign steps do,
    // so this node resolves and embeds the controls directly on the outbox row instead.
    const fallbackChannel = String(nodeData.fallbackChannel ?? "").toUpperCase();
    const fallbackCondition = String(nodeData.fallbackCondition ?? "BLOCKED_OR_FAILED");
    const fallbackRecipient = String(nodeData.fallbackTo ?? (fallbackChannel === "EMAIL" ? record.email : record.phone) ?? "").trim();
    const fallback =
      ["EMAIL", "WHATSAPP", "SMS"].includes(fallbackChannel) && fallbackRecipient && nodeData.fallbackMessage
        ? {
            channel: fallbackChannel as "EMAIL" | "WHATSAPP" | "SMS",
            recipient: fallbackRecipient,
            subject: (nodeData.fallbackSubject as string | undefined) ?? null,
            body: String(nodeData.fallbackMessage),
            delayMinutes: Number(nodeData.fallbackDelayMinutes ?? 0),
            // "BLOCKED_OR_FAILED" (default) fires immediately if the primary send is
            // suppressed/fatigue-capped, AND (separately) from the delayed FAILED-branch path
            // if it later exhausts retries. "FAILED_ONLY" suppresses the immediate branch.
            immediate: fallbackCondition !== "FAILED_ONLY",
          }
        : null;
    const throttlePerMinute = nodeData.throttlePerMinute ? Number(nodeData.throttlePerMinute) : null;
    const deliveryControls =
      throttlePerMinute || nodeData.quietHours
        ? {
            throttlePerMinute,
            quietHours: (nodeData.quietHours as Record<string, unknown> | undefined) ?? null,
            throttleKey: `${user.tenantId}:${entityType}:${nodeData.label ?? type}`,
          }
        : null;

    await queueCommunicationForTenant(
      user,
      {
        channel: channel as "EMAIL" | "WHATSAPP" | "SMS",
        recipient,
        subject: (nodeData.subject as string | undefined) ?? null,
        body,
        sourceType: "AUTOMATION",
        sourceId: entityId,
        entityType,
        entityId,
        payload: { automationNode: nodeData.label ?? type, sourceRecord: record },
        fallback,
        deliveryControls,
      },
      client,
    );
    return;
  }

  if (type === "assign_case" || type === "add_case_comment") {
    // Only meaningful for a case-triggered automation acting on its own triggering case --
    // there's no "related case" concept the way Opportunity has a parent Lead, so unlike
    // assign_owner this has no target/current-record picker.
    if (entityType !== "CASE") return;
    // Dynamic import avoids a top-level circular import: cases-postgres.ts already imports
    // runAutomationsForEvent from this same file (same reasoning as the send_email node's
    // import of communications.ts).
    const cases = await import("@/lib/repositories/cases-postgres");
    if (type === "assign_case") {
      const ownerId = String(nodeData.ownerId ?? "");
      if (!ownerId) return;
      const reason = String(nodeData.reason ?? "").trim() || "Assigned by automation";
      await cases.assignCaseToUser(user, entityId, { newOwnerId: ownerId, reason });
      return;
    }
    const body = String(nodeData.body ?? "").trim();
    if (!body) return;
    await cases.addCommentToCase(user, entityId, { body, isInternal: nodeData.isInternal !== false });
    return;
  }

  // Remaining case automation actions (gap checklist Module 11, item 13). "create_case" is
  // deliberately usable from ANY trigger scope (e.g. a Lead automation opening a case), not
  // just case-scoped ones -- every other node here acts on the triggering Case itself, so they
  // all still guard entityType === "CASE" the same way assign_case/add_case_comment do above.
  if (type === "create_case") {
    const cases = await import("@/lib/repositories/cases-postgres");
    const subject = String(nodeData.subject ?? "").trim() || `Case from automation (${entityType} ${entityId})`;
    await cases.createCaseForTenant(user, {
      subject,
      description: nodeData.description ? String(nodeData.description) : null,
      typeId: nodeData.typeId ? String(nodeData.typeId) : null,
      priorityId: nodeData.priorityId ? String(nodeData.priorityId) : null,
      queueId: nodeData.queueId ? String(nodeData.queueId) : null,
      relatedLeadId: entityType === "LEAD" ? entityId : (record.leadId ? String(record.leadId) : null),
      relatedOpportunityId: entityType === "OPPORTUNITY" ? entityId : (record.opportunityId ? String(record.opportunityId) : null),
      requesterName: record.name ? String(record.name) : (record.title ? String(record.title) : null),
      requesterEmail: record.email ? String(record.email) : null,
      requesterPhone: record.phone ? String(record.phone) : null,
    }).catch(() => undefined);
    return;
  }

  if (type === "update_case") {
    if (entityType !== "CASE") return;
    const cases = await import("@/lib/repositories/cases-postgres");
    const patch: Record<string, unknown> = {};
    for (const key of ["subject", "description", "typeId", "priorityId", "queueId"] as const) {
      if (nodeData[key] !== undefined && nodeData[key] !== "") patch[key] = nodeData[key];
    }
    if (Object.keys(patch).length === 0) return;
    await cases.updateCaseForTenant(user, entityId, patch);
    return;
  }

  if (type === "close_case" || type === "reopen_case") {
    if (entityType !== "CASE") return;
    const cases = await import("@/lib/repositories/cases-postgres");
    const statuses = await query<{ id: string; isClosedStatus: boolean }>(
      'select id, "isClosedStatus" from "CaseStatus" where "tenantId" = $1 order by "order" asc',
      [user.tenantId],
      client,
    );
    const target = type === "close_case" ? statuses.find((s) => s.isClosedStatus) : statuses.find((s) => !s.isClosedStatus);
    if (!target) return;
    await cases.updateCaseForTenant(user, entityId, { statusId: target.id });
    return;
  }

  if (type === "escalate_case") {
    if (entityType !== "CASE") return;
    const caseRow = await queryOne<any>('select * from "Case" where "tenantId" = $1 and id = $2', [user.tenantId, entityId], client);
    if (!caseRow?.ownerId) return;
    const owner = await queryOne<{ managerId: string | null }>('select "managerId" from "User" where id = $1', [caseRow.ownerId], client);
    const escalateToId = String(nodeData.escalateToId ?? "") || owner?.managerId;
    if (!escalateToId) return;
    await execute('update "Case" set "escalatedAt" = $1, "escalatedToId" = $2 where "tenantId" = $3 and id = $4', [new Date().toISOString(), escalateToId, user.tenantId, entityId], client);
    const { createUserNotification } = await import("@/lib/server/notifications");
    await createUserNotification({
      tenantId: user.tenantId!, userId: escalateToId, title: "Case escalated",
      message: `Case #${caseRow.caseNumber} "${caseRow.subject}" was escalated to you by an automation.`,
      data: { entityType: "CASE", entityId, caseId: entityId },
      category: "CASES",
    }).catch(() => undefined);
    return;
  }

  if (type === "send_case_acknowledgement" || type === "send_case_response") {
    if (entityType !== "CASE") return;
    const caseRow = await queryOne<any>('select * from "Case" where "tenantId" = $1 and id = $2', [user.tenantId, entityId], client);
    if (!caseRow) return;
    const channel = String(nodeData.channel ?? "EMAIL") as "EMAIL" | "WHATSAPP" | "SMS";
    const recipient = channel === "EMAIL" ? caseRow.requesterEmail : caseRow.requesterPhone;
    if (!recipient) return;
    const body = String(nodeData.body ?? "").trim() || (type === "send_case_acknowledgement"
      ? `We've received your request "${caseRow.subject}" (Case #${caseRow.caseNumber}) and will get back to you shortly.`
      : `Update on Case #${caseRow.caseNumber}: ${caseRow.subject}`);
    const { queueCommunicationForTenant } = await import("@/lib/server/communications");
    await queueCommunicationForTenant(user, {
      channel, recipient, subject: `Case #${caseRow.caseNumber}: ${caseRow.subject}`, body,
      sourceType: type === "send_case_acknowledgement" ? "CASE_AUTO_ACK" : "CASE_AUTOMATION_RESPONSE",
      sourceId: entityId, entityType: "CASE", entityId,
    }, client).catch(() => undefined);
    return;
  }

  if (type === "pause_case_sla" || type === "resume_case_sla") {
    if (entityType !== "CASE") return;
    const cases = await import("@/lib/repositories/cases-postgres");
    if (type === "pause_case_sla") await cases.pauseCaseSla(user, entityId);
    else await cases.resumeCaseSla(user, entityId);
    return;
  }

  if (type === "apply_case_macro") {
    if (entityType !== "CASE") return;
    const macroId = String(nodeData.macroId ?? "");
    if (!macroId) return;
    const { applyCaseMacro } = await import("@/lib/repositories/case-macros-postgres");
    await applyCaseMacro(user, entityId, macroId).catch(() => undefined);
    return;
  }

  if (type === "add_case_to_queue") {
    if (entityType !== "CASE") return;
    const queueId = String(nodeData.queueId ?? "");
    if (!queueId) return;
    const cases = await import("@/lib/repositories/cases-postgres");
    await cases.updateCaseForTenant(user, entityId, { queueId });
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

  // App-backed automation action node. nodeData.input values are static by default; a value
  // that is exactly "{{some.path}}" (a full-string match, not an in-string substitution) is
  // resolved against the triggering record via valueAtPath instead -- full-match rather than
  // partial-string templating avoids the JSON-escaping class of bug a raw string .replace()
  // would have here (a record value containing a `"` or `\` could otherwise corrupt the
  // outbound JSON body).
  if (type === "call_app_action" && nodeData.appId && nodeData.actionKey && user.tenantId) {
    const rawInput = (nodeData.input && typeof nodeData.input === "object" ? nodeData.input : {}) as Record<string, unknown>;
    const resolvedInput: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawInput)) {
      const match = typeof value === "string" ? value.match(/^\{\{(.+)\}\}$/) : null;
      resolvedInput[key] = match ? valueAtPath(record, match[1].trim()) : value;
    }
    // Dynamic import to avoid a circular import -- marketplace-postgres.ts imports
    // createAuditLog from crm.ts, which itself imports this file (same pattern crm.ts's own
    // NBA-widget branch uses to reach back into next-best-action.ts).
    const { invokeAppAction } = await import("@/lib/repositories/marketplace-postgres");
    await invokeAppAction(user, String(nodeData.appId), String(nodeData.actionKey), resolvedInput, automationId).catch(() => undefined);
  }

  if (type === "run_automation") {
    const targetId = String(nodeData.targetAutomationId ?? "");
    if (!targetId || !user.tenantId) return;
    // Cycle guard: visitedAutomationIds carries every automation already running in this
    // call chain (seeded with the top-level automation's own id in executeAutomationWorkflow,
    // extended here before recursing). A->B->A silently no-ops on the repeat visit rather
    // than recursing until the stack blows up -- matches this file's existing convention of
    // quietly skipping an action when its target can't be resolved (see share_opportunity,
    // clear_field, change_stage above) rather than throwing and failing the whole execution.
    if (visitedAutomationIds?.has(targetId)) return;
    const targetAutomation = await queryOne<any>(
      'select id, name, trigger, workflow, "isActive" from "AutomationV2" where id = $1 and "tenantId" = $2 and "deletedAt" is null and "isActive" = true',
      [targetId, user.tenantId],
      client,
    );
    if (!targetAutomation) return;
    const nextVisited = new Set(visitedAutomationIds ?? []);
    nextVisited.add(targetId);
    const startedAt = new Date().toISOString();
    const log = await executeAutomationWorkflow(user, targetAutomation, entityType, entityId, record, "LIVE", { client, visitedAutomationIds: nextVisited });
    const waiting = log.some((step) => step.status === "WAITING");
    await execute(
      `insert into "AutomationExecution"
        (id, "tenantId", "automationId", status, "entityType", "entityId", context, "executionLog", "workflowSnapshot", "startedAt", "completedAt", error)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null)`,
      [randomUUID(), user.tenantId, targetAutomation.id, waiting ? "WAITING" : "COMPLETED", entityType, entityId, { subAutomation: true }, { steps: log }, targetAutomation.workflow, startedAt, waiting ? null : new Date().toISOString()],
      client,
    );
    return;
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
    [randomUUID(), user.tenantId, user.id, automation.id, entityType, entityId, jsonbParam(record), jsonbParam(resumeNodeIds), waitingNodeId, runAt.toISOString(), new Date().toISOString()],
    client,
  );
}

// "activity.<field>" (valueAtPath's existing entity-prefix convention) always means the
// specific Activity that fired this trigger -- there was no way at all to reference "the
// lead's most recent activity" from a Lead- or Opportunity-triggered automation, since only
// the triggering row itself was ever reachable. Enriching `record` once, up front, lets
// valueAtPath resolve "leadActivity.<field>" via its ordinary generic-object-path lookup with
// no changes to the (deeply, synchronously, recursively used) condition evaluator itself.
async function attachLatestLeadActivity(user: TenantUser, entityType: string, entityId: string, record: Record<string, unknown>, client?: Queryable) {
  const leadId = entityType === "LEAD" ? entityId : String(record.leadId ?? "");
  if (!leadId || !user.tenantId) return record;
  const latest = await queryOne<any>(
    'select * from "Activity" where "tenantId" = $1 and "leadId" = $2 order by "createdAt" desc limit 1',
    [user.tenantId, leadId],
    client,
  );
  return { ...record, leadActivity: latest ?? null };
}

export async function executeAutomationWorkflow(
  user: TenantUser,
  automation: any,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>,
  mode: "LIVE" | "TEST",
  options: { startNodeIds?: string[]; resumeJobId?: string; client?: Queryable; visitedAutomationIds?: Set<string> } = {},
) {
  const visitedAutomationIds = options.visitedAutomationIds ?? new Set<string>([automation.id]);
  record = await attachLatestLeadActivity(user, entityType, entityId, record, options.client);
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
      const runAt = await automationDelayDate(waitConfig, user.tenantId);
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
        await executeAutomationAction(user, entityType, entityId, record, nodeData, String((automation.trigger as Record<string, unknown> | undefined)?.type ?? "AUTOMATION"), options.client, visitedAutomationIds, automation.id ?? null);
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
  await assertFeatureEnabled(user.tenantId, "automationEnabled", { isPlatformAdmin: user.isPlatformAdmin });
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
  await assertFeatureEnabled(user.tenantId, "automationEnabled", { isPlatformAdmin: user.isPlatformAdmin });
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

export async function loadAutomationTestRecord(user: TenantUser, entityType: string, entityId: string) {
  const type = entityType.toUpperCase();
  const table = type === "OPPORTUNITY" ? "Opportunity" : type === "ACTIVITY" ? "Activity" : "Lead";
  const tenant = tenantWhere(user, 2);
  return (await queryOne<any>(`select * from "${table}" where id = $1 and ${tenant.sql} limit 1`, [entityId, ...tenant.values])) ?? { id: entityId };
}

export async function testAutomationForTenant(user: TenantUser, automationId: string, input: { entityType: string; entityId: string }) {
  await assertFeatureEnabled(user.tenantId, "automationEnabled", { isPlatformAdmin: user.isPlatformAdmin });
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
  // Every call site is a fire-and-forget `.catch(() => undefined)` from another repository's
  // own mutation (leads, opportunities, forms, distribution, cases, etc.) -- a thrown error
  // here would look identical to a genuine automation failure instead of the deliberate
  // "nothing to do here" outcome a disabled tenant should produce. Mirrors distributeRecord's
  // graceful no-op for the same reason.
  if (!(await isFeatureEnabledForTenant(user.tenantId, "automationEnabled"))) return [];

  // "Automation/job throttling" -- a tenant-wide ceiling on how many triggering EVENTS get
  // matched against automations per minute, distinct from the existing per-automation
  // maxExecutionsPerRecord cap below (a workflow-safety guard against one record re-triggering
  // the same automation forever, not a throughput limit). 1000/min is generous enough that a
  // real bulk import (hundreds of leads created in a burst) doesn't trip it, but catches a
  // runaway loop or scripted abuse hammering this tenant's automation triggers. Same
  // fire-and-forget philosophy as the feature-flag check above: every caller already
  // `.catch(() => undefined)`s this function, so a skipped batch here is silent, not an error.
  const throttle = await checkRateLimitWithAlert({
    key: `automation:tenant:${user.tenantId}`,
    limit: 1000,
    windowSeconds: 60,
    tenantId: user.tenantId,
    category: "AUTOMATION",
    detail: `tenant ${user.tenantId}, event ${eventType}`,
  });
  if (!throttle.allowed) return [];

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

// Manual bulk enrollment: runs an Automation's own workflow steps directly for a batch of
// existing records, bypassing the normal event-trigger matching entirely (an enrolled record
// doesn't need to match the automation's trigger condition -- enrollment IS the trigger).
// Mirrors runAutomationsForEvent's per-record execute-and-log shape exactly, but against a
// caller-supplied id list instead of trigger-matched automations, and tracked under one
// AutomationEnrollmentJob row per batch.
export async function enrollRecordsInAutomation(
  user: TenantUser,
  automationId: string,
  entityType: "LEAD" | "OPPORTUNITY",
  recordIds: string[],
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "automationEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const ids = [...new Set(recordIds.filter(Boolean))].slice(0, 500);
  if (!ids.length) throw new Error("NO_RECORDS_PROVIDED");

  const automation = await queryOne<any>(
    'select id, name, trigger, workflow, "isActive" from "AutomationV2" where id = $1 and "tenantId" = $2 and "deletedAt" is null',
    [automationId, user.tenantId],
  );
  if (!automation) throw new Error("AUTOMATION_NOT_FOUND");

  const table = entityType === "OPPORTUNITY" ? "Opportunity" : "Lead";
  const records = await query<any>(`select * from "${table}" where "tenantId" = $1 and id = any($2::text[])`, [user.tenantId, ids]);
  const recordById = new Map(records.map((record: any) => [record.id, record]));

  const jobId = randomUUID();
  const now = new Date().toISOString();
  await execute(
    `insert into "AutomationEnrollmentJob" (id, "tenantId", "automationId", "entityType", "totalRecords", "processed", "succeeded", "failed", status, errors, "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, 0, 0, 0, 'PROCESSING', '[]', $6, $7)`,
    [jobId, user.tenantId, automationId, entityType, ids.length, user.id, now],
  );

  let succeeded = 0;
  const errors: Array<{ recordId: string; message: string }> = [];
  for (const id of ids) {
    const record = recordById.get(id);
    if (!record) {
      errors.push({ recordId: id, message: "Record not found" });
      continue;
    }
    const startedAt = new Date().toISOString();
    const log: Array<Record<string, unknown>> = [];
    try {
      await withTransaction(user, async (client) => {
        log.push(...await executeAutomationWorkflow(user, automation, entityType, id, record, "LIVE", { client }));
        const waiting = log.some((step) => step.status === "WAITING");
        await execute(
          `insert into "AutomationExecution"
            (id, "tenantId", "automationId", status, "entityType", "entityId", context, "executionLog", "workflowSnapshot", "startedAt", "completedAt", error)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null)`,
          [randomUUID(), user.tenantId, automation.id, waiting ? "WAITING" : "COMPLETED", entityType, id, { manualEnrollment: true, jobId }, { steps: log }, automation.workflow, startedAt, waiting ? null : new Date().toISOString()],
          client,
        );
      });
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automation failed";
      await execute(
        `insert into "AutomationExecution"
          (id, "tenantId", "automationId", status, "entityType", "entityId", context, "executionLog", "workflowSnapshot", "startedAt", "completedAt", error)
         values ($1, $2, $3, 'FAILED', $4, $5, $6, $7, $8, $9, $10, $11)`,
        [randomUUID(), user.tenantId, automation.id, entityType, id, { manualEnrollment: true, jobId }, { steps: log }, automation.workflow, startedAt, new Date().toISOString(), message],
      );
      errors.push({ recordId: id, message });
    }
  }

  const status = errors.length === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS";
  await execute(
    `update "AutomationEnrollmentJob" set processed = $1, succeeded = $2, failed = $3, status = $4, errors = $5, "completedAt" = $6 where id = $7`,
    [ids.length, succeeded, errors.length, status, JSON.stringify(errors), new Date().toISOString(), jobId],
  );

  return { jobId, totalRecords: ids.length, succeeded, failed: errors.length, status };
}

export async function listAutomationEnrollmentJobsForTenant(user: TenantUser, automationId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "entityType", "totalRecords", processed, succeeded, failed, status, errors, "createdAt", "completedAt"
     from "AutomationEnrollmentJob"
     where "tenantId" = $1 and "automationId" = $2
     order by "createdAt" desc
     limit 20`,
    [user.tenantId, automationId],
  );
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

// WP07 (F04): this internal helper is shared by two genuinely different callers --
// processDueAutomationJobsForTenant (a normal authenticated request, real ambient tenant
// context present, `input.tenantId` set) and processDueAutomationJobs (the worker's own
// platform-wide sweep, no tenantId, no ambient context at all -- BACKGROUND_JOB, disposition
// B). Rather than converting the whole shared function (which would incorrectly bypass RLS for
// the normal per-tenant caller), only the no-tenantId/worker-sweep branch uses the system pool.
async function processDueAutomationJobsInternal(input: { tenantId?: string; fallbackUser?: TenantUser; limit: number }) {
  const values: unknown[] = [new Date().toISOString(), input.limit];
  const tenantClause = input.tenantId ? ' and "tenantId" = $3' : "";
  if (input.tenantId) values.push(input.tenantId);
  const jobs = await (input.tenantId ? query : queryAsSystem)<any>(
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
      // A tenant that disabled Automations after this job was already queued -- cancel rather
      // than execute a workflow they no longer have access to, or silently drop the job.
      if (!(await isFeatureEnabledForTenant(job.tenantId, "automationEnabled"))) {
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

import { randomUUID } from "crypto";
import { execute, query, queryOne, queryAsSystem } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { createUserNotification } from "@/lib/server/notifications";
import { getActiveTaskSlaPolicyForPriority } from "@/lib/repositories/task-sla-policies-postgres";
import { enqueueWebhookEvent } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

export type TaskInput = {
  title?: string;
  description?: string | null;
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  ownerId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  activityId?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
  metadata?: Record<string, unknown> | null;
  parentTaskId?: string | null;
  requireCompletionNote?: boolean;
  completionNote?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  seriesId?: string | null;
  escalateAfterMinutes?: number | null;
  escalateToUserId?: string | null;
  queueId?: string | null;
};

export type RecurrenceRule = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  // Whether the next occurrence's due date is computed from this occurrence's original due
  // date (a stable cadence, e.g. always Monday) or from the moment it's actually completed
  // (a rolling cadence, e.g. "3 days after I actually finish"). Defaults to DUE_DATE.
  anchor?: "DUE_DATE" | "COMPLETION_DATE";
  endDate?: string | null;
  occurrencesRemaining?: number | null;
};

type TaskFilters = {
  status?: string | null;
  priority?: string | null;
  ownerId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  activityId?: string | null;
  due?: "overdue" | "today" | "upcoming" | "completed" | null;
};

export type BulkTaskInput = {
  ids?: string[];
  status?: TaskInput["status"];
  ownerId?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
};

const TASK_COLUMNS =
  'id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "leadId", "opportunityId", "activityId", "dueAt", "reminderAt", "completedAt", "completedBy", metadata, "parentTaskId", "requireCompletionNote", "completionNote", "recurrenceRule", "seriesId", "escalateAfterMinutes", "escalateToUserId", "slaTarget", "firstActionAt", "firstActionSlaTarget", "slaStatus", "queueId", "queuedAt", "claimedBy", "claimedAt", "createdAt", "updatedAt"';

async function getTeamForTenant(tenantId: string, teamId: string) {
  return queryOne<any>('select id, name, "leadId" from "Team" where "tenantId"::text = $1 and id::text = $2', [tenantId, teamId]);
}

// A queue action is supervisor-level if the caller has TEAM/ALL record access (the existing
// recordAccess levels already used everywhere else in this app) or is the queue team's own
// lead -- there's no separate "tasks" permission module (confirmed: Role only has
// leads/opportunities/activities/admin/integrations), so this reuses recordAccess rather
// than inventing a new permission axis.
function isQueueSupervisor(user: TenantUser, team: { leadId?: string | null } | null) {
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  if (permissions?.recordAccess === "ALL" || permissions?.recordAccess === "TEAM") return true;
  return !!team?.leadId && team.leadId === user.id;
}

async function isQueueMember(user: TenantUser, teamId: string) {
  const row = await queryOne<any>('select "teamId" from "User" where id::text = $1', [user.id]);
  return row?.teamId != null && String(row.teamId) === String(teamId);
}

function isOwnerScoped(user: TenantUser) {
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  return !!permissions?.isPartnerRole || permissions?.recordAccess === "OWN";
}

function buildWhere(user: TenantUser, filters: TaskFilters = {}) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (!user.tenantId) clauses.push("false");
  else {
    values.push(user.tenantId);
    clauses.push(`"tenantId" = $${values.length}`);
  }
  if (isOwnerScoped(user)) {
    values.push(user.id);
    clauses.push(`"ownerId" = $${values.length}`);
  }
  for (const [key, column] of [
    ["status", "status"],
    ["priority", "priority"],
    ["ownerId", "ownerId"],
    ["leadId", "leadId"],
    ["opportunityId", "opportunityId"],
    ["activityId", "activityId"],
  ] as const) {
    const value = filters[key];
    if (value && value !== "ALL") {
      values.push(value);
      clauses.push(`"${column}" = $${values.length}`);
    }
  }

  const now = new Date();
  if (filters.due === "overdue") {
    values.push(now.toISOString());
    clauses.push(`"dueAt" < $${values.length} and status not in ('COMPLETED', 'CANCELLED')`);
  } else if (filters.due === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    values.push(start.toISOString(), end.toISOString());
    clauses.push(`"dueAt" >= $${values.length - 1} and "dueAt" < $${values.length}`);
  } else if (filters.due === "upcoming") {
    values.push(now.toISOString());
    clauses.push(`"dueAt" >= $${values.length} and status not in ('COMPLETED', 'CANCELLED')`);
  } else if (filters.due === "completed") {
    clauses.push("status = 'COMPLETED'");
  }

  return { sql: `where ${clauses.join(" and ")}`, values };
}

async function rowsByIds(table: string, columns: string, ids: string[], tenantId?: string | null) {
  if (!ids.length) return [];
  return query<any>(
    `select ${columns} from "${table}" where id = any($1::text[])${tenantId ? ' and "tenantId" = $2' : ""}`,
    tenantId ? [ids, tenantId] : [ids],
  );
}

async function hydrate(user: TenantUser, tasks: any[]) {
  const userIds = [...new Set(tasks.flatMap((task) => [task.ownerId, task.createdBy, task.completedBy]).filter(Boolean))];
  const leadIds = [...new Set(tasks.map((task) => task.leadId).filter(Boolean))];
  const opportunityIds = [...new Set(tasks.map((task) => task.opportunityId).filter(Boolean))];
  const activityIds = [...new Set(tasks.map((task) => task.activityId).filter(Boolean))];
  const taskIds = tasks.map((task) => task.id);
  const parentTaskIds = [...new Set(tasks.map((task) => task.parentTaskId).filter(Boolean))];
  const [users, leads, opportunities, activities, parentTasks, checklistItems, dependencies, subtaskCounts] = await Promise.all([
    rowsByIds("User", "id, name, email", userIds),
    rowsByIds("Lead", "id, name, email, company", leadIds, user.tenantId),
    rowsByIds("Opportunity", "id, title, amount", opportunityIds, user.tenantId),
    rowsByIds("Activity", "id, notes, outcome", activityIds, user.tenantId),
    rowsByIds("Task", "id, title, status", parentTaskIds, user.tenantId),
    taskIds.length
      ? query<any>(
          'select "taskId", id, "itemOrder", title, "isDone", "completedAt", "completedBy" from "TaskChecklistItem" where "tenantId" = $1 and "taskId" = any($2::text[]) order by "itemOrder" asc',
          [user.tenantId, taskIds],
        )
      : Promise.resolve([]),
    taskIds.length
      ? query<any>(
          `select dep."taskId", dep."blockedByTaskId", blocker.title as "blockedByTitle", blocker.status as "blockedByStatus"
           from "TaskDependency" dep
           join "Task" blocker on blocker.id = dep."blockedByTaskId"
           where dep."tenantId" = $1 and dep."taskId" = any($2::text[])`,
          [user.tenantId, taskIds],
        )
      : Promise.resolve([]),
    taskIds.length
      ? query<{ parentTaskId: string; count: number }>(
          'select "parentTaskId", count(*)::int as count from "Task" where "tenantId" = $1 and "parentTaskId" = any($2::text[]) group by "parentTaskId"',
          [user.tenantId, taskIds],
        )
      : Promise.resolve([]),
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  const leadMap = new Map(leads.map((row) => [row.id, row]));
  const opportunityMap = new Map(opportunities.map((row) => [row.id, row]));
  const activityMap = new Map(activities.map((row) => [row.id, row]));
  const parentTaskMap = new Map(parentTasks.map((row) => [row.id, row]));
  const checklistByTask = new Map<string, any[]>();
  for (const item of checklistItems) {
    const list = checklistByTask.get(item.taskId) ?? [];
    list.push(item);
    checklistByTask.set(item.taskId, list);
  }
  const dependenciesByTask = new Map<string, any[]>();
  for (const dep of dependencies) {
    const list = dependenciesByTask.get(dep.taskId) ?? [];
    list.push(dep);
    dependenciesByTask.set(dep.taskId, list);
  }
  const subtaskCountMap = new Map(subtaskCounts.map((row) => [row.parentTaskId, row.count]));

  return tasks.map((task) => {
    const blockedBy = dependenciesByTask.get(task.id) ?? [];
    return {
      ...task,
      owner: userMap.get(task.ownerId) ?? null,
      creator: userMap.get(task.createdBy) ?? null,
      lead: task.leadId ? leadMap.get(task.leadId) ?? null : null,
      opportunity: task.opportunityId ? opportunityMap.get(task.opportunityId) ?? null : null,
      activity: task.activityId ? activityMap.get(task.activityId) ?? null : null,
      parentTask: task.parentTaskId ? parentTaskMap.get(task.parentTaskId) ?? null : null,
      subtaskCount: subtaskCountMap.get(task.id) ?? 0,
      checklist: checklistByTask.get(task.id) ?? [],
      blockedBy: blockedBy.map((dep) => ({ taskId: dep.blockedByTaskId, title: dep.blockedByTitle, status: dep.blockedByStatus })),
      isBlocked: blockedBy.some((dep) => dep.blockedByStatus !== "COMPLETED" && dep.blockedByStatus !== "CANCELLED"),
    };
  });
}

async function rawTask(user: TenantUser, id: string) {
  if (!user.tenantId) return null;
  const where = buildWhere(user);
  return queryOne<any>(`select ${TASK_COLUMNS} from "Task" ${where.sql} and id = $${where.values.length + 1} limit 1`, where.values.concat([id]));
}

export async function listTasksForTenant(user: TenantUser, filters: TaskFilters = {}) {
  if (!user.tenantId) return [];
  const where = buildWhere(user, filters);
  const tasks = await query<any>(
    `select ${TASK_COLUMNS} from "Task" ${where.sql} order by "dueAt" asc nulls last, "createdAt" desc limit 500`,
    where.values,
  );
  return hydrate(user, tasks);
}

export async function getTaskForTenant(user: TenantUser, id: string) {
  const task = await rawTask(user, id);
  if (!task) return null;
  return (await hydrate(user, [task]))[0] ?? null;
}

async function audit(user: TenantUser, action: string, taskId: string, before: unknown, after: unknown, diff: unknown) {
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, 'TASK', $5, $6, $7, $8, null, $9)`,
    [randomUUID(), user.tenantId, user.id, action, taskId, before, after, diff, new Date().toISOString()],
  );
}

async function emitTaskAutomation(user: TenantUser, action: "CREATED" | "UPDATED" | "COMPLETED" | "REMINDER" | "OVERDUE", task: Record<string, any>) {
  const baseRecord = {
    ...task,
    taskId: task.id,
    leadId: task.leadId ?? null,
    opportunityId: task.opportunityId ?? null,
    activityId: task.activityId ?? null,
  };
  const suffix = action === "CREATED" ? "CREATED" : action === "COMPLETED" ? "COMPLETED" : action === "REMINDER" ? "REMINDER" : action === "OVERDUE" ? "OVERDUE" : "UPDATED";
  if (task.opportunityId) {
    await runAutomationsForEvent(user, `TASK_${suffix}_ON_OPPORTUNITY`, "TASK", task.id, baseRecord).catch(() => undefined);
  }
  if (task.leadId) {
    await runAutomationsForEvent(user, `TASK_${suffix}_ON_LEAD`, "TASK", task.id, baseRecord).catch(() => undefined);
  }
  // Gap checklist Module 16's app event bus, "task" event domain -- previously undelivered
  // since no automation-trigger-equivalent hook existed for Task at the time of that pass;
  // confirmed real now (this function), so wired the same way ACTIVITY_CREATED/ACTIVITY_UPDATED
  // already were. Collapsed to CREATED/UPDATED for the external bus (COMPLETED/REMINDER/OVERDUE
  // all count as UPDATED here) -- the internal automation-trigger granularity above is
  // unchanged, this only affects what an installed app/webhook subscriber sees.
  const busEventType = action === "CREATED" ? "TASK_CREATED" : "TASK_UPDATED";
  await enqueueWebhookEvent(user.tenantId, busEventType, baseRecord).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, busEventType, baseRecord).catch(() => undefined);
  // Event-based NBA refresh (gap checklist: "worker job... plus event-based refresh on
  // lead/opportunity/activity/task/communication/scoring changes") -- one shared helper
  // covers every task event type (create/update/complete/reminder/overdue) at once, since
  // they all funnel through this function. Dynamic import: next-best-action.ts already
  // imports createTaskForTenant from this file, so a static import back would be circular.
  const { refreshNextBestActionsForRecord } = await import("@/lib/server/next-best-action");
  if (task.opportunityId) await refreshNextBestActionsForRecord(user, "OPPORTUNITY", task.opportunityId).catch(() => undefined);
  if (task.leadId) await refreshNextBestActionsForRecord(user, "LEAD", task.leadId).catch(() => undefined);
}

// Task's own version of Activity.defaultSLA -- unlike that one (confirmed dormant: stored
// per activity type but never consumed to set a target anywhere), this is actually wired up:
// looked up by priority at creation time and used to compute real slaTarget/firstActionSlaTarget
// values that the completion/update path and the SLA breach worker job both act on.
async function computeSlaTargets(tenantId: string, priority: string, dueAt: string | null, createdAtMs: number) {
  const policy = await getActiveTaskSlaPolicyForPriority(tenantId, priority).catch(() => null);
  const firstActionSlaTarget = policy?.firstActionMinutes
    ? new Date(createdAtMs + policy.firstActionMinutes * 60 * 1000).toISOString()
    : null;
  // The due date IS the completion SLA target when one is set; otherwise fall back to the
  // policy's completion-minutes offset from creation.
  const slaTarget = dueAt || (policy?.completionMinutes ? new Date(createdAtMs + policy.completionMinutes * 60 * 1000).toISOString() : null);
  return { firstActionSlaTarget, slaTarget };
}

export async function createTaskForTenant(user: TenantUser, input: TaskInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!input.title?.trim()) throw new Error("TASK_TITLE_REQUIRED");
  const now = new Date().toISOString();
  const queueId = input.queueId || null;
  const team = queueId ? await getTeamForTenant(user.tenantId, queueId) : null;
  const explicitOwner = !!input.ownerId;
  // Creating straight into a queue with no explicit owner leaves it unclaimed -- ownerId
  // falls back to the queue's team lead (a real, visible "responsible party") rather than
  // loosening Task.ownerId's NOT NULL constraint for a "nobody yet" state.
  const ownerId = input.ownerId || (queueId ? (team?.leadId || user.id) : user.id);
  const claimedBy = queueId && explicitOwner ? ownerId : null;
  const dueAt = input.dueAt || null;
  const { firstActionSlaTarget, slaTarget } = await computeSlaTargets(user.tenantId, input.priority ?? "MEDIUM", dueAt, Date.now());
  const task = await queryOne<any>(
    `insert into "Task" (id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "leadId", "opportunityId", "activityId", "dueAt", "reminderAt", "completedAt", "completedBy", metadata, "parentTaskId", "requireCompletionNote", "completionNote", "recurrenceRule", "seriesId", "escalateAfterMinutes", "escalateToUserId", "slaTarget", "firstActionSlaTarget", "slaStatus", "queueId", "queuedAt", "claimedBy", "claimedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $31)
     returning ${TASK_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      input.title.trim(),
      input.description || null,
      input.status ?? "OPEN",
      input.priority ?? "MEDIUM",
      ownerId,
      user.id,
      input.leadId || null,
      input.opportunityId || null,
      input.activityId || null,
      dueAt,
      input.reminderAt || null,
      input.status === "COMPLETED" ? now : null,
      input.status === "COMPLETED" ? user.id : null,
      input.metadata ?? {},
      input.parentTaskId || null,
      input.requireCompletionNote ?? false,
      input.completionNote || null,
      input.recurrenceRule ?? null,
      input.seriesId || null,
      input.escalateAfterMinutes ?? null,
      input.escalateToUserId || null,
      slaTarget,
      firstActionSlaTarget,
      slaTarget ? "PENDING" : null,
      queueId,
      queueId ? now : null,
      claimedBy,
      claimedBy ? now : null,
      now,
    ],
  );
  if (!task) throw new Error("TASK_INSERT_FAILED");
  await audit(user, "CREATE", task.id, null, task, null);
  await emitTaskAutomation(user, "CREATED", task);
  return task;
}

function computeNextOccurrenceDueAt(rule: RecurrenceRule, task: any): Date | null {
  const anchorSource = rule.anchor === "COMPLETION_DATE" || !task.dueAt ? new Date() : new Date(task.dueAt);
  const next = new Date(anchorSource);
  if (rule.frequency === "DAILY") next.setUTCDate(next.getUTCDate() + 1);
  else if (rule.frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  else if (rule.frequency === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + 1);
  else return null;
  if (rule.endDate && next.getTime() > new Date(rule.endDate).getTime()) return null;
  return next;
}

// Spawns the next occurrence of a recurring Task. Not cron-polled -- called synchronously
// right when the current occurrence is completed or explicitly skipped, matching how
// everyday task apps handle "repeat" (the next occurrence appears the moment you finish
// this one, not on a schedule scan).
async function advanceTaskRecurrence(user: TenantUser, task: any) {
  const rule = task.recurrenceRule as RecurrenceRule | null;
  if (!rule?.frequency) return null;
  if (typeof rule.occurrencesRemaining === "number" && rule.occurrencesRemaining <= 1) return null;

  const nextDueAt = computeNextOccurrenceDueAt(rule, task);
  if (!nextDueAt) return null;

  const reminderOffsetMs = task.reminderAt && task.dueAt ? new Date(task.dueAt).getTime() - new Date(task.reminderAt).getTime() : null;
  const nextReminderAt = reminderOffsetMs !== null ? new Date(nextDueAt.getTime() - reminderOffsetMs) : null;
  const seriesId = task.seriesId || task.id;
  const nextRule: RecurrenceRule = typeof rule.occurrencesRemaining === "number"
    ? { ...rule, occurrencesRemaining: rule.occurrencesRemaining - 1 }
    : rule;

  return createTaskForTenant(user, {
    title: task.title,
    description: task.description,
    priority: task.priority,
    ownerId: task.ownerId,
    leadId: task.leadId,
    opportunityId: task.opportunityId,
    activityId: task.activityId,
    dueAt: nextDueAt.toISOString(),
    reminderAt: nextReminderAt ? nextReminderAt.toISOString() : null,
    requireCompletionNote: task.requireCompletionNote,
    escalateAfterMinutes: task.escalateAfterMinutes,
    escalateToUserId: task.escalateToUserId,
    recurrenceRule: nextRule,
    seriesId,
  });
}

export async function skipTaskOccurrenceForTenant(user: TenantUser, id: string) {
  const existing = await rawTask(user, id);
  if (!existing) return null;
  const cancelled = await updateTaskForTenant(user, id, { status: "CANCELLED" });
  if (!cancelled) return null;
  const nextTask = existing.recurrenceRule ? await advanceTaskRecurrence(user, existing) : null;
  return { task: cancelled, nextTask };
}

// Append-only breach audit -- the unique(tenantId, taskId, breachType) constraint makes this
// naturally idempotent (a task can only breach FIRST_ACTION or COMPLETION once each), so
// both the real-time call sites below and the periodic worker scan can safely call this
// without needing their own separate "already logged?" check.
async function logTaskSlaBreach(task: any, breachType: "FIRST_ACTION" | "COMPLETION") {
  await execute(
    `insert into "TaskSlaBreach" (id, "tenantId", "taskId", "breachType", "ownerId", "breachedAt", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $6)
     on conflict ("tenantId", "taskId", "breachType") do nothing`,
    [randomUUID(), task.tenantId, task.id, breachType, task.ownerId, new Date().toISOString()],
  ).catch(() => undefined);
  if (task.escalateToUserId) {
    await createUserNotification({
      tenantId: task.tenantId,
      userId: task.escalateToUserId,
      title: "Task SLA breached",
      message: `"${task.title}" missed its ${breachType === "FIRST_ACTION" ? "first-action" : "completion"} SLA.`,
      data: { taskId: task.id, breachType, leadId: task.leadId, opportunityId: task.opportunityId },
      category: "TASKS",
    }).catch(() => undefined);
  }
}

async function assertCanCompleteTask(user: TenantUser, existing: any, input: TaskInput) {
  const requireNote = input.requireCompletionNote ?? existing.requireCompletionNote;
  const note = input.completionNote !== undefined ? input.completionNote : existing.completionNote;
  if (requireNote && !note?.trim()) throw new Error("TASK_COMPLETION_NOTE_REQUIRED");

  const blockers = await query<{ status: string }>(
    `select blocker.status
     from "TaskDependency" dep
     join "Task" blocker on blocker.id = dep."blockedByTaskId"
     where dep."tenantId" = $1 and dep."taskId" = $2`,
    [user.tenantId, existing.id],
  );
  const incomplete = blockers.some((row) => row.status !== "COMPLETED" && row.status !== "CANCELLED");
  if (incomplete) throw new Error("TASK_BLOCKED_BY_INCOMPLETE_DEPENDENCY");
}

function buildDiff(before: Record<string, any>, after: Record<string, any>) {
  const result: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      result[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return Object.keys(result).length ? result : null;
}

export async function updateTaskForTenant(user: TenantUser, id: string, input: TaskInput) {
  const existing = await rawTask(user, id);
  if (!existing) return null;
  const wasCompleted = existing.status === "COMPLETED";
  const nextStatus = input.status ?? existing.status;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updatedAt: now };
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new Error("TASK_TITLE_REQUIRED");
    patch.title = input.title.trim();
  }
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.ownerId !== undefined) patch.ownerId = input.ownerId || user.id;
  if (input.leadId !== undefined) patch.leadId = input.leadId || null;
  if (input.opportunityId !== undefined) patch.opportunityId = input.opportunityId || null;
  if (input.activityId !== undefined) patch.activityId = input.activityId || null;
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt || null;
  if (input.reminderAt !== undefined) patch.reminderAt = input.reminderAt || null;
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {};
  if (input.parentTaskId !== undefined) patch.parentTaskId = input.parentTaskId || null;
  if (input.requireCompletionNote !== undefined) patch.requireCompletionNote = input.requireCompletionNote;
  if (input.completionNote !== undefined) patch.completionNote = input.completionNote || null;
  if (input.recurrenceRule !== undefined) patch.recurrenceRule = input.recurrenceRule ?? null;
  if (input.escalateAfterMinutes !== undefined) patch.escalateAfterMinutes = input.escalateAfterMinutes ?? null;
  if (input.escalateToUserId !== undefined) patch.escalateToUserId = input.escalateToUserId || null;
  // Due-based SLA targets track a rescheduled due date; policy-derived targets (no dueAt at
  // creation time) are left alone since there's no new anchor to recompute from here.
  if (input.dueAt !== undefined && !wasCompleted && existing.slaTarget && existing.dueAt) {
    patch.slaTarget = input.dueAt || existing.slaTarget;
  }
  // Any update to an untouched task counts as the "first action" -- simpler and more honest
  // than trying to distinguish a real triage action from a routine field edit.
  const capturingFirstAction = !existing.firstActionAt;
  if (capturingFirstAction) patch.firstActionAt = now;
  if (!wasCompleted && nextStatus === "COMPLETED") {
    await assertCanCompleteTask(user, existing, input);
    patch.completedAt = now;
    patch.completedBy = user.id;
    if (existing.slaTarget) {
      patch.slaStatus = new Date(now).getTime() > new Date(existing.slaTarget).getTime() ? "BREACHED" : "MET";
    }
  }
  if (wasCompleted && nextStatus !== "COMPLETED") {
    patch.completedAt = null;
    patch.completedBy = null;
    patch.slaStatus = existing.slaTarget ? "PENDING" : null;
  }

  const columns = Object.keys(patch);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  values.push(user.tenantId, id);
  const task = await queryOne<any>(
    `update "Task" set ${assignments} where "tenantId" = $${values.length - 1} and id = $${values.length} returning ${TASK_COLUMNS}`,
    values,
  );
  if (!task) return null;
  await audit(user, "UPDATE", task.id, existing, task, buildDiff(existing, task));
  const justCompleted = !wasCompleted && nextStatus === "COMPLETED";
  await emitTaskAutomation(user, justCompleted ? "COMPLETED" : "UPDATED", task);
  if (justCompleted && task.recurrenceRule) await advanceTaskRecurrence(user, task).catch(() => undefined);
  // "Completion rate" (gap checklist: "NBA analytics") -- a task spawned from an accepted NBA
  // recommendation (next-best-action.ts's executeRecommendation) carries the link in
  // metadata.recommendationId; finishing it here is the real completion signal that
  // recommendation was waiting for. Dynamic import: next-best-action.ts already imports
  // createTaskForTenant from this file, so a static import back would be circular.
  if (justCompleted && task.metadata?.recommendationId) {
    const { completeLinkedRecommendation } = await import("@/lib/server/next-best-action");
    await completeLinkedRecommendation(user, task.metadata.recommendationId).catch(() => undefined);
  }
  if (capturingFirstAction && task.firstActionSlaTarget && new Date(now).getTime() > new Date(task.firstActionSlaTarget).getTime()) {
    await logTaskSlaBreach(task, "FIRST_ACTION").catch(() => undefined);
  }
  if (justCompleted && task.slaStatus === "BREACHED") {
    await logTaskSlaBreach(task, "COMPLETION").catch(() => undefined);
  }
  return task;
}

export async function bulkUpdateTasksForTenant(user: TenantUser, input: BulkTaskInput) {
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids.filter(Boolean))] : [];
  if (!ids.length) return { updated: [], skipped: 0 };

  const updated = [];
  for (const id of ids) {
    try {
      const task = await updateTaskForTenant(user, id, {
        status: input.status,
        ownerId: input.ownerId,
        dueAt: input.dueAt,
        reminderAt: input.reminderAt,
      });
      if (task) updated.push(task);
    } catch {
      // A guard (completion note required, blocked by an incomplete dependency, etc.)
      // rejected this one task -- skip it and keep processing the rest of the batch
      // rather than aborting the whole bulk action.
    }
  }
  return { updated: await hydrate(user, updated), skipped: ids.length - updated.length };
}

// Queue tasks are visible to any member of the queue's team regardless of recordAccess --
// browsing a shared team queue is a distinct, permitted action, not the same as "my own
// records" (isOwnerScoped's normal restriction, which stays untouched for every other read).
async function rawQueueTask(user: TenantUser, taskId: string) {
  if (!user.tenantId) return null;
  return queryOne<any>(
    `select ${TASK_COLUMNS} from "Task" where "tenantId" = $1 and id = $2 and "queueId" is not null limit 1`,
    [user.tenantId, taskId],
  );
}

export async function addTaskToQueueForTenant(user: TenantUser, taskId: string, queueId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await rawTask(user, taskId);
  if (!existing) throw new Error("TASK_NOT_FOUND");
  const team = await getTeamForTenant(user.tenantId, queueId);
  if (!team) throw new Error("QUEUE_NOT_FOUND");
  const now = new Date().toISOString();
  const ownerId = team.leadId || existing.ownerId;
  const task = await queryOne<any>(
    `update "Task" set "queueId" = $1, "queuedAt" = $2, "claimedBy" = null, "claimedAt" = null, "ownerId" = $3, "updatedAt" = $2
     where "tenantId" = $4 and id = $5 returning ${TASK_COLUMNS}`,
    [queueId, now, ownerId, user.tenantId, taskId],
  );
  if (!task) throw new Error("TASK_NOT_FOUND");
  await audit(user, "UPDATE", task.id, existing, task, buildDiff(existing, task));
  await emitTaskAutomation(user, "UPDATED", task);
  return task;
}

export async function claimTaskForTenant(user: TenantUser, taskId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await rawQueueTask(user, taskId);
  if (!existing) throw new Error("TASK_NOT_FOUND");
  if (existing.claimedBy) throw new Error("TASK_ALREADY_CLAIMED");
  const team = await getTeamForTenant(user.tenantId, existing.queueId);
  const isMember = await isQueueMember(user, existing.queueId);
  if (!isMember && !isQueueSupervisor(user, team)) throw new Error("FORBIDDEN");

  const now = new Date().toISOString();
  const task = await queryOne<any>(
    `update "Task" set "claimedBy" = $1, "claimedAt" = $2, "ownerId" = $1, "updatedAt" = $2
     where "tenantId" = $3 and id = $4 returning ${TASK_COLUMNS}`,
    [user.id, now, user.tenantId, taskId],
  );
  if (!task) throw new Error("TASK_NOT_FOUND");
  await audit(user, "UPDATE", task.id, existing, task, buildDiff(existing, task));
  await emitTaskAutomation(user, "UPDATED", task);
  return task;
}

export async function unclaimTaskForTenant(user: TenantUser, taskId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await rawQueueTask(user, taskId);
  if (!existing) throw new Error("TASK_NOT_FOUND");
  if (!existing.claimedBy) throw new Error("TASK_NOT_CLAIMED");
  const team = await getTeamForTenant(user.tenantId, existing.queueId);
  const isSelf = existing.claimedBy === user.id;
  if (!isSelf && !isQueueSupervisor(user, team)) throw new Error("FORBIDDEN");

  const now = new Date().toISOString();
  const ownerId = team?.leadId || existing.ownerId;
  const task = await queryOne<any>(
    `update "Task" set "claimedBy" = null, "claimedAt" = null, "ownerId" = $1, "updatedAt" = $2
     where "tenantId" = $3 and id = $4 returning ${TASK_COLUMNS}`,
    [ownerId, now, user.tenantId, taskId],
  );
  if (!task) throw new Error("TASK_NOT_FOUND");
  await audit(user, "UPDATE", task.id, existing, task, buildDiff(existing, task));
  await emitTaskAutomation(user, "UPDATED", task);
  return task;
}

// Supervisor-only: assigns a specific queued task to a specific teammate, as opposed to
// claimTaskForTenant (always self) or autoBalanceQueueForTenant (system-picked across all
// unclaimed tasks). The target must actually belong to the queue's team so reassignment
// can't be used to hand a task to an unrelated user by mistake.
export async function reassignQueueTaskForTenant(user: TenantUser, taskId: string, targetUserId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await rawQueueTask(user, taskId);
  if (!existing) throw new Error("TASK_NOT_FOUND");
  const team = await getTeamForTenant(user.tenantId, existing.queueId);
  if (!isQueueSupervisor(user, team)) throw new Error("FORBIDDEN");
  const targetIsMember = targetUserId === team?.leadId || (await isQueueMember({ id: targetUserId, tenantId: user.tenantId }, existing.queueId));
  if (!targetIsMember) throw new Error("TARGET_NOT_QUEUE_MEMBER");

  const now = new Date().toISOString();
  const task = await queryOne<any>(
    `update "Task" set "claimedBy" = $1, "claimedAt" = $2, "ownerId" = $1, "updatedAt" = $2
     where "tenantId" = $3 and id = $4 returning ${TASK_COLUMNS}`,
    [targetUserId, now, user.tenantId, taskId],
  );
  if (!task) throw new Error("TASK_NOT_FOUND");
  await audit(user, "UPDATE", task.id, existing, task, buildDiff(existing, task));
  await emitTaskAutomation(user, "UPDATED", task);
  return task;
}

export async function listQueueTasksForTenant(user: TenantUser, queueId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const team = await getTeamForTenant(user.tenantId, queueId);
  if (!team) throw new Error("QUEUE_NOT_FOUND");
  const isMember = await isQueueMember(user, queueId);
  if (!isMember && !isQueueSupervisor(user, team)) throw new Error("FORBIDDEN");

  const tasks = await query<any>(
    `select ${TASK_COLUMNS} from "Task"
     where "tenantId" = $1 and "queueId"::text = $2 and status not in ('COMPLETED', 'CANCELLED')
     order by ("claimedBy" is null) desc, "queuedAt" asc nulls last, "createdAt" asc
     limit 500`,
    [user.tenantId, queueId],
  );
  return hydrate(user, tasks);
}

// Workload balancing: distributes every currently-unclaimed task in a queue across that
// team's active members, oldest task first, always to whichever member currently has the
// fewest open tasks -- the same load-based comparison distribution-engine.ts already uses
// for Lead/Opportunity assignment (countOpenAssignments), applied to Task instead.
export async function autoBalanceQueueForTenant(user: TenantUser, queueId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const team = await getTeamForTenant(user.tenantId, queueId);
  if (!team) throw new Error("QUEUE_NOT_FOUND");
  if (!isQueueSupervisor(user, team)) throw new Error("FORBIDDEN");

  const members = await query<any>('select id from "User" where "tenantId" = $1 and "teamId"::text = $2', [user.tenantId, queueId]);
  const memberIds = members.map((member: any) => member.id);
  if (!memberIds.length) return { assigned: [], remainingUnclaimed: 0 };

  const unclaimedTasks = await query<any>(
    `select ${TASK_COLUMNS} from "Task"
     where "tenantId" = $1 and "queueId"::text = $2 and "claimedBy" is null and status not in ('COMPLETED', 'CANCELLED')
     order by "queuedAt" asc nulls last, "createdAt" asc`,
    [user.tenantId, queueId],
  );
  if (!unclaimedTasks.length) return { assigned: [], remainingUnclaimed: 0 };

  const openCountRows = await query<any>(
    `select "ownerId" from "Task" where "tenantId" = $1 and "ownerId" = any($2::text[]) and status not in ('COMPLETED', 'CANCELLED')`,
    [user.tenantId, memberIds],
  );
  const openCounts = new Map(memberIds.map((id: string) => [id, 0]));
  for (const row of openCountRows) openCounts.set(row.ownerId, (openCounts.get(row.ownerId) ?? 0) + 1);

  const now = new Date().toISOString();
  const assigned = [];
  for (const existing of unclaimedTasks) {
    const [nextMemberId] = [...openCounts.entries()].sort((a, b) => a[1] - b[1])[0];
    const task = await queryOne<any>(
      `update "Task" set "claimedBy" = $1, "claimedAt" = $2, "ownerId" = $1, "updatedAt" = $2
       where "tenantId" = $3 and id = $4 returning ${TASK_COLUMNS}`,
      [nextMemberId, now, user.tenantId, existing.id],
    );
    if (!task) continue;
    openCounts.set(nextMemberId, (openCounts.get(nextMemberId) ?? 0) + 1);
    await audit(user, "UPDATE", task.id, existing, task, buildDiff(existing, task));
    await emitTaskAutomation(user, "UPDATED", task);
    assigned.push(task);
  }
  return { assigned, remainingUnclaimed: unclaimedTasks.length - assigned.length };
}

export async function getQueueHealthForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  const isBroadSupervisor = permissions?.recordAccess === "ALL" || permissions?.recordAccess === "TEAM";

  const teams = await query<any>('select id, name, "leadId" from "Team" where "tenantId"::text = $1', [user.tenantId]);
  const visibleTeams = isBroadSupervisor ? teams : teams.filter((team: any) => team.leadId === user.id);
  if (!visibleTeams.length) return [];

  const teamIds = visibleTeams.map((team: any) => team.id);
  const tasks = await query<any>(
    `select "queueId", "claimedBy", "queuedAt", "createdAt", "slaStatus"
     from "Task" where "tenantId" = $1 and "queueId"::text = any($2::text[]) and status not in ('COMPLETED', 'CANCELLED')`,
    [user.tenantId, teamIds],
  );

  const now = Date.now();
  const statsByTeam = new Map(
    visibleTeams.map((team: any) => [
      String(team.id),
      { teamId: team.id, teamName: team.name, totalQueued: 0, unclaimed: 0, slaBreaches: 0, totalAgeMinutes: 0, oldestAgeMinutes: 0 },
    ]),
  );

  for (const task of tasks) {
    const stat = statsByTeam.get(String(task.queueId));
    if (!stat) continue;
    stat.totalQueued += 1;
    if (!task.claimedBy) stat.unclaimed += 1;
    if (task.slaStatus === "BREACHED") stat.slaBreaches += 1;
    const ageMinutes = (now - new Date(task.queuedAt || task.createdAt).getTime()) / 60000;
    stat.totalAgeMinutes += ageMinutes;
    stat.oldestAgeMinutes = Math.max(stat.oldestAgeMinutes, ageMinutes);
  }

  return [...statsByTeam.values()]
    .map(({ totalAgeMinutes, ...stat }) => ({
      ...stat,
      avgAgeMinutes: stat.totalQueued > 0 ? Math.round(totalAgeMinutes / stat.totalQueued) : 0,
      oldestAgeMinutes: Math.round(stat.oldestAgeMinutes),
    }))
    .sort((a, b) => b.unclaimed - a.unclaimed);
}

export async function replaceTaskChecklistForTenant(user: TenantUser, taskId: string, items: Array<{ title: string; isDone?: boolean }>) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await rawTask(user, taskId);
  if (!existing) throw new Error("TASK_NOT_FOUND");

  await execute('delete from "TaskChecklistItem" where "tenantId" = $1 and "taskId" = $2', [user.tenantId, taskId]);
  const now = new Date().toISOString();
  let order = 0;
  for (const item of items) {
    if (!item.title?.trim()) continue;
    order += 1;
    await execute(
      `insert into "TaskChecklistItem" (id, "tenantId", "taskId", "itemOrder", title, "isDone", "completedAt", "completedBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        randomUUID(),
        user.tenantId,
        taskId,
        order,
        item.title.trim(),
        item.isDone ?? false,
        item.isDone ? now : null,
        item.isDone ? user.id : null,
        now,
      ],
    );
  }
  return getTaskForTenant(user, taskId);
}

export async function toggleTaskChecklistItemForTenant(user: TenantUser, taskId: string, itemId: string, isDone: boolean) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "TaskChecklistItem"
     set "isDone" = $1, "completedAt" = $2, "completedBy" = $3, "updatedAt" = $4
     where "tenantId" = $5 and "taskId" = $6 and id = $7
     returning id`,
    [isDone, isDone ? now : null, isDone ? user.id : null, now, user.tenantId, taskId, itemId],
  );
  if (!updated) throw new Error("CHECKLIST_ITEM_NOT_FOUND");
  return getTaskForTenant(user, taskId);
}

// Replaces the full set of "blocked by" tasks for a Task. Self-reference is rejected by the
// DB check constraint; a lightweight reverse-edge check here catches the simplest two-task
// cycle (A blocks B while B already blocks A) without needing full graph traversal for what
// is expected to be a small, same-record dependency graph in practice.
export async function setTaskDependenciesForTenant(user: TenantUser, taskId: string, blockedByTaskIds: string[]) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await rawTask(user, taskId);
  if (!existing) throw new Error("TASK_NOT_FOUND");

  const uniqueIds = [...new Set(blockedByTaskIds.filter((id) => id && id !== taskId))];
  if (uniqueIds.length) {
    const reverse = await query<{ taskId: string }>(
      'select "taskId" from "TaskDependency" where "tenantId" = $1 and "taskId" = any($2::text[]) and "blockedByTaskId" = $3',
      [user.tenantId, uniqueIds, taskId],
    );
    if (reverse.length) throw new Error("TASK_DEPENDENCY_CYCLE");
  }

  await execute('delete from "TaskDependency" where "tenantId" = $1 and "taskId" = $2', [user.tenantId, taskId]);
  const now = new Date().toISOString();
  for (const blockedByTaskId of uniqueIds) {
    await execute(
      `insert into "TaskDependency" (id, "tenantId", "taskId", "blockedByTaskId", "createdBy", "createdAt")
       values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), user.tenantId, taskId, blockedByTaskId, user.id, now],
    );
  }
  return getTaskForTenant(user, taskId);
}

export async function deleteTaskForTenant(user: TenantUser, id: string) {
  const existing = await rawTask(user, id);
  if (!existing) return null;
  await execute('delete from "Task" where "tenantId" = $1 and id = $2', [user.tenantId, id]);
  await audit(user, "DELETE", id, existing, null, null);
  return existing;
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers due
// tasks across every tenant at once (per-task updates further down keep the ordinary
// query()/execute() path in this pass -- see plan doc's noted bounded scope for this category).
export async function processDueTaskReminders(now = new Date()) {
  const tasks = await queryAsSystem<any>(
    `select ${TASK_COLUMNS} from "Task"
     where status not in ('COMPLETED', 'CANCELLED') and "reminderAt" <= $1
     limit 100`,
    [now.toISOString()],
  );
  const processed = [];
  for (const task of tasks) {
    // reminderFiredAt is kept (unlike overdue's own emitted-flag) because
    // processTaskReminderEscalations needs to know when the clock for escalation started.
    const metadata = { ...(task.metadata ?? {}), reminderFiredAt: now.toISOString() };
    await execute('update "Task" set "reminderAt" = null, metadata = $1, "updatedAt" = $2 where id = $3', [metadata, now.toISOString(), task.id]);
    await emitTaskAutomation({ id: task.ownerId, tenantId: task.tenantId }, "REMINDER", task);
    // Reminders always notify the owner directly -- previously a reminder only fired an
    // automation event, so a tenant with no "notify_user" automation configured got no
    // notification of any kind. This delivers over the existing Postgres LISTEN/NOTIFY ->
    // SSE pipeline with no extra plumbing.
    if (task.ownerId) {
      await createUserNotification({
        tenantId: task.tenantId,
        userId: task.ownerId,
        title: "Task reminder",
        message: `Reminder: "${task.title}"${task.dueAt ? ` is due ${new Date(task.dueAt).toLocaleString()}` : ""}.`,
        data: { taskId: task.id, leadId: task.leadId, opportunityId: task.opportunityId },
        category: "TASKS",
      }).catch(() => undefined);
    }
    processed.push({ taskId: task.id });
  }
  return { processed };
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- same reasoning as processDueTaskReminders above.
export async function processTaskReminderEscalations(now = new Date()) {
  const tasks = await queryAsSystem<any>(
    `select ${TASK_COLUMNS} from "Task"
     where status not in ('COMPLETED', 'CANCELLED')
       and "escalateAfterMinutes" is not null
       and "escalateToUserId" is not null
       and coalesce(metadata->>'reminderFiredAt', '') <> ''
       and coalesce(metadata->>'escalationSentAt', '') = ''
     limit 100`,
  );
  const processed = [];
  for (const task of tasks) {
    const firedAt = new Date(task.metadata.reminderFiredAt).getTime();
    const dueAt = firedAt + Number(task.escalateAfterMinutes) * 60 * 1000;
    if (dueAt > now.getTime()) continue;

    const metadata = { ...(task.metadata ?? {}), escalationSentAt: now.toISOString() };
    await execute('update "Task" set metadata = $1, "updatedAt" = $2 where id = $3', [metadata, now.toISOString(), task.id]);
    await createUserNotification({
      tenantId: task.tenantId,
      userId: task.escalateToUserId,
      title: "Task reminder escalation",
      message: `"${task.title}" is still not complete since its reminder fired.`,
      data: { taskId: task.id, ownerId: task.ownerId, leadId: task.leadId, opportunityId: task.opportunityId },
      category: "TASKS",
    }).catch(() => undefined);
    processed.push({ taskId: task.id });
  }
  return { processed };
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- same reasoning as processDueTaskReminders above.
export async function processOverdueTaskAutomations(now = new Date()) {
  const tasks = await queryAsSystem<any>(
    `select ${TASK_COLUMNS} from "Task"
     where status not in ('COMPLETED', 'CANCELLED')
       and "dueAt" <= $1
       and coalesce(metadata->>'overdueAutomationEmittedAt', '') = ''
     limit 100`,
    [now.toISOString()],
  );
  const processed = [];
  for (const task of tasks) {
    const metadata = {
      ...(task.metadata ?? {}),
      overdueAutomationEmittedAt: now.toISOString(),
    };
    await execute('update "Task" set metadata = $1, "updatedAt" = $2 where id = $3', [metadata, now.toISOString(), task.id]);
    await emitTaskAutomation({ id: task.ownerId, tenantId: task.tenantId }, "OVERDUE", { ...task, metadata, overdue: true });
    processed.push({ taskId: task.id });
  }
  return { processed };
}

// Catches breaches updateTaskForTenant's real-time checks can't see: a task that silently
// blows past its target without anyone ever touching or completing it. Real-time detection
// (in updateTaskForTenant) fires the moment a user acts; this scan fires for tasks nobody
// acts on at all. slaStatus flips to BREACHED here too so a stale "PENDING" badge doesn't
// keep showing on a task that has, in fact, already missed its target.
// WP07 (F04): BACKGROUND_JOB, disposition B -- same reasoning as processDueTaskReminders above.
export async function processTaskSlaBreaches(now = new Date()) {
  const nowIso = now.toISOString();
  const firstActionMissed = await queryAsSystem<any>(
    `select ${TASK_COLUMNS} from "Task"
     where status not in ('COMPLETED', 'CANCELLED')
       and "firstActionAt" is null
       and "firstActionSlaTarget" is not null
       and "firstActionSlaTarget" <= $1
     limit 100`,
    [nowIso],
  );
  const processed = [];
  for (const task of firstActionMissed) {
    await logTaskSlaBreach(task, "FIRST_ACTION");
    processed.push({ taskId: task.id, breachType: "FIRST_ACTION" });
  }

  const overdueOpen = await queryAsSystem<any>(
    `select ${TASK_COLUMNS} from "Task"
     where status not in ('COMPLETED', 'CANCELLED')
       and "slaTarget" is not null
       and "slaTarget" <= $1
       and "slaStatus" is distinct from 'BREACHED'
     limit 100`,
    [nowIso],
  );
  for (const task of overdueOpen) {
    await execute('update "Task" set "slaStatus" = $1, "updatedAt" = $2 where id = $3', ["BREACHED", nowIso, task.id]);
    await logTaskSlaBreach(task, "COMPLETION");
    processed.push({ taskId: task.id, breachType: "COMPLETION" });
  }
  return { processed };
}

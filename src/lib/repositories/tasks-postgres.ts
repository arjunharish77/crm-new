import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";

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
  'id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "leadId", "opportunityId", "activityId", "dueAt", "reminderAt", "completedAt", "completedBy", metadata, "createdAt", "updatedAt"';

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
  const [users, leads, opportunities, activities] = await Promise.all([
    rowsByIds("User", "id, name, email", userIds),
    rowsByIds("Lead", "id, name, email, company", leadIds, user.tenantId),
    rowsByIds("Opportunity", "id, title, amount", opportunityIds, user.tenantId),
    rowsByIds("Activity", "id, notes, outcome", activityIds, user.tenantId),
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  const leadMap = new Map(leads.map((row) => [row.id, row]));
  const opportunityMap = new Map(opportunities.map((row) => [row.id, row]));
  const activityMap = new Map(activities.map((row) => [row.id, row]));
  return tasks.map((task) => ({
    ...task,
    owner: userMap.get(task.ownerId) ?? null,
    creator: userMap.get(task.createdBy) ?? null,
    lead: task.leadId ? leadMap.get(task.leadId) ?? null : null,
    opportunity: task.opportunityId ? opportunityMap.get(task.opportunityId) ?? null : null,
    activity: task.activityId ? activityMap.get(task.activityId) ?? null : null,
  }));
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
}

export async function createTaskForTenant(user: TenantUser, input: TaskInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!input.title?.trim()) throw new Error("TASK_TITLE_REQUIRED");
  const now = new Date().toISOString();
  const ownerId = input.ownerId || user.id;
  const task = await queryOne<any>(
    `insert into "Task" (id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "leadId", "opportunityId", "activityId", "dueAt", "reminderAt", "completedAt", "completedBy", metadata, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
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
      input.dueAt || null,
      input.reminderAt || null,
      input.status === "COMPLETED" ? now : null,
      input.status === "COMPLETED" ? user.id : null,
      input.metadata ?? {},
      now,
    ],
  );
  if (!task) throw new Error("TASK_INSERT_FAILED");
  await audit(user, "CREATE", task.id, null, task, null);
  await emitTaskAutomation(user, "CREATED", task);
  return task;
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
  if (!wasCompleted && nextStatus === "COMPLETED") {
    patch.completedAt = now;
    patch.completedBy = user.id;
  }
  if (wasCompleted && nextStatus !== "COMPLETED") {
    patch.completedAt = null;
    patch.completedBy = null;
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
  await emitTaskAutomation(user, !wasCompleted && nextStatus === "COMPLETED" ? "COMPLETED" : "UPDATED", task);
  return task;
}

export async function bulkUpdateTasksForTenant(user: TenantUser, input: BulkTaskInput) {
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids.filter(Boolean))] : [];
  if (!ids.length) return { updated: [], skipped: 0 };

  const updated = [];
  for (const id of ids) {
    const task = await updateTaskForTenant(user, id, {
      status: input.status,
      ownerId: input.ownerId,
      dueAt: input.dueAt,
      reminderAt: input.reminderAt,
    });
    if (task) updated.push(task);
  }
  return { updated: await hydrate(user, updated), skipped: ids.length - updated.length };
}

export async function deleteTaskForTenant(user: TenantUser, id: string) {
  const existing = await rawTask(user, id);
  if (!existing) return null;
  await execute('delete from "Task" where "tenantId" = $1 and id = $2', [user.tenantId, id]);
  await audit(user, "DELETE", id, existing, null, null);
  return existing;
}

export async function processDueTaskReminders(now = new Date()) {
  const tasks = await query<any>(
    `select ${TASK_COLUMNS} from "Task"
     where status not in ('COMPLETED', 'CANCELLED') and "reminderAt" <= $1
     limit 100`,
    [now.toISOString()],
  );
  const processed = [];
  for (const task of tasks) {
    await execute('update "Task" set "reminderAt" = null, "updatedAt" = $1 where id = $2', [now.toISOString(), task.id]);
    await emitTaskAutomation({ id: task.ownerId, tenantId: task.tenantId }, "REMINDER", task);
    processed.push({ taskId: task.id });
  }
  return { processed };
}

export async function processOverdueTaskAutomations(now = new Date()) {
  const tasks = await query<any>(
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

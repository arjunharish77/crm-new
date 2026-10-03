import * as pgTasks from "@/lib/repositories/tasks-postgres";

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
  recurrenceRule?: pgTasks.RecurrenceRule | null;
  seriesId?: string | null;
  escalateAfterMinutes?: number | null;
  escalateToUserId?: string | null;
  queueId?: string | null;
};

type TaskFilters = {
  status?: string | null;
  priority?: string | null;
  ownerId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  activityId?: string | null;
  due?: "overdue" | "today" | "upcoming" | "completed" | null;
  open?: boolean;
  q?: string | null;
};

export async function listTasksForTenant(user: TenantUser, filters: TaskFilters = {}) {
  return pgTasks.listTasksForTenant(user, filters);
}

export async function listTasksPageForTenant(user: TenantUser, filters: TaskFilters = {}, page = 1, limit = 25) {
  return pgTasks.listTasksPageForTenant(user, filters, page, limit);
}

export async function getTaskForTenant(user: TenantUser, id: string) {
  return pgTasks.getTaskForTenant(user, id);
}

export async function createTaskForTenant(user: TenantUser, input: TaskInput) {
  return pgTasks.createTaskForTenant(user, input);
}

export async function updateTaskForTenant(user: TenantUser, id: string, input: TaskInput) {
  return pgTasks.updateTaskForTenant(user, id, input);
}

export async function bulkUpdateTasksForTenant(user: TenantUser, input: pgTasks.BulkTaskInput) {
  return pgTasks.bulkUpdateTasksForTenant(user, input);
}

export async function deleteTaskForTenant(user: TenantUser, id: string) {
  return pgTasks.deleteTaskForTenant(user, id);
}

export async function replaceTaskChecklistForTenant(user: TenantUser, taskId: string, items: Array<{ title: string; isDone?: boolean }>) {
  return pgTasks.replaceTaskChecklistForTenant(user, taskId, items);
}

export async function toggleTaskChecklistItemForTenant(user: TenantUser, taskId: string, itemId: string, isDone: boolean) {
  return pgTasks.toggleTaskChecklistItemForTenant(user, taskId, itemId, isDone);
}

export async function setTaskDependenciesForTenant(user: TenantUser, taskId: string, blockedByTaskIds: string[]) {
  return pgTasks.setTaskDependenciesForTenant(user, taskId, blockedByTaskIds);
}

export async function processDueTaskReminders(now = new Date()) {
  return pgTasks.processDueTaskReminders(now);
}

export async function processOverdueTaskAutomations(now = new Date()) {
  return pgTasks.processOverdueTaskAutomations(now);
}

export async function processTaskReminderEscalations(now = new Date()) {
  return pgTasks.processTaskReminderEscalations(now);
}

export async function skipTaskOccurrenceForTenant(user: TenantUser, id: string) {
  return pgTasks.skipTaskOccurrenceForTenant(user, id);
}

export async function processTaskSlaBreaches(now = new Date()) {
  return pgTasks.processTaskSlaBreaches(now);
}

export async function addTaskToQueueForTenant(user: TenantUser, taskId: string, queueId: string) {
  return pgTasks.addTaskToQueueForTenant(user, taskId, queueId);
}

export async function claimTaskForTenant(user: TenantUser, taskId: string) {
  return pgTasks.claimTaskForTenant(user, taskId);
}

export async function unclaimTaskForTenant(user: TenantUser, taskId: string) {
  return pgTasks.unclaimTaskForTenant(user, taskId);
}

export async function reassignQueueTaskForTenant(user: TenantUser, taskId: string, targetUserId: string) {
  return pgTasks.reassignQueueTaskForTenant(user, taskId, targetUserId);
}

export async function listQueueTasksForTenant(user: TenantUser, queueId: string) {
  return pgTasks.listQueueTasksForTenant(user, queueId);
}

export async function autoBalanceQueueForTenant(user: TenantUser, queueId: string) {
  return pgTasks.autoBalanceQueueForTenant(user, queueId);
}

export async function getQueueHealthForTenant(user: TenantUser) {
  return pgTasks.getQueueHealthForTenant(user);
}

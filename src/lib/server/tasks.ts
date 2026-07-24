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

export async function listTasksForTenant(user: TenantUser, filters: TaskFilters = {}) {
  return pgTasks.listTasksForTenant(user, filters);
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

export async function deleteTaskForTenant(user: TenantUser, id: string) {
  return pgTasks.deleteTaskForTenant(user, id);
}

export async function processDueTaskReminders(now = new Date()) {
  return pgTasks.processDueTaskReminders(now);
}

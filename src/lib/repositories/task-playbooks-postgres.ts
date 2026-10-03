import { randomUUID } from "crypto";
import { execute, query, queryOne, jsonbParam, type Queryable } from "@/lib/db/query";
import { createTaskForTenant } from "@/lib/repositories/tasks-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

export type TaskPlaybookItemInput = {
  title: string;
  description?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueInDays?: number;
  assignToRecordOwner?: boolean;
};

export type TaskPlaybookInput = {
  name: string;
  description?: string | null;
  targetModule?: "LEAD" | "OPPORTUNITY" | "BOTH";
  isActive?: boolean;
  items: TaskPlaybookItemInput[];
};

const PLAYBOOK_COLUMNS = 'id, "tenantId", name, description, "targetModule", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt"';
const ITEM_COLUMNS = 'id, "tenantId", "playbookId", "itemOrder", title, description, priority, "dueInDays", "assignToRecordOwner", "createdAt", "updatedAt"';

function tenantWhere(user: TenantUser, startIndex = 1) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return { sql: `"tenantId" = $${startIndex}`, values: [user.tenantId] };
}

async function loadItems(tenantId: string, playbookId: string, client?: Queryable) {
  return query<any>(
    `select ${ITEM_COLUMNS} from "TaskPlaybookItem" where "tenantId" = $1 and "playbookId" = $2 order by "itemOrder" asc`,
    [tenantId, playbookId],
    client,
  );
}

export async function listTaskPlaybooksForTenant(user: TenantUser, filters: { targetModule?: string | null; activeOnly?: boolean } = {}) {
  const tenant = tenantWhere(user);
  const clauses = [tenant.sql];
  const values = [...tenant.values];
  if (filters.activeOnly) clauses.push('"isActive" = true');
  if (filters.targetModule) {
    values.push(filters.targetModule);
    clauses.push(`("targetModule" = $${values.length} or "targetModule" = 'BOTH')`);
  }
  const playbooks = await query<any>(
    `select ${PLAYBOOK_COLUMNS} from "TaskPlaybook" where ${clauses.join(" and ")} order by name asc`,
    values,
  );
  const itemCounts = await query<{ playbookId: string; count: number }>(
    `select "playbookId", count(*)::int as count from "TaskPlaybookItem" where "tenantId" = $1 group by "playbookId"`,
    [user.tenantId],
  );
  const countMap = new Map(itemCounts.map((row) => [row.playbookId, row.count]));
  return playbooks.map((playbook) => ({ ...playbook, itemCount: countMap.get(playbook.id) ?? 0 }));
}

export async function getTaskPlaybookForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 2);
  const playbook = await queryOne<any>(
    `select ${PLAYBOOK_COLUMNS} from "TaskPlaybook" where id = $1 and ${tenant.sql} limit 1`,
    [id, ...tenant.values],
  );
  if (!playbook) return null;
  const items = await loadItems(user.tenantId as string, id);
  return { ...playbook, items };
}

function normalizeItems(items: TaskPlaybookItemInput[]) {
  return items
    .filter((item) => item.title?.trim())
    .map((item, index) => ({
      itemOrder: index + 1,
      title: item.title.trim(),
      description: item.description || null,
      priority: item.priority ?? "MEDIUM",
      dueInDays: Number.isFinite(item.dueInDays) ? Math.max(0, Math.trunc(item.dueInDays as number)) : 1,
      assignToRecordOwner: item.assignToRecordOwner !== false,
    }));
}

async function replacePlaybookItems(tenantId: string, playbookId: string, items: TaskPlaybookItemInput[]) {
  await execute('delete from "TaskPlaybookItem" where "tenantId" = $1 and "playbookId" = $2', [tenantId, playbookId]);
  const normalized = normalizeItems(items);
  for (const item of normalized) {
    await execute(
      `insert into "TaskPlaybookItem" (id, "tenantId", "playbookId", "itemOrder", title, description, priority, "dueInDays", "assignToRecordOwner", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [randomUUID(), tenantId, playbookId, item.itemOrder, item.title, item.description, item.priority, item.dueInDays, item.assignToRecordOwner, new Date().toISOString()],
    );
  }
  return normalized.length;
}

export async function createTaskPlaybookForTenant(user: TenantUser, input: TaskPlaybookInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!input.name?.trim()) throw new Error("PLAYBOOK_NAME_REQUIRED");
  const now = new Date().toISOString();
  const playbook = await queryOne<any>(
    `insert into "TaskPlaybook" (id, "tenantId", name, description, "targetModule", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8)
     returning ${PLAYBOOK_COLUMNS}`,
    [randomUUID(), user.tenantId, input.name.trim(), input.description || null, input.targetModule ?? "BOTH", input.isActive !== false, user.id, now],
  );
  if (!playbook) throw new Error("PLAYBOOK_INSERT_FAILED");
  await replacePlaybookItems(user.tenantId, playbook.id, input.items ?? []);
  return getTaskPlaybookForTenant(user, playbook.id);
}

export async function updateTaskPlaybookForTenant(user: TenantUser, id: string, input: Partial<TaskPlaybookInput>) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await getTaskPlaybookForTenant(user, id);
  if (!existing) return null;

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: user.id };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("PLAYBOOK_NAME_REQUIRED");
    patch.name = input.name.trim();
  }
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.targetModule !== undefined) patch.targetModule = input.targetModule;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const columns = Object.keys(patch);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  values.push(user.tenantId, id);
  await execute(`update "TaskPlaybook" set ${assignments} where "tenantId" = $${values.length - 1} and id = $${values.length}`, values);

  if (input.items !== undefined) {
    await replacePlaybookItems(user.tenantId, id, input.items);
  }
  return getTaskPlaybookForTenant(user, id);
}

export async function deleteTaskPlaybookForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 2);
  const count = await execute(`delete from "TaskPlaybook" where id = $1 and ${tenant.sql}`, [id, ...tenant.values]);
  return count > 0;
}

async function resolveRecordOwnerId(tenantId: string, leadId: string | null, opportunityId: string | null) {
  if (opportunityId) {
    const opportunity = await queryOne<{ ownerId: string | null }>(
      'select "ownerId" from "Opportunity" where "tenantId" = $1 and id = $2 limit 1',
      [tenantId, opportunityId],
    );
    if (opportunity?.ownerId) return opportunity.ownerId;
  }
  if (leadId) {
    const lead = await queryOne<{ ownerId: string | null }>('select "ownerId" from "Lead" where "tenantId" = $1 and id = $2 limit 1', [tenantId, leadId]);
    if (lead?.ownerId) return lead.ownerId;
  }
  return null;
}

// Creates one real Task per playbook item for the given Lead/Opportunity, via the normal
// createTaskForTenant path (so each task still gets its own audit log entry and fires the
// usual TASK_CREATED_ON_LEAD/_ON_OPPORTUNITY automation events), then records one
// TaskPlaybookApplication row linking the playbook to the tasks it just created.
export async function applyTaskPlaybookForTenant(
  user: TenantUser,
  playbookId: string,
  input: { leadId?: string | null; opportunityId?: string | null; source?: "MANUAL" | "AUTOMATION" },
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const leadId = input.leadId ?? null;
  const opportunityId = input.opportunityId ?? null;
  if (!leadId && !opportunityId) throw new Error("LEAD_OR_OPPORTUNITY_REQUIRED");

  const playbook = await getTaskPlaybookForTenant(user, playbookId);
  if (!playbook) throw new Error("PLAYBOOK_NOT_FOUND");
  if (!playbook.isActive) throw new Error("PLAYBOOK_INACTIVE");
  if (!playbook.items.length) throw new Error("PLAYBOOK_HAS_NO_ITEMS");

  const recordOwnerId = await resolveRecordOwnerId(user.tenantId, leadId, opportunityId);
  const now = Date.now();
  const createdTasks = [];
  for (const item of playbook.items) {
    const dueAt = new Date(now + item.dueInDays * 24 * 60 * 60 * 1000).toISOString();
    const task = await createTaskForTenant(user, {
      title: item.title,
      description: item.description,
      priority: item.priority,
      ownerId: item.assignToRecordOwner && recordOwnerId ? recordOwnerId : undefined,
      leadId,
      opportunityId,
      dueAt,
      metadata: { source: "TASK_PLAYBOOK", playbookId: playbook.id, playbookItemId: item.id },
    });
    createdTasks.push(task);
  }

  const application = await queryOne<any>(
    `insert into "TaskPlaybookApplication" (id, "tenantId", "playbookId", "leadId", "opportunityId", "taskIds", "appliedBy", source, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      randomUUID(),
      user.tenantId,
      playbook.id,
      leadId,
      opportunityId,
      jsonbParam(createdTasks.map((task) => task.id)),
      user.id,
      input.source ?? "MANUAL",
      new Date().toISOString(),
    ],
  );

  return { application, tasks: createdTasks };
}

export async function listTaskPlaybookApplicationsForRecord(
  user: TenantUser,
  input: { leadId?: string | null; opportunityId?: string | null },
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const leadId = input.leadId ?? null;
  const opportunityId = input.opportunityId ?? null;
  if (!leadId && !opportunityId) return [];

  const values: unknown[] = [user.tenantId];
  const orClauses: string[] = [];
  if (leadId) {
    values.push(leadId);
    orClauses.push(`app."leadId" = $${values.length}`);
  }
  if (opportunityId) {
    values.push(opportunityId);
    orClauses.push(`app."opportunityId" = $${values.length}`);
  }
  return query<any>(
    `select app.*, pb.name as "playbookName"
     from "TaskPlaybookApplication" app
     left join "TaskPlaybook" pb on pb.id = app."playbookId"
     where app."tenantId" = $1 and (${orClauses.join(" or ")})
     order by app."createdAt" desc
     limit 50`,
    values,
  );
}

// Where a playbook has been used (UI/UX plan deferred item): how often, how recently, by hand or
// by automation, and the latest applications with their record and how many of the tasks they
// created are done. For the playbook's settings page (admins).
export async function getTaskPlaybookUsageForTenant(user: TenantUser, playbookId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const playbook = await queryOne<{ id: string; name: string }>(
    `select id, name from "TaskPlaybook" where "tenantId" = $1 and id = $2`,
    [user.tenantId, playbookId],
  );
  if (!playbook) throw new Error("PLAYBOOK_NOT_FOUND");
  const summary = await queryOne<{ total: number; last30: number; manual: number; automatic: number; lastAppliedAt: string | null }>(
    `select count(*)::int as total,
            count(*) filter (where "createdAt" >= now() - interval '30 days')::int as last30,
            count(*) filter (where source = 'MANUAL')::int as manual,
            count(*) filter (where source <> 'MANUAL')::int as automatic,
            max("createdAt") as "lastAppliedAt"
     from "TaskPlaybookApplication" where "tenantId" = $1 and "playbookId" = $2`,
    [user.tenantId, playbookId],
  );
  const recent = await query<any>(
    `select app.id, app."createdAt" as "appliedAt", app.source, app."leadId", app."opportunityId",
            l.name as "leadName", o.title as "opportunityTitle", coalesce(u.name, u.email) as "appliedByName",
            jsonb_array_length(app."taskIds")::int as "taskCount",
            (select count(*)::int from "Task" t
              where t."tenantId" = app."tenantId" and t.id in (select jsonb_array_elements_text(app."taskIds")) and t.status = 'COMPLETED') as "completedCount"
     from "TaskPlaybookApplication" app
     left join "Lead" l on l.id = app."leadId" and l."tenantId" = app."tenantId"
     left join "Opportunity" o on o.id = app."opportunityId" and o."tenantId" = app."tenantId"
     left join "User" u on u.id = app."appliedBy"
     where app."tenantId" = $1 and app."playbookId" = $2
     order by app."createdAt" desc
     limit 20`,
    [user.tenantId, playbookId],
  );
  return { playbook, ...(summary ?? { total: 0, last30: 0, manual: 0, automatic: 0, lastAppliedAt: null }), recent };
}

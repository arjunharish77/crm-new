import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

export type TaskSlaPolicyInput = {
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  firstActionMinutes?: number | null;
  completionMinutes?: number | null;
  isActive?: boolean;
};

const POLICY_COLUMNS = 'id, "tenantId", priority, "firstActionMinutes", "completionMinutes", "isActive", "createdAt", "updatedAt"';

function tenantWhere(user: TenantUser, startIndex = 1) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return { sql: `"tenantId" = $${startIndex}`, values: [user.tenantId] };
}

export async function listTaskSlaPoliciesForTenant(user: TenantUser) {
  const tenant = tenantWhere(user);
  return query<any>(`select ${POLICY_COLUMNS} from "TaskSlaPolicy" where ${tenant.sql} order by priority asc`, tenant.values);
}

export async function getActiveTaskSlaPolicyForPriority(tenantId: string, priority: string) {
  return queryOne<any>(
    'select * from "TaskSlaPolicy" where "tenantId" = $1 and priority = $2 and "isActive" = true limit 1',
    [tenantId, priority],
  );
}

// One row per priority level (unique tenantId+priority) -- upsert-by-natural-key, matching
// the CommunicationTemplate convention, rather than requiring the caller to know a row id.
export async function upsertTaskSlaPolicyForTenant(user: TenantUser, input: TaskSlaPolicyInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "TaskSlaPolicy" (id, "tenantId", priority, "firstActionMinutes", "completionMinutes", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8)
     on conflict ("tenantId", priority) do update set
       "firstActionMinutes" = excluded."firstActionMinutes",
       "completionMinutes" = excluded."completionMinutes",
       "isActive" = excluded."isActive",
       "updatedBy" = excluded."updatedBy",
       "updatedAt" = excluded."updatedAt"
     returning ${POLICY_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      input.priority,
      input.firstActionMinutes ?? null,
      input.completionMinutes ?? null,
      input.isActive !== false,
      user.id,
      now,
    ],
  );
}

export async function deleteTaskSlaPolicyForTenant(user: TenantUser, priority: string) {
  const tenant = tenantWhere(user, 2);
  const count = await execute(`delete from "TaskSlaPolicy" where priority = $1 and ${tenant.sql}`, [priority, ...tenant.values]);
  return count > 0;
}

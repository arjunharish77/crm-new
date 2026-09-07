import { randomUUID } from "crypto";
import { queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

export type RecordShareType = "LEAD" | "OPPORTUNITY";

export type RecordShareInput = {
  sharedUserIds?: string[];
  sharedTeamIds?: string[];
};

const RECORD_SHARE_COLUMNS = 'id, "tenantId", "recordType", "recordId", "sharedUserIds", "sharedTeamIds", "createdBy", "updatedBy", "createdAt", "updatedAt"';

// One row per (tenant, recordType, recordId) -- upsert-by-natural-key, matching the
// TaskSlaPolicy convention, rather than requiring the caller to know a row id. Shared,
// generic across both Lead and Opportunity so buildLeadWhere/buildWhere's identical
// enforcement clause has exactly one table to check.
export async function getRecordShareForTenant(user: TenantUser, recordType: RecordShareType, recordId: string) {
  if (!user.tenantId) return null;
  return queryOne<any>(
    `select ${RECORD_SHARE_COLUMNS} from "RecordShare" where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3 limit 1`,
    [user.tenantId, recordType, recordId],
  );
}

export async function upsertRecordShareForTenant(user: TenantUser, recordType: RecordShareType, recordId: string, input: RecordShareInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const now = new Date().toISOString();
  const sharedUserIds = Array.isArray(input.sharedUserIds) ? [...new Set(input.sharedUserIds.filter(Boolean))] : [];
  const sharedTeamIds = Array.isArray(input.sharedTeamIds) ? [...new Set(input.sharedTeamIds.filter(Boolean))] : [];
  return queryOne<any>(
    `insert into "RecordShare" (id, "tenantId", "recordType", "recordId", "sharedUserIds", "sharedTeamIds", "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8)
     on conflict ("tenantId", "recordType", "recordId") do update set
       "sharedUserIds" = excluded."sharedUserIds",
       "sharedTeamIds" = excluded."sharedTeamIds",
       "updatedBy" = excluded."updatedBy",
       "updatedAt" = excluded."updatedAt"
     returning ${RECORD_SHARE_COLUMNS}`,
    [randomUUID(), user.tenantId, recordType, recordId, sharedUserIds, sharedTeamIds, user.id, now],
  );
}

import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import * as pgLeads from "@/lib/repositories/leads-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

type LeadFilterCondition = {
  field?: string;
  operator?: string;
  value?: unknown;
};

type LeadFilterInput =
  | LeadFilterCondition
  | {
      logic?: "AND" | "OR";
      conditions?: LeadFilterCondition[];
    };

type LeadListInput = {
  name?: string;
  description?: string | null;
  type?: "STATIC" | "SMART";
  filters?: LeadFilterInput[] | null;
  leadIds?: string[];
};

const LEAD_LIST_COLUMNS = 'id, name, description, type, filters, "isActive", "createdAt", "updatedAt", "createdBy"';
const LEAD_COLUMNS = 'id, name, email, phone, company, source, status, score, tags, "createdAt", "updatedAt", "ownerId"';

function tenantClause(user: TenantUser, values: unknown[]) {
  if (!user.tenantId) return '"tenantId" is null';
  values.push(String(user.tenantId));
  return `"tenantId"::text = $${values.length}`;
}

function normalizeLeadListFilters(filters: unknown): LeadFilterInput[] {
  if (Array.isArray(filters)) return filters as LeadFilterInput[];
  if (filters && typeof filters === "object" && Array.isArray((filters as any).conditions)) {
    return [filters as LeadFilterInput];
  }
  return [];
}

async function countLeadsForTenant(user: TenantUser, filters: LeadFilterInput[] | null = null) {
  const result = await pgLeads.listLeadsForTenant(user, 1, 1, filters);
  return result.meta.total;
}

export async function listLeadListsForTenant(user: TenantUser) {
  const values: unknown[] = [];
  const lists = await query<any>(
    `select ${LEAD_LIST_COLUMNS}
     from "LeadList"
     where ${tenantClause(user, values)}
     order by "updatedAt" desc`,
    values,
  );

  const staticListIds = lists.filter((list) => list.type === "STATIC").map((list) => list.id);
  const memberCounts = new Map<string, number>();
  if (staticListIds.length > 0) {
    const memberValues: unknown[] = [staticListIds];
    const members = await query<{ listId: string; leadId: string }>(
      `select "listId", "leadId"
       from "LeadListMember"
       where "listId"::text = any($1::text[]) and ${tenantClause(user, memberValues)}`,
      [staticListIds.map(String), ...memberValues.slice(1)],
    );
    for (const member of members) {
      memberCounts.set(member.listId, (memberCounts.get(member.listId) ?? 0) + 1);
    }
  }

  const smartCountPairs = await Promise.all(
    lists
      .filter((list) => list.type === "SMART")
      .map(async (list) => [list.id, await countLeadsForTenant(user, normalizeLeadListFilters(list.filters))] as const),
  );
  const smartCounts = new Map<string, number>(smartCountPairs);

  return lists.map((list) => ({
    ...list,
    count: list.type === "SMART" ? smartCounts.get(list.id) ?? 0 : memberCounts.get(list.id) ?? 0,
  }));
}

export async function createLeadListForTenant(user: TenantUser, input: LeadListInput) {
  const now = new Date().toISOString();
  const type = input.type === "SMART" ? "SMART" : "STATIC";
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("LEAD_LIST_NAME_REQUIRED");

  const list = await queryOne<any>(
    `insert into "LeadList" (
       id, "tenantId", name, description, type, filters, "isActive", "createdBy", "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4, $5, $6, true, $7, $8, $8)
     returning ${LEAD_LIST_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      name,
      input.description ? String(input.description) : null,
      type,
      type === "SMART" ? JSON.stringify(normalizeLeadListFilters(input.filters)) : null,
      user.id,
      now,
    ],
  );
  if (!list) throw new Error("LEAD_LIST_CREATE_FAILED");

  const leadIds = Array.isArray(input.leadIds) ? [...new Set(input.leadIds)] : [];
  if (type === "STATIC" && leadIds.length > 0) {
    await insertLeadListMembers(user, list.id, leadIds, now);
  }

  return { ...list, count: leadIds.length };
}

export async function getLeadListForTenant(user: TenantUser, id: string) {
  const values: unknown[] = [id];
  const list = await queryOne<any>(
    `select ${LEAD_LIST_COLUMNS}
     from "LeadList"
     where id::text = $1 and ${tenantClause(user, values)}
     limit 1`,
    [String(id), ...values.slice(1)],
  );
  if (!list) return null;

  if (list.type === "SMART") {
    const leads = await pgLeads.listLeadsForTenant(user, 1, 500, normalizeLeadListFilters(list.filters));
    return { ...list, leads: leads.data, count: leads.meta.total };
  }

  const memberValues: unknown[] = [id];
  const members = await query<{ leadId: string }>(
    `select "leadId"
     from "LeadListMember"
     where "listId"::text = $1 and ${tenantClause(user, memberValues)}
     order by "createdAt" desc`,
    [String(id), ...memberValues.slice(1)],
  );
  const leadIds = members.map((member) => member.leadId);
  if (leadIds.length === 0) return { ...list, leads: [], count: 0 };

  const leadValues: unknown[] = [leadIds];
  const leads = await query<any>(
    `select ${LEAD_COLUMNS}
     from "Lead"
     where id::text = any($1::text[]) and ${tenantClause(user, leadValues)}`,
    [leadIds.map(String), ...leadValues.slice(1)],
  );
  const leadsById = new Map(leads.map((lead) => [lead.id, { ...lead, assignedUserId: lead.ownerId ?? null }]));
  return { ...list, leads: leadIds.map((leadId) => leadsById.get(leadId)).filter(Boolean), count: leadIds.length };
}

async function insertLeadListMembers(user: TenantUser, listId: string, leadIds: string[], now = new Date().toISOString()) {
  if (leadIds.length === 0) return;
  const values: unknown[] = [];
  const tuples = leadIds.map((leadId) => {
    values.push(randomUUID(), user.tenantId, listId, leadId, user.id, now);
    const base = values.length - 5;
    return `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  await execute(
    `insert into "LeadListMember" (id, "tenantId", "listId", "leadId", "addedBy", "createdAt")
     values ${tuples.join(", ")}
     on conflict ("tenantId", "listId", "leadId") do nothing`,
    values,
  );
}

export async function addLeadsToLeadListForTenant(user: TenantUser, id: string, leadIds: string[]) {
  const list = await getLeadListForTenant(user, id);
  if (!list) throw new Error("LEAD_LIST_NOT_FOUND");
  if (list.type !== "STATIC") throw new Error("SMART_LIST_MEMBERSHIP_IS_FILTER_BASED");

  const uniqueLeadIds = [...new Set(leadIds)];
  if (uniqueLeadIds.length === 0) return { ...list, addedLeadIds: [] };

  const existingValues: unknown[] = [id, uniqueLeadIds];
  const existingMembers = await query<{ leadId: string }>(
    `select "leadId"
     from "LeadListMember"
     where "listId"::text = $1 and "leadId"::text = any($2::text[]) and ${tenantClause(user, existingValues)}`,
    [String(id), uniqueLeadIds.map(String), ...existingValues.slice(2)],
  );
  const existingLeadIds = new Set(existingMembers.map((member) => member.leadId));
  const newLeadIds = uniqueLeadIds.filter((leadId) => !existingLeadIds.has(leadId));
  await insertLeadListMembers(user, id, newLeadIds);

  const updated = await getLeadListForTenant(user, id);
  return { ...updated, addedLeadIds: newLeadIds };
}

export async function removeLeadFromLeadListForTenant(user: TenantUser, id: string, leadId: string) {
  const values: unknown[] = [id, leadId];
  await execute(
    `delete from "LeadListMember"
     where "listId"::text = $1 and "leadId"::text = $2 and ${tenantClause(user, values)}`,
    [String(id), String(leadId), ...values.slice(2)],
  );
}

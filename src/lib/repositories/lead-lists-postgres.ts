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
       where "listId" = any($1::uuid[]) and ${tenantClause(user, memberValues)}`,
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

  const memberValues: unknown[] = [list.id];
  const members = await query<{ leadId: string }>(
    `select "leadId"
     from "LeadListMember"
     where "listId" = $1::uuid and ${tenantClause(user, memberValues)}
     order by "createdAt" desc`,
    [String(list.id), ...memberValues.slice(1)],
  );
  const leadIds = members.map((member) => member.leadId);
  if (leadIds.length === 0) return { ...list, leads: [], count: 0, hiddenCount: 0 };

  // Only leads this user may see (record scope); the rest are counted, not shown.
  const visible = await pgLeads.filterVisibleLeadIds(user, leadIds);
  const visibleIds = leadIds.filter((leadId) => visible.has(String(leadId)));
  const leadValues: unknown[] = [visibleIds];
  const leads = visibleIds.length
    ? await query<any>(
        `select ${LEAD_COLUMNS}
         from "Lead"
         where id::text = any($1::text[]) and ${tenantClause(user, leadValues)}`,
        [visibleIds.map(String), ...leadValues.slice(1)],
      )
    : [];
  const leadsById = new Map(leads.map((lead) => [lead.id, { ...lead, assignedUserId: lead.ownerId ?? null }]));
  return { ...list, leads: visibleIds.map((leadId) => leadsById.get(leadId)).filter(Boolean), count: leadIds.length, hiddenCount: leadIds.length - visibleIds.length };
}

// One page of a list's leads for the list page (Section 8 #4: a static list loaded every member,
// and a smart list its first 500, then searched and paged in the browser). Search and paging run
// on the server with the same record access as the leads list. For a static list, `count` is all
// its members and `hiddenCount` those this person can't see; `total` is what matches the search.
export async function getLeadListPageForTenant(
  user: TenantUser,
  id: string,
  options: { page?: number; limit?: number; search?: string | null } = {},
) {
  const values: unknown[] = [id];
  const list = await queryOne<any>(
    `select ${LEAD_LIST_COLUMNS}
     from "LeadList"
     where id::text = $1 and ${tenantClause(user, values)}
     limit 1`,
    [String(id), ...values.slice(1)],
  );
  if (!list) return null;
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit) || 25)));
  const search = typeof options.search === "string" ? options.search.trim() : "";

  if (list.type === "SMART") {
    const filters = normalizeLeadListFilters(list.filters);
    const [result, all] = await Promise.all([
      pgLeads.listLeadsForTenant(user, page, limit, filters, { search }),
      search ? pgLeads.listLeadsForTenant(user, 1, 1, filters) : null,
    ]);
    return { ...list, leads: result.data, total: result.meta.total, count: all ? all.meta.total : result.meta.total, hiddenCount: 0, page, limit };
  }

  // Static: the visible members (the leads list's own where clause, limited to this list's
  // members), newest addition first.
  // Member lookups use the list's own id (a real uuid) so the listId index is used (round-2 plan B3).
  const memberValues: unknown[] = [String(list.id)];
  const memberTenant = tenantClause(user, memberValues);
  const totalMembers = await queryOne<{ count: number }>(
    `select count(*)::int as count from "LeadListMember" where "listId" = $1::uuid and ${memberTenant}`,
    memberValues,
  );
  const inList = (where: { sql: string; values: unknown[] }) => {
    const listParam = where.values.length + 1;
    const tenantValues: unknown[] = [];
    const tenantSql = user.tenantId ? `m."tenantId"::text = $${listParam + 1}` : `m."tenantId" is null`;
    if (user.tenantId) tenantValues.push(String(user.tenantId));
    const member = `from "LeadListMember" m where m."listId" = $${listParam}::uuid and ${tenantSql} and m."leadId" = "Lead".id`;
    return {
      sql: `${where.sql ? `${where.sql} and` : "where"} exists (select 1 ${member})`,
      order: `(select max(m."createdAt") ${member}) desc, "Lead".id`,
      values: [...where.values, String(list.id), ...tenantValues],
    };
  };
  const visibleWhere = inList(pgLeads.buildLeadWhere(user, null));
  const matchWhere = inList(pgLeads.applyLeadSearch(pgLeads.buildLeadWhere(user, null), search));
  const [visible, matching, rows] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Lead" ${visibleWhere.sql}`, visibleWhere.values),
    queryOne<{ count: number }>(`select count(*)::int as count from "Lead" ${matchWhere.sql}`, matchWhere.values),
    query<any>(
      `select ${LEAD_COLUMNS} from "Lead" ${matchWhere.sql} order by ${matchWhere.order}
       limit $${matchWhere.values.length + 1} offset $${matchWhere.values.length + 2}`,
      [...matchWhere.values, limit, (page - 1) * limit],
    ),
  ]);
  const count = totalMembers?.count ?? 0;
  return {
    ...list,
    leads: rows.map((lead) => ({ ...lead, assignedUserId: lead.ownerId ?? null })),
    total: matching?.count ?? 0,
    count,
    hiddenCount: Math.max(0, count - (visible?.count ?? 0)),
    page,
    limit,
  };
}

// A list as a campaign or journey audience: a smart list's filters, or a static list's members
// (§8 #24; the audience used to be getLeadListForTenant's first 500 leads). Null when the list is
// gone.
export async function leadAudienceForList(user: TenantUser, id: string): Promise<pgLeads.LeadAudienceQuery | null> {
  const values: unknown[] = [id];
  const list = await queryOne<any>(
    `select id, type, filters from "LeadList" where id::text = $1 and ${tenantClause(user, values)} limit 1`,
    [String(id), ...values.slice(1)],
  );
  if (!list) return null;
  return list.type === "SMART" ? { filters: normalizeLeadListFilters(list.filters) as any } : { staticListId: String(list.id) };
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
  // The first page only (it used to load every member twice just to check the list's type).
  const list = await getLeadListPageForTenant(user, id);
  if (!list) throw new Error("LEAD_LIST_NOT_FOUND");
  if (list.type !== "STATIC") throw new Error("SMART_LIST_MEMBERSHIP_IS_FILTER_BASED");

  const uniqueLeadIds = [...new Set(leadIds)];
  if (uniqueLeadIds.length === 0) return { ...list, addedLeadIds: [] };
  // Only leads this user may see can be added (they used to be taken on trust, even from
  // another workspace).
  const visible = await pgLeads.filterVisibleLeadIds(user, uniqueLeadIds);
  if (uniqueLeadIds.some((leadId) => !visible.has(String(leadId)))) throw new Error("LEADS_NOT_VISIBLE");

  const existingValues: unknown[] = [id, uniqueLeadIds];
  const existingMembers = await query<{ leadId: string }>(
    `select "leadId"
     from "LeadListMember"
     where "listId" = $1::uuid and "leadId" = any($2::text[]) and ${tenantClause(user, existingValues)}`,
    [String(list.id), uniqueLeadIds.map(String), ...existingValues.slice(2)],
  );
  const existingLeadIds = new Set(existingMembers.map((member) => member.leadId));
  const newLeadIds = uniqueLeadIds.filter((leadId) => !existingLeadIds.has(leadId));
  await insertLeadListMembers(user, id, newLeadIds);

  const updated = await getLeadListPageForTenant(user, id);
  return { ...updated, addedLeadIds: newLeadIds };
}

export async function removeLeadFromLeadListForTenant(user: TenantUser, id: string, leadId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) return;
  const values: unknown[] = [id, leadId];
  await execute(
    `delete from "LeadListMember"
     where "listId" = $1::uuid and "leadId" = $2 and ${tenantClause(user, values)}`,
    [String(id), String(leadId), ...values.slice(2)],
  );
}

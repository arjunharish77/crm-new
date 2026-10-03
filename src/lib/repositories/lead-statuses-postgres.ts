import { randomUUID } from "crypto";
import { execute, query, queryOne, type Queryable } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";

// Tenant-configurable lead statuses (UI/UX plan decision 6; migration 0124). "Lead.status" stores
// the key; the label, tone and order are display; the category (OPEN, CONVERTED, LOST) is what
// the rest of the app uses to decide whether a lead is closed (crm_lead_status_category in SQL).

export type LeadStatusCategory = "OPEN" | "CONVERTED" | "LOST";
export type LeadStatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";
export type LeadStatusDefinition = {
  id: string;
  key: string;
  label: string;
  tone: LeadStatusTone;
  category: LeadStatusCategory;
  order: number;
  isActive: boolean;
  leadCount?: number;
};

type TenantUser = { id: string; tenantId: string | null };

const CATEGORIES: LeadStatusCategory[] = ["OPEN", "CONVERTED", "LOST"];
const TONES: LeadStatusTone[] = ["success", "warning", "danger", "info", "neutral", "accent"];
const COLUMNS = 'id, key, label, tone, category, "order", "isActive"';

export const DEFAULT_LEAD_STATUSES: Array<Omit<LeadStatusDefinition, "id" | "isActive">> = [
  { key: "NEW", label: "New", tone: "info", category: "OPEN", order: 10 },
  { key: "CONTACTED", label: "Contacted", tone: "info", category: "OPEN", order: 20 },
  { key: "QUALIFIED", label: "Qualified", tone: "accent", category: "OPEN", order: 30 },
  { key: "CONVERTED", label: "Converted", tone: "success", category: "CONVERTED", order: 40 },
  { key: "LOST", label: "Lost", tone: "danger", category: "LOST", order: 50 },
];

// Same normalisation as the SQL crm_lead_status_key: "Follow up" -> "FOLLOW_UP".
export function leadStatusKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function requireTenant(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

export async function seedDefaultLeadStatuses(tenantId: string, client?: Queryable) {
  for (const status of DEFAULT_LEAD_STATUSES) {
    await execute(
      `insert into "LeadStatusDefinition" (id, "tenantId", key, label, tone, category, "order")
       values ($1, $2, $3, $4, $5, $6, $7) on conflict ("tenantId", key) do nothing`,
      [randomUUID(), tenantId, status.key, status.label, status.tone, status.category, status.order],
      client,
    );
  }
}

export async function listLeadStatusesForTenant(user: TenantUser, options: { includeInactive?: boolean; withCounts?: boolean } = {}): Promise<LeadStatusDefinition[]> {
  const tenantId = requireTenant(user);
  const rows = await query<LeadStatusDefinition>(
    `select ${COLUMNS}${options.withCounts ? `, (select count(*)::int from "Lead" l where l."tenantId" = d."tenantId" and l."mergedIntoId" is null and crm_lead_status_key(l.status) = d.key) as "leadCount"` : ""}
     from "LeadStatusDefinition" d
     where d."tenantId" = $1 ${options.includeInactive ? "" : 'and d."isActive"'}
     order by d."order", d.label`,
    [tenantId],
  );
  if (rows.length) return rows;
  // A tenant created before this feature without rows yet: show the defaults (and create them,
  // so they can be edited).
  await seedDefaultLeadStatuses(tenantId);
  return query<LeadStatusDefinition>(`select ${COLUMNS} from "LeadStatusDefinition" d where d."tenantId" = $1 order by d."order"`, [tenantId]);
}

// The key to store for a requested status: matched by key or by label (case-insensitive),
// among active statuses, or the current value when it isn't changing. Empty means the first
// Open status. A tenant without any definitions keeps the old free-text behaviour.
export async function resolveLeadStatusForWrite(tenantId: string | null, requested: unknown, current?: string | null, client?: Queryable): Promise<string> {
  const text = typeof requested === "string" ? requested.trim() : requested == null ? "" : String(requested);
  if (!tenantId) return text || current || "NEW";
  const definitions = await query<{ key: string; label: string; category: string; isActive: boolean }>(
    `select key, label, category, "isActive" from "LeadStatusDefinition" where "tenantId" = $1 order by "order", label`,
    [tenantId],
    client,
  );
  if (!definitions.length) return text || current || "NEW";
  if (!text) return definitions.find((item) => item.isActive && item.category === "OPEN")?.key ?? definitions[0].key;
  const key = leadStatusKey(text);
  if (current && leadStatusKey(current) === key) return current;
  const match = definitions.find((item) => item.isActive && (item.key === key || item.label.toLowerCase() === text.toLowerCase()));
  if (!match) throw new Error("LEAD_STATUS_UNKNOWN");
  return match.key;
}

function validate(input: Record<string, unknown>, partial: boolean) {
  const out: Partial<LeadStatusDefinition> = {};
  if (input.label !== undefined || !partial) {
    const label = String(input.label ?? "").trim();
    if (!label || label.length > 60) throw new Error("LEAD_STATUS_LABEL_INVALID");
    out.label = label;
  }
  if (input.tone !== undefined) {
    if (!TONES.includes(input.tone as LeadStatusTone)) throw new Error("LEAD_STATUS_TONE_INVALID");
    out.tone = input.tone as LeadStatusTone;
  }
  if (input.category !== undefined || !partial) {
    if (!CATEGORIES.includes(input.category as LeadStatusCategory)) throw new Error("LEAD_STATUS_CATEGORY_INVALID");
    out.category = input.category as LeadStatusCategory;
  }
  if (input.isActive !== undefined) out.isActive = input.isActive === true;
  return out;
}

export async function createLeadStatusForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenant(user);
  const fields = validate(input, false);
  const key = leadStatusKey(input.key ?? fields.label);
  if (!/^[A-Z0-9][A-Z0-9_]{0,59}$/.test(key)) throw new Error("LEAD_STATUS_LABEL_INVALID");
  return withTransaction(user, async (client) => {
    const exists = await queryOne(`select 1 from "LeadStatusDefinition" where "tenantId" = $1 and (key = $2 or lower(label) = lower($3))`, [tenantId, key, fields.label], client);
    if (exists) throw new Error("LEAD_STATUS_DUPLICATE");
    const next = await queryOne<{ order: number }>(`select coalesce(max("order"), 0) + 10 as "order" from "LeadStatusDefinition" where "tenantId" = $1`, [tenantId], client);
    return queryOne<LeadStatusDefinition>(
      `insert into "LeadStatusDefinition" (id, "tenantId", key, label, tone, category, "order") values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
      [randomUUID(), tenantId, key, fields.label, fields.tone ?? "neutral", fields.category, next?.order ?? 10],
      client,
    );
  });
}

export async function updateLeadStatusForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenant(user);
  const fields = validate(input, true);
  return withTransaction(user, async (client) => {
    const current = await queryOne<LeadStatusDefinition>(`select ${COLUMNS} from "LeadStatusDefinition" where "tenantId" = $1 and id = $2 for update`, [tenantId, id], client);
    if (!current) throw new Error("LEAD_STATUS_NOT_FOUND");
    if (fields.label && fields.label.toLowerCase() !== current.label.toLowerCase()) {
      const taken = await queryOne(`select 1 from "LeadStatusDefinition" where "tenantId" = $1 and id <> $2 and lower(label) = lower($3)`, [tenantId, id, fields.label], client);
      if (taken) throw new Error("LEAD_STATUS_DUPLICATE");
    }
    // Every tenant keeps at least one active Open status, so new leads always have one.
    const losesOpen = current.category === "OPEN" && current.isActive && ((fields.category && fields.category !== "OPEN") || fields.isActive === false);
    if (losesOpen) {
      const others = await queryOne<{ n: number }>(`select count(*)::int as n from "LeadStatusDefinition" where "tenantId" = $1 and id <> $2 and category = 'OPEN' and "isActive"`, [tenantId, id], client);
      if (!others?.n) throw new Error("LEAD_STATUS_LAST_OPEN");
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of Object.entries(fields)) {
      values.push(value);
      sets.push(`"${column}" = $${values.length}`);
    }
    if (!sets.length) return current;
    values.push(tenantId, id);
    return queryOne<LeadStatusDefinition>(
      `update "LeadStatusDefinition" set ${sets.join(", ")}, "updatedAt" = now() where "tenantId" = $${values.length - 1} and id = $${values.length} returning ${COLUMNS}`,
      values,
      client,
    );
  });
}

export async function reorderLeadStatusesForTenant(user: TenantUser, ids: string[]) {
  const tenantId = requireTenant(user);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error("LEAD_STATUS_ORDER_INVALID");
  return withTransaction(user, async (client) => {
    const existing = await query<{ id: string }>(`select id from "LeadStatusDefinition" where "tenantId" = $1`, [tenantId], client);
    if (existing.length !== ids.length || !existing.every((row) => ids.includes(row.id))) throw new Error("LEAD_STATUS_ORDER_INVALID");
    for (const [index, id] of ids.entries()) {
      await execute(`update "LeadStatusDefinition" set "order" = $1, "updatedAt" = now() where "tenantId" = $2 and id = $3`, [(index + 1) * 10, tenantId, id], client);
    }
    return query<LeadStatusDefinition>(`select ${COLUMNS} from "LeadStatusDefinition" where "tenantId" = $1 order by "order"`, [tenantId], client);
  });
}

// Deleting is only for a status no lead uses; otherwise turn it off (it stays on those leads
// and in history, but can't be chosen) or move its leads first.
export async function deleteLeadStatusForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenant(user);
  return withTransaction(user, async (client) => {
    const current = await queryOne<LeadStatusDefinition>(`select ${COLUMNS} from "LeadStatusDefinition" where "tenantId" = $1 and id = $2 for update`, [tenantId, id], client);
    if (!current) throw new Error("LEAD_STATUS_NOT_FOUND");
    const used = await queryOne<{ n: number }>(`select count(*)::int as n from "Lead" where "tenantId" = $1 and crm_lead_status_key(status) = $2`, [tenantId, current.key], client);
    if (used?.n) throw new Error("LEAD_STATUS_IN_USE");
    if (current.category === "OPEN" && current.isActive) {
      const others = await queryOne<{ n: number }>(`select count(*)::int as n from "LeadStatusDefinition" where "tenantId" = $1 and id <> $2 and category = 'OPEN' and "isActive"`, [tenantId, id], client);
      if (!others?.n) throw new Error("LEAD_STATUS_LAST_OPEN");
    }
    await execute(`delete from "LeadStatusDefinition" where "tenantId" = $1 and id = $2`, [tenantId, id], client);
    return { deleted: true };
  });
}

import { randomUUID } from "crypto";
import { createAuditLog, automationConditionMatches } from "@/lib/server/crm";
import { getPayoutVisiblePartnerUserIds } from "@/lib/server/partner-access";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
};

export type CommissionRuleInput = {
  name: string;
  partnerId?: string | null;
  opportunityTypeId?: string | null;
  conditions?: Record<string, unknown>;
  ruleType: "FLAT" | "PERCENTAGE";
  value: number;
  priority?: number;
  isActive?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

const UPDATABLE_FIELDS = [
  "name",
  "partnerId",
  "opportunityTypeId",
  "conditions",
  "ruleType",
  "value",
  "priority",
  "isActive",
  "effectiveFrom",
  "effectiveTo",
] as const;

export async function listCommissionRulesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];

  return query<any>(
    `select id, "tenantId", name, "partnerId", "opportunityTypeId", conditions, "ruleType", value, priority,
            "isActive", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt"
     from "CommissionRule"
     where "tenantId" = $1
     order by priority desc, "createdAt" desc`,
    [user.tenantId],
  );
}

export async function createCommissionRuleForTenant(user: TenantUser, input: CommissionRuleInput) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `insert into "CommissionRule"
      (id, "tenantId", name, "partnerId", "opportunityTypeId", conditions, "ruleType", value,
       priority, "isActive", "effectiveFrom", "effectiveTo", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
     returning id, "tenantId", name, "partnerId", "opportunityTypeId", conditions, "ruleType", value,
               priority, "isActive", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      input.name,
      input.partnerId || null,
      input.opportunityTypeId || null,
      input.conditions ?? {},
      input.ruleType,
      input.value,
      input.priority ?? 0,
      input.isActive ?? true,
      input.effectiveFrom || null,
      input.effectiveTo || null,
      user.id,
      now,
    ],
  );
  if (!data) throw new Error("COMMISSION_RULE_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "COMMISSION_RULE", data.id, null, data, null);
  return data;
}

export async function updateCommissionRuleForTenant(
  user: TenantUser,
  id: string,
  input: Partial<CommissionRuleInput>
) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const existing = await queryOne<any>(
    `select id, "tenantId", name, "partnerId", "opportunityTypeId", conditions, "ruleType", value, priority,
            "isActive", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt"
     from "CommissionRule"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, id],
  );
  if (!existing) return null;

  const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of UPDATABLE_FIELDS) {
    if (input[key] !== undefined) {
      updatePayload[key] = input[key];
    }
  }

  const columns = Object.keys(updatePayload);
  const values = columns.map((column) => updatePayload[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await queryOne<any>(
    `update "CommissionRule"
     set ${assignments}
     where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2}
     returning id, "tenantId", name, "partnerId", "opportunityTypeId", conditions, "ruleType", value,
               priority, "isActive", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt"`,
    [...values, user.tenantId, id],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "COMMISSION_RULE", data.id, existing, data, null);
  return data;
}

export async function deleteCommissionRuleForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const existing = await queryOne<any>(
    `select id, "tenantId", name, "partnerId", "opportunityTypeId", conditions, "ruleType", value, priority,
            "isActive", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt"
     from "CommissionRule"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, id],
  );
  if (!existing) return null;

  await execute('delete from "CommissionRule" where "tenantId" = $1 and id = $2', [user.tenantId, id]);
  await createAuditLog(user as any, "DELETE", "COMMISSION_RULE", id, existing, null, null);
  return existing;
}

// Priority-ordered, first-match-wins resolution — same pattern as
// distribution-engine.ts's distributeRecord. partnerId/opportunityTypeId scoping
// plus field-based `conditions` (reusing the exact automation condition-matching
// engine) subsumes the earlier GLOBAL/PARTNER/PRODUCT/PARTNER_PRODUCT scope concept:
// a rule with no partnerId matches any partner, no opportunityTypeId matches any
// product, and empty conditions matches unconditionally. "Tiers" are just multiple
// rules with an amount-range condition, ordered by priority.
export async function resolveCommissionRule(
  tenantId: string,
  params: { partnerId: string; opportunityTypeId?: string | null; record: Record<string, unknown> },
  asOfDate: Date = new Date()
) {
  const rules = await query<any>(
    `select id, "tenantId", name, "partnerId", "opportunityTypeId", conditions, "ruleType", value, priority,
            "isActive", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt"
     from "CommissionRule"
     where "tenantId" = $1 and "isActive" = true
     order by priority desc, "createdAt" desc`,
    [tenantId],
  );

  for (const rule of rules) {
    if (rule.partnerId && rule.partnerId !== params.partnerId) continue;
    if (rule.opportunityTypeId && params.opportunityTypeId && rule.opportunityTypeId !== params.opportunityTypeId) continue;
    if (rule.opportunityTypeId && !params.opportunityTypeId) continue;
    if (rule.effectiveFrom && asOfDate < new Date(rule.effectiveFrom)) continue;
    if (rule.effectiveTo && asOfDate > new Date(rule.effectiveTo)) continue;
    if (!automationConditionMatches(params.record, (rule.conditions ?? {}) as Record<string, unknown>)) continue;
    return rule;
  }

  return null;
}

export function calculateCommissionAmount(rule: { ruleType: string; value: number }, baseAmount: number) {
  if (rule.ruleType === "FLAT") {
    return rule.value;
  }
  if (rule.ruleType === "PERCENTAGE") {
    return Math.round(baseAmount * rule.value) / 100;
  }
  throw new Error(`UNKNOWN_RULE_TYPE: ${rule.ruleType}`);
}

export type CommissionLedgerEntryInput = {
  partnerId: string;
  opportunityId?: string | null;
  commissionRuleId?: string | null;
  entryType: "EARNED" | "CORRECTION_CREDIT" | "CORRECTION_DEBIT";
  baseAmount?: number | null;
  commissionAmount: number;
  calculationSnapshot?: Record<string, unknown> | null;
  triggerEvent?: string | null;
  correctsEntryId?: string | null;
  createdAt?: string | null;
};

// Append-only — there is deliberately no update/delete export here. Corrections are
// new CORRECTION_CREDIT/CORRECTION_DEBIT rows via correctsEntryId, never edits. A DB
// trigger (migrations/0003_commission_ledger.sql) enforces this at the Postgres layer
// too, since the service-role client bypasses RLS but not triggers.
export async function writeCommissionLedgerEntry(user: TenantUser, input: CommissionLedgerEntryInput) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const data = await queryOne<any>(
    `insert into "CommissionLedger"
      (id, "tenantId", "partnerId", "opportunityId", "commissionRuleId", "entryType", "baseAmount",
       "commissionAmount", "calculationSnapshot", "triggerEvent", "correctsEntryId", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning id, "tenantId", "partnerId", "opportunityId", "commissionRuleId", "entryType", "baseAmount",
               "commissionAmount", "calculationSnapshot", "triggerEvent", "correctsEntryId", "createdAt", "createdBy"`,
    [
      randomUUID(),
      user.tenantId,
      input.partnerId,
      input.opportunityId || null,
      input.commissionRuleId || null,
      input.entryType,
      input.baseAmount ?? null,
      input.commissionAmount,
      input.calculationSnapshot ?? null,
      input.triggerEvent || null,
      input.correctsEntryId || null,
      user.id,
      input.createdAt || new Date().toISOString(),
    ],
  );
  if (!data) throw new Error("COMMISSION_LEDGER_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "COMMISSION_LEDGER", data.id, null, data, null);
  return data;
}

export async function listCommissionLedgerForPartner(user: TenantUser, partnerId: string) {
  if (!user.tenantId) return [];
  const visiblePartnerUserIds = user.isTenantAdmin || user.isPlatformAdmin
    ? [partnerId]
    : await getPayoutVisiblePartnerUserIds(user);
  if (!visiblePartnerUserIds.includes(partnerId)) return [];

  return query<any>(
    `select id, "tenantId", "partnerId", "opportunityId", "commissionRuleId", "entryType", "baseAmount",
            "commissionAmount", "calculationSnapshot", "triggerEvent", "correctsEntryId", "createdAt", "createdBy"
     from "CommissionLedger"
     where "tenantId" = $1 and "partnerId" = any($2::text[])
     order by "createdAt" desc`,
    [user.tenantId, visiblePartnerUserIds],
  );
}

// Core trigger-time flow, called from the "calculate_commission" automation action
// node: resolve the opportunity's owning partner, resolve the matching CommissionRule,
// calculate the amount, and write an EARNED ledger entry. A no-op (returns null) if the
// owner isn't an active partner or no rule matches — the expected, common case for
// opportunities owned by internal reps.
export async function calculateAndRecordCommissionForOpportunity(
  user: TenantUser,
  opportunity: Record<string, any>,
  triggerEvent: string
) {
  if (!user.tenantId || !opportunity?.ownerId) return null;

  const partnerProfile = await queryOne<any>(
    `select id, "userId", status
     from "PartnerProfile"
     where "tenantId" = $1 and "userId" = $2
     limit 1`,
    [user.tenantId, opportunity.ownerId],
  );
  if (!partnerProfile || partnerProfile.status !== "ACTIVE") return null;

  const rule = await resolveCommissionRule(user.tenantId, {
    partnerId: opportunity.ownerId,
    opportunityTypeId: opportunity.opportunityTypeId ?? null,
    record: opportunity,
  });

  if (!rule) return null;

  const baseAmount = Number(opportunity.amount ?? 0);
  const commissionAmount = calculateCommissionAmount(rule, baseAmount);

  return writeCommissionLedgerEntry(user, {
    partnerId: opportunity.ownerId,
    opportunityId: opportunity.id,
    commissionRuleId: rule.id,
    entryType: "EARNED",
    baseAmount,
    commissionAmount,
    calculationSnapshot: { rule, baseAmount },
    triggerEvent,
  });
}

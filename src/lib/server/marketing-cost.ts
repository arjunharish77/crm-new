import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";

type TenantUser = { id: string; tenantId: string | null };

export type CostEntryInput = {
  scopeType: "JOURNEY" | "CAMPAIGN" | "CHANNEL";
  scopeId?: string | null;
  channel?: "EMAIL" | "WHATSAPP" | "SMS" | null;
  costType: "PLANNED_BUDGET" | "ACTUAL_SPEND" | "PER_SEND_RATE";
  amount: number;
  currency?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  notes?: string | null;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

export async function listCostEntriesForTenant(user: TenantUser, scopeType?: string, scopeId?: string) {
  const tenantId = requireTenantId(user);
  const conditions = ['"tenantId" = $1'];
  const values: unknown[] = [tenantId];
  if (scopeType) {
    values.push(scopeType);
    conditions.push(`"scopeType" = $${values.length}`);
  }
  if (scopeId) {
    values.push(scopeId);
    conditions.push(`"scopeId" = $${values.length}`);
  }
  return query<any>(
    `select id, "tenantId", "scopeType", "scopeId", channel, "costType", amount, currency, "periodStart", "periodEnd", notes, "createdAt"
     from "MarketingCostEntry" where ${conditions.join(" and ")} order by "createdAt" desc`,
    values,
  );
}

export async function createCostEntryForTenant(user: TenantUser, input: CostEntryInput) {
  const tenantId = requireTenantId(user);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) throw new Error("COST_ENTRY_AMOUNT_REQUIRED");
  const row = await queryOne<any>(
    `insert into "MarketingCostEntry"
      (id, "tenantId", "scopeType", "scopeId", channel, "costType", amount, currency, "periodStart", "periodEnd", notes, "createdBy", "createdAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning id, "tenantId", "scopeType", "scopeId", channel, "costType", amount, currency, "periodStart", "periodEnd", notes, "createdAt"`,
    [
      randomUUID(),
      tenantId,
      input.scopeType,
      input.scopeId || null,
      input.channel || null,
      input.costType,
      amount,
      input.currency || "USD",
      input.periodStart || null,
      input.periodEnd || null,
      input.notes || null,
      user.id,
      new Date().toISOString(),
    ],
  );
  if (!row) throw new Error("COST_ENTRY_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "MARKETING_COST_ENTRY", row.id, null, row, {}).catch(() => undefined);
  return row;
}

export async function deleteCostEntryForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await execute(`delete from "MarketingCostEntry" where "tenantId" = $1 and id = $2`, [tenantId, id]);
}

// Campaign/journey ROI (item 15). Cost is whatever ACTUAL_SPEND rows exist for the scope
// (falling back to PLANNED_BUDGET when no actual spend has been logged yet); revenue is the
// sum of Won Opportunity amounts among records that have an attribution touch crediting this
// scope's journey/campaign. Deliberately NOT payout/commission-integrated -- Opportunity.amount
// is the revenue figure used, not a downstream commission calculation -- a documented scope
// simplification, not an oversight.
export async function getScopeCostSummary(user: TenantUser, scopeType: "JOURNEY" | "CAMPAIGN", scopeId: string) {
  const tenantId = requireTenantId(user);
  const spend = await queryOne<{ total: number }>(
    `select coalesce(sum(amount), 0)::float as total from "MarketingCostEntry"
     where "tenantId" = $1 and "scopeType" = $2 and "scopeId" = $3 and "costType" = 'ACTUAL_SPEND'`,
    [tenantId, scopeType, scopeId],
  );
  const budget = await queryOne<{ total: number }>(
    `select coalesce(sum(amount), 0)::float as total from "MarketingCostEntry"
     where "tenantId" = $1 and "scopeType" = $2 and "scopeId" = $3 and "costType" = 'PLANNED_BUDGET'`,
    [tenantId, scopeType, scopeId],
  );
  const actualSpend = Number(spend?.total ?? 0);
  const plannedBudget = Number(budget?.total ?? 0);
  const costBasis = actualSpend > 0 ? actualSpend : plannedBudget;

  // Journey sends have no single sourceId to look up by (see the throttle-key note in
  // communications.ts's marketingDeliveryDeferral) -- send counts here are only computed for
  // CAMPAIGN scope, where sourceId is a real, direct lookup key.
  const sendCounts =
    scopeType === "CAMPAIGN"
      ? await queryOne<{ sent: number; failed: number }>(
          `select count(*) filter (where status = 'SENT')::int as sent, count(*) filter (where status = 'FAILED')::int as failed
           from "CommunicationOutbox" where "tenantId" = $1 and "sourceType" = 'MARKETING_CAMPAIGN' and "sourceId" = $2`,
          [tenantId, scopeId],
        )
      : null;

  // Revenue attribution only works for JOURNEY scope -- MarketingAttributionTouch links to a
  // journeyId directly, but only carries a free-text `campaign` label (no campaignId FK), so
  // there's no reliable touch-to-campaign join to compute attributed revenue for CAMPAIGN scope.
  // Opportunity has no `status` column -- won/lost is determined via its stage's isWon flag.
  const revenue =
    scopeType === "JOURNEY"
      ? await queryOne<{ total: number; count: number }>(
          `select coalesce(sum(o.amount), 0)::float as total, count(distinct o.id)::int as count
           from "MarketingAttributionTouch" t
           join "Opportunity" o on o.id = t."recordId" and t."recordType" = 'OPPORTUNITY'
           join "OpportunityStage" s on s.id = o."stageId"
           where t."tenantId" = $1 and t."journeyId" = $2 and s."isWon" = true`,
          [tenantId, scopeId],
        )
      : null;

  const attributedRevenue = revenue ? Number(revenue.total ?? 0) : null;
  const wonOpportunities = revenue ? Number(revenue.count ?? 0) : null;
  const roi = costBasis > 0 && attributedRevenue !== null ? (attributedRevenue - costBasis) / costBasis : null;

  const sent = Number(sendCounts?.sent ?? 0);
  return {
    scopeType,
    scopeId,
    actualSpend,
    plannedBudget,
    costBasis,
    sent,
    failed: Number(sendCounts?.failed ?? 0),
    attributedRevenue,
    wonOpportunities,
    costPerSend: costBasis > 0 && sent > 0 ? costBasis / sent : null,
    roi,
  };
}

import { randomUUID } from "crypto";
import { createAuditLog } from "@/lib/server/crm";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { getPayoutVisiblePartnerUserIds } from "@/lib/server/partner-access";
import { getPartnerPayoutSettingsForTenant } from "@/lib/server/payouts";
import { query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
};

const DISPUTE_COLUMNS = `id, "tenantId", "payoutId", "partnerId", reason, status, "resolutionNotes",
            "resolvedBy", "resolvedAt", "createdAt", "updatedAt"`;

// Partner-facing "raise a dispute" CTA -- the concrete landing spot for a partner who
// thinks a payout amount is wrong, referenced from the payout transparency work.
export async function createPayoutDispute(user: TenantUser, payoutId: string, reason: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "payoutsEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  if (!reason?.trim()) throw new Error("DISPUTE_REASON_REQUIRED");

  const payout = await queryOne<any>(`select id, "tenantId", "partnerId" from "Payout" where "tenantId" = $1 and id = $2 limit 1`, [
    user.tenantId,
    payoutId,
  ]);
  if (!payout) return null;

  if (!user.isTenantAdmin && !user.isPlatformAdmin) {
    const settings = await getPartnerPayoutSettingsForTenant(user);
    const visibleIds = await getPayoutVisiblePartnerUserIds(user, settings);
    if (!visibleIds.includes(payout.partnerId)) throw new Error("PAYOUT_NOT_VISIBLE_FOR_USER");
  }

  const now = new Date().toISOString();
  const dispute = await queryOne<any>(
    `insert into "PayoutDispute" (id, "tenantId", "payoutId", "partnerId", reason, status, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'OPEN', $6, $6)
     returning ${DISPUTE_COLUMNS}`,
    [randomUUID(), user.tenantId, payoutId, payout.partnerId, reason.trim(), now],
  );
  if (!dispute) throw new Error("PAYOUT_DISPUTE_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "PAYOUT_DISPUTE", dispute.id, null, dispute, null);
  return dispute;
}

export async function listPayoutDisputesForPayout(user: TenantUser, payoutId: string) {
  if (!user.tenantId) return [];
  await assertFeatureEnabled(user.tenantId, "payoutsEnabled", { isPlatformAdmin: user.isPlatformAdmin });

  const payout = await queryOne<any>(`select id, "tenantId", "partnerId" from "Payout" where "tenantId" = $1 and id = $2 limit 1`, [
    user.tenantId,
    payoutId,
  ]);
  if (!payout) return [];

  if (!user.isTenantAdmin && !user.isPlatformAdmin) {
    const settings = await getPartnerPayoutSettingsForTenant(user);
    const visibleIds = await getPayoutVisiblePartnerUserIds(user, settings);
    if (!visibleIds.includes(payout.partnerId)) throw new Error("PAYOUT_NOT_VISIBLE_FOR_USER");
  }

  return query<any>(
    `select ${DISPUTE_COLUMNS} from "PayoutDispute" where "tenantId" = $1 and "payoutId" = $2 order by "createdAt" desc`,
    [user.tenantId, payoutId],
  );
}

export async function listPayoutDisputesForTenant(user: TenantUser, status?: string) {
  if (!user.tenantId) return [];
  await assertFeatureEnabled(user.tenantId, "payoutsEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const disputes = await query<any>(
    status
      ? `select ${DISPUTE_COLUMNS} from "PayoutDispute" where "tenantId" = $1 and status = $2 order by "createdAt" desc`
      : `select ${DISPUTE_COLUMNS} from "PayoutDispute" where "tenantId" = $1 order by "createdAt" desc`,
    status ? [user.tenantId, status] : [user.tenantId],
  );
  if (!disputes.length) return [];
  const partnerIds = [...new Set(disputes.map((d: any) => d.partnerId))];
  const partners = await query<any>('select id, name, email from "User" where "tenantId" = $1 and id = any($2::text[])', [
    user.tenantId,
    partnerIds,
  ]);
  const partnerMap = new Map(partners.map((row) => [row.id, row]));
  return disputes.map((dispute: any) => ({ ...dispute, partner: partnerMap.get(dispute.partnerId) ?? null }));
}

export async function resolvePayoutDispute(
  user: TenantUser,
  id: string,
  input: { status: "RESOLVED" | "DISMISSED"; resolutionNotes?: string | null }
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "payoutsEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  if (!user.isTenantAdmin && !user.isPlatformAdmin) throw new Error("FORBIDDEN");

  const existing = await queryOne<any>(`select ${DISPUTE_COLUMNS} from "PayoutDispute" where "tenantId" = $1 and id = $2 limit 1`, [
    user.tenantId,
    id,
  ]);
  if (!existing) return null;
  if (existing.status !== "OPEN") throw new Error("DISPUTE_ALREADY_RESOLVED");

  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `update "PayoutDispute"
     set status = $1, "resolutionNotes" = $2, "resolvedBy" = $3, "resolvedAt" = $4, "updatedAt" = $4
     where "tenantId" = $5 and id = $6
     returning ${DISPUTE_COLUMNS}`,
    [input.status, input.resolutionNotes || null, user.id, now, user.tenantId, id],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "PAYOUT_DISPUTE", id, existing, data, { status: { before: existing.status, after: input.status } });
  return data;
}

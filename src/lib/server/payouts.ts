import { randomUUID } from "crypto";
import { createAuditLog } from "@/lib/server/crm";
import { writeCommissionLedgerEntry } from "@/lib/server/commission";
import {
  canAccessPayoutModule,
  getPayoutVisiblePartnerUserIds,
  resolvePartnerRollupTargets,
  type PartnerVisibilityConfig,
} from "@/lib/server/partner-access";
import { query, queryOne } from "@/lib/db/query";
import { formatTenantDate, getTenantTimeZone } from "@/lib/server/date-format";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

export type PartnerPayoutSettingsInput = {
  cycleFrequency: "MONTHLY" | "BIWEEKLY" | "CUSTOM_DAYS";
  customIntervalDays?: number | null;
  cycleAnchorDay?: number;
  defaultHsnSacCode?: string | null;
  companyLegalName?: string | null;
  companyGstin?: string | null;
  companyAddress?: Record<string, unknown> | null;
  companyState?: string | null;
  gstRatePercent?: number;
  invoiceNumberPattern?: string;
  minimumPayoutAmount?: number;
  approvalMode?: "MANUAL" | "AUTO_BELOW_THRESHOLD";
  autoApproveBelowAmount?: number | null;
  requireInvoiceBeforePayment?: boolean;
  allowPartnerSelfInvoice?: boolean;
  adjustmentReasons?: unknown[];
  holdReasons?: unknown[];
  payoutVisibilityConfig?: PartnerVisibilityConfig | null;
};

export async function getPartnerPayoutSettingsForTenant(user: TenantUser) {
  if (!user.tenantId) return null;

  return queryOne<any>(
    `select id, "tenantId", "cycleFrequency", "customIntervalDays", "cycleAnchorDay", "defaultHsnSacCode",
            "companyLegalName", "companyGstin", "companyAddress", "companyState", "gstRatePercent",
            "invoiceNumberPattern", "minimumPayoutAmount", "approvalMode", "autoApproveBelowAmount",
            "requireInvoiceBeforePayment", "allowPartnerSelfInvoice", "adjustmentReasons", "holdReasons",
            "payoutVisibilityConfig", "createdAt", "updatedAt"
     from "PartnerPayoutSettings"
     where "tenantId" = $1
     limit 1`,
    [user.tenantId],
  );
}

export async function upsertPartnerPayoutSettingsForTenant(user: TenantUser, input: PartnerPayoutSettingsInput) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const existing = await getPartnerPayoutSettingsForTenant(user);
  const now = new Date().toISOString();

  const payload = {
    cycleFrequency: input.cycleFrequency,
    customIntervalDays: input.customIntervalDays ?? null,
    cycleAnchorDay: input.cycleAnchorDay ?? 1,
    defaultHsnSacCode: input.defaultHsnSacCode || null,
    companyLegalName: input.companyLegalName || null,
    companyGstin: input.companyGstin || null,
    companyAddress: input.companyAddress || null,
    companyState: input.companyState || null,
    gstRatePercent: input.gstRatePercent ?? 18,
    invoiceNumberPattern: input.invoiceNumberPattern || "{prefix}-{counter}",
    minimumPayoutAmount: input.minimumPayoutAmount ?? 0,
    approvalMode: input.approvalMode ?? "MANUAL",
    autoApproveBelowAmount: input.autoApproveBelowAmount ?? null,
    requireInvoiceBeforePayment: input.requireInvoiceBeforePayment ?? true,
    allowPartnerSelfInvoice: input.allowPartnerSelfInvoice ?? true,
    adjustmentReasons: Array.isArray(input.adjustmentReasons) ? input.adjustmentReasons : [],
    holdReasons: Array.isArray(input.holdReasons) ? input.holdReasons : [],
    payoutVisibilityConfig: normalizePayoutVisibilityConfig(input.payoutVisibilityConfig),
    updatedBy: user.id,
    updatedAt: now,
  };

  if (existing) {
    const data = await queryOne<any>(
      `update "PartnerPayoutSettings"
       set "cycleFrequency" = $1, "customIntervalDays" = $2, "cycleAnchorDay" = $3, "defaultHsnSacCode" = $4,
           "companyLegalName" = $5, "companyGstin" = $6, "companyAddress" = $7, "companyState" = $8,
           "gstRatePercent" = $9, "invoiceNumberPattern" = $10, "minimumPayoutAmount" = $11,
           "approvalMode" = $12, "autoApproveBelowAmount" = $13, "requireInvoiceBeforePayment" = $14,
           "allowPartnerSelfInvoice" = $15, "adjustmentReasons" = $16, "holdReasons" = $17,
           "payoutVisibilityConfig" = $18, "updatedBy" = $19, "updatedAt" = $20
       where "tenantId" = $21
       returning id, "tenantId", "cycleFrequency", "customIntervalDays", "cycleAnchorDay", "defaultHsnSacCode",
                 "companyLegalName", "companyGstin", "companyAddress", "companyState", "gstRatePercent",
                 "invoiceNumberPattern", "minimumPayoutAmount", "approvalMode", "autoApproveBelowAmount",
                 "requireInvoiceBeforePayment", "allowPartnerSelfInvoice", "adjustmentReasons", "holdReasons",
                 "payoutVisibilityConfig", "createdAt", "updatedAt"`,
      [
        payload.cycleFrequency,
        payload.customIntervalDays,
        payload.cycleAnchorDay,
        payload.defaultHsnSacCode,
        payload.companyLegalName,
        payload.companyGstin,
        payload.companyAddress,
        payload.companyState,
        payload.gstRatePercent,
        payload.invoiceNumberPattern,
        payload.minimumPayoutAmount,
        payload.approvalMode,
        payload.autoApproveBelowAmount,
        payload.requireInvoiceBeforePayment,
        payload.allowPartnerSelfInvoice,
        payload.adjustmentReasons,
        payload.holdReasons,
        payload.payoutVisibilityConfig,
        payload.updatedBy,
        payload.updatedAt,
        user.tenantId,
      ],
    );
    if (!data) throw new Error("PARTNER_PAYOUT_SETTINGS_NOT_FOUND");
    await createAuditLog(user as any, "UPDATE", "PARTNER_PAYOUT_SETTINGS", data.id, existing, data, null);
    return data;
  }

  const data = await queryOne<any>(
    `insert into "PartnerPayoutSettings"
      (id, "tenantId", "cycleFrequency", "customIntervalDays", "cycleAnchorDay", "defaultHsnSacCode",
       "companyLegalName", "companyGstin", "companyAddress", "companyState", "gstRatePercent",
       "invoiceNumberPattern", "minimumPayoutAmount", "approvalMode", "autoApproveBelowAmount",
       "requireInvoiceBeforePayment", "allowPartnerSelfInvoice", "adjustmentReasons", "holdReasons",
       "payoutVisibilityConfig", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22)
     returning id, "tenantId", "cycleFrequency", "customIntervalDays", "cycleAnchorDay", "defaultHsnSacCode",
               "companyLegalName", "companyGstin", "companyAddress", "companyState", "gstRatePercent",
               "invoiceNumberPattern", "minimumPayoutAmount", "approvalMode", "autoApproveBelowAmount",
               "requireInvoiceBeforePayment", "allowPartnerSelfInvoice", "adjustmentReasons", "holdReasons",
               "payoutVisibilityConfig", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      payload.cycleFrequency,
      payload.customIntervalDays,
      payload.cycleAnchorDay,
      payload.defaultHsnSacCode,
      payload.companyLegalName,
      payload.companyGstin,
      payload.companyAddress,
      payload.companyState,
      payload.gstRatePercent,
      payload.invoiceNumberPattern,
      payload.minimumPayoutAmount,
      payload.approvalMode,
      payload.autoApproveBelowAmount,
      payload.requireInvoiceBeforePayment,
      payload.allowPartnerSelfInvoice,
      payload.adjustmentReasons,
      payload.holdReasons,
      payload.payoutVisibilityConfig,
      payload.updatedBy,
      now,
    ],
  );
  if (!data) throw new Error("PARTNER_PAYOUT_SETTINGS_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "PARTNER_PAYOUT_SETTINGS", data.id, null, data, null);
  return data;
}

function normalizePayoutVisibilityConfig(config?: PartnerVisibilityConfig | null): PartnerVisibilityConfig {
  const mode = config?.mode === "SELECTED" ? "SELECTED" : "ALL_PARTNERS";
  return {
    mode,
    userIds: Array.isArray(config?.userIds) ? config.userIds.filter(Boolean) : [],
    teamIds: Array.isArray(config?.teamIds) ? config.teamIds.filter(Boolean) : [],
    salesGroupIds: Array.isArray(config?.salesGroupIds) ? config.salesGroupIds.filter(Boolean) : [],
    partnerOrganizationIds: Array.isArray(config?.partnerOrganizationIds) ? config.partnerOrganizationIds.filter(Boolean) : [],
  };
}

// Pure function, deliberately separated from I/O for testability. The very first
// cycle for a tenant starts "now" (there's no prior cycle to chain off); every
// subsequent cycle starts exactly where the previous one ended, so cycles are
// gapless and contiguous regardless of when the admin happens to click "generate."
export function computeNextCycleWindow(
  settings: Pick<PartnerPayoutSettingsInput, "cycleFrequency" | "customIntervalDays">,
  previousCycleEndDate: Date | null,
  now: Date = new Date(),
  timeZone?: string
): { startDate: Date; endDate: Date; cycleLabel: string } {
  const startDate = previousCycleEndDate ? new Date(previousCycleEndDate) : new Date(now);
  const endDate = new Date(startDate);

  if (settings.cycleFrequency === "MONTHLY") {
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  } else if (settings.cycleFrequency === "BIWEEKLY") {
    endDate.setUTCDate(endDate.getUTCDate() + 14);
  } else {
    const days = settings.customIntervalDays && settings.customIntervalDays > 0 ? settings.customIntervalDays : 30;
    endDate.setUTCDate(endDate.getUTCDate() + days);
  }

  return { startDate, endDate, cycleLabel: `${formatTenantDate(startDate, timeZone)} to ${formatTenantDate(endDate, timeZone)}` };
}

export async function listPayoutCyclesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];

  return query<any>(
    `select id, "tenantId", "cycleLabel", "startDate", "endDate", status, "generatedAt", "createdAt", "createdBy"
     from "PayoutCycle"
     where "tenantId" = $1
     order by "startDate" desc`,
    [user.tenantId],
  );
}

// Manual "Generate Next Cycle" action — always creates the next sequential cycle
// immediately, regardless of whether it's calendar-due yet. A separate cron-secret
// endpoint (generateDuePayoutCycleForTenant) is the schedule-respecting counterpart,
// for when an external cron is wired up (same pattern as AUTOMATION_CRON_SECRET).
export async function generateNextPayoutCycle(user: TenantUser) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const settings = await getPartnerPayoutSettingsForTenant(user);
  if (!settings) {
    throw new Error("PAYOUT_SETTINGS_NOT_CONFIGURED");
  }

  const cycles = await listPayoutCyclesForTenant(user);
  const previousCycle = cycles[0] ?? null;
  const timeZone = await getTenantTimeZone(user.tenantId);

  const { startDate, endDate, cycleLabel } = computeNextCycleWindow(
    settings,
    previousCycle ? new Date(previousCycle.endDate) : null,
    new Date(),
    timeZone
  );

  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `insert into "PayoutCycle"
      (id, "tenantId", "cycleLabel", "startDate", "endDate", status, "generatedAt", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $6)
     returning id, "tenantId", "cycleLabel", "startDate", "endDate", status, "generatedAt", "createdAt", "createdBy"`,
    [randomUUID(), user.tenantId, cycleLabel, startDate.toISOString(), endDate.toISOString(), now, user.id],
  );
  if (!data) throw new Error("PAYOUT_CYCLE_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "PAYOUT_CYCLE", data.id, null, data, null);
  return data;
}

// Sums CommissionLedger EARNED/CORRECTION_* entries by partner within the cycle's
// date range and upserts DRAFT Payout rows. Safe to re-run: it only ever
// (re)computes payouts still in DRAFT, never touches one that's been approved —
// so re-running after admin approval can't silently change an approved total.
export async function computePayoutsForCycle(user: TenantUser, cycleId: string) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const settings = await getPartnerPayoutSettingsForTenant(user);
  const cycle = await queryOne<any>(
    `select id, "tenantId", "cycleLabel", "startDate", "endDate", status, "generatedAt", "createdAt", "createdBy"
     from "PayoutCycle"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, cycleId],
  );
  if (!cycle) return null;

  const ledgerEntries = await query<any>(
    `select "partnerId", "commissionAmount", "entryType"
     from "CommissionLedger"
     where "tenantId" = $1 and "createdAt" >= $2 and "createdAt" < $3`,
    [user.tenantId, cycle.startDate, cycle.endDate],
  );

  const rollupTargets = await resolvePartnerRollupTargets(
    user.tenantId,
    [...new Set(ledgerEntries.map((entry: any) => entry.partnerId).filter(Boolean))],
  );

  const totalsByPartner = new Map<string, { partnerId: string; partnerOrganizationId: string | null; total: number }>();
  for (const entry of ledgerEntries) {
    const signedAmount = entry.entryType === "CORRECTION_DEBIT" ? -Number(entry.commissionAmount) : Number(entry.commissionAmount);
    const rollup = rollupTargets.get(entry.partnerId) ?? {
      partnerId: entry.partnerId,
      partnerOrganizationId: null,
      memberUserIds: [entry.partnerId],
    };
    const key = rollup.partnerOrganizationId ?? rollup.partnerId;
    const current = totalsByPartner.get(key) ?? { partnerId: rollup.partnerId, partnerOrganizationId: rollup.partnerOrganizationId, total: 0 };
    current.total += signedAmount;
    totalsByPartner.set(key, current);
  }

  const existingPayouts = await query<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
            "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
            "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"
     from "Payout"
     where "tenantId" = $1 and "payoutCycleId" = $2`,
    [user.tenantId, cycleId],
  );
  const existingByPartner = new Map(existingPayouts.map((p: any) => [p.partnerOrganizationId ?? p.partnerId, p]));

  const results = [];
  for (const [rollupKey, rollupTotal] of totalsByPartner.entries()) {
    const { partnerId, partnerOrganizationId, total: totalCommissionAmount } = rollupTotal;
    if (totalCommissionAmount === 0) continue;
    const existing = existingByPartner.get(rollupKey) ?? existingByPartner.get(partnerId);
    const shouldAutoApprove =
      settings?.approvalMode === "AUTO_BELOW_THRESHOLD" &&
      settings.autoApproveBelowAmount != null &&
      totalCommissionAmount >= Number(settings.minimumPayoutAmount ?? 0) &&
      totalCommissionAmount <= Number(settings.autoApproveBelowAmount);
    const computedStatus = shouldAutoApprove ? "APPROVED" : "DRAFT";
    const approvedAt = shouldAutoApprove ? new Date().toISOString() : null;
    const approvedBy = shouldAutoApprove ? user.id : null;

    if (existing && existing.status !== "DRAFT") {
      results.push(existing);
      continue;
    }

    const now = new Date().toISOString();
    const data = existing
      ? await queryOne<any>(
          `update "Payout"
           set "partnerId" = $1, "partnerOrganizationId" = $2, "totalCommissionAmount" = $3,
               status = $4, "approvedAt" = $5, "approvedBy" = $6, "updatedAt" = $7
           where id = $8
           returning id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
                     "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
                     "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"`,
          [partnerId, partnerOrganizationId, totalCommissionAmount, computedStatus, approvedAt, approvedBy, now, existing.id],
        )
      : await queryOne<any>(
          `insert into "Payout"
            (id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount",
             status, "approvedAt", "approvedBy", "createdAt", "updatedAt")
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
           returning id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
                     "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
                     "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"`,
          [randomUUID(), user.tenantId, cycleId, partnerId, partnerOrganizationId, totalCommissionAmount, computedStatus, approvedAt, approvedBy, now],
        );
    if (!data) throw new Error(existing ? "PAYOUT_UPDATE_FAILED" : "PAYOUT_INSERT_FAILED");
    results.push(data);
  }

  return results;
}

export async function listPayoutsForCycle(user: TenantUser, cycleId: string) {
  if (!user.tenantId) return [];

  const payouts = await query<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
            "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
            "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"
     from "Payout"
     where "tenantId" = $1 and "payoutCycleId" = $2
     order by "totalCommissionAmount" desc`,
    [user.tenantId, cycleId],
  );
  if (!payouts.length) return [];
  const partnerIds = payouts.map((p: any) => p.partnerId);
  const [users, profiles] = await Promise.all([
    query<any>('select id, name, email from "User" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, partnerIds]),
    query<any>('select "userId", "legalBusinessName" from "PartnerProfile" where "tenantId" = $1 and "userId" = any($2::text[])', [
      user.tenantId,
      partnerIds,
    ]),
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  const profileMap = new Map(profiles.map((row) => [row.userId, row]));

  return payouts.map((payout: any) => ({
    ...payout,
    partner: {
      ...(userMap.get(payout.partnerId) ?? null),
      legalBusinessName: profileMap.get(payout.partnerId)?.legalBusinessName ?? null,
    },
  }));
}

export async function listPayoutsForPartner(user: TenantUser, partnerId: string) {
  if (!user.tenantId) return [];

  const settings = await getPartnerPayoutSettingsForTenant(user);
  const visiblePartnerUserIds = await getPayoutVisiblePartnerUserIds(user, settings);
  if (!visiblePartnerUserIds.includes(partnerId)) return [];

  return query<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
            "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
            "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"
     from "Payout"
     where "tenantId" = $1 and "partnerId" = any($2::text[])
     order by "createdAt" desc`,
    [user.tenantId, visiblePartnerUserIds],
  );
}

export async function canCurrentUserAccessPayoutModule(user: TenantUser) {
  const settings = await getPartnerPayoutSettingsForTenant(user);
  return canAccessPayoutModule(user, settings);
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["APPROVED"],
  APPROVED: ["INVOICED", "PAID"],
  INVOICED: ["PAID"],
  PAID: [],
};

async function transitionPayoutStatus(
  user: TenantUser,
  payoutId: string,
  nextStatus: "APPROVED" | "INVOICED" | "PAID",
  extra: Record<string, unknown> = {}
) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const existing = await queryOne<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
            "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
            "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"
     from "Payout"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, payoutId],
  );
  if (!existing) return null;
  if (!ALLOWED_TRANSITIONS[existing.status]?.includes(nextStatus)) {
    throw new Error(`INVALID_PAYOUT_TRANSITION: ${existing.status} -> ${nextStatus}`);
  }
  if (existing.isHeld) throw new Error("PAYOUT_HELD");

  const settings = await getPartnerPayoutSettingsForTenant(user);
  if (nextStatus === "APPROVED" && Number(existing.totalCommissionAmount ?? 0) < Number(settings?.minimumPayoutAmount ?? 0)) {
    throw new Error("PAYOUT_BELOW_MINIMUM");
  }
  if (nextStatus === "PAID" && settings?.requireInvoiceBeforePayment !== false && !existing.invoiceId) {
    throw new Error("INVOICE_REQUIRED_BEFORE_PAYMENT");
  }

  const patch: Record<string, unknown> = { status: nextStatus, updatedAt: new Date().toISOString(), ...extra };
  const columns = Object.keys(patch);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await queryOne<any>(
    `update "Payout"
     set ${assignments}
     where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2}
     returning id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
               "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
               "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"`,
    [...values, user.tenantId, payoutId],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "PAYOUT", data.id, existing, data, { status: { before: existing.status, after: nextStatus } });
  return data;
}

export async function approvePayout(user: TenantUser, payoutId: string) {
  return transitionPayoutStatus(user, payoutId, "APPROVED", { approvedAt: new Date().toISOString(), approvedBy: user.id });
}

export async function holdPayout(user: TenantUser, payoutId: string, holdReason: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!holdReason?.trim()) throw new Error("HOLD_REASON_REQUIRED");
  const existing = await queryOne<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
            "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
            "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"
     from "Payout"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, payoutId],
  );
  if (!existing) return null;

  const data = await queryOne<any>(
    `update "Payout"
     set "isHeld" = true, "holdReason" = $1, "heldAt" = $2, "heldBy" = $3, "updatedAt" = $2
     where "tenantId" = $4 and id = $5
     returning id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
               "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
               "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"`,
    [holdReason.trim(), new Date().toISOString(), user.id, user.tenantId, payoutId],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "PAYOUT", data.id, existing, data, { hold: { before: false, after: true } });
  return data;
}

export async function releasePayoutHold(user: TenantUser, payoutId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await queryOne<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
            "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
            "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"
     from "Payout"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, payoutId],
  );
  if (!existing) return null;

  const data = await queryOne<any>(
    `update "Payout"
     set "isHeld" = false, "releasedAt" = $1, "releasedBy" = $2, "updatedAt" = $1
     where "tenantId" = $3 and id = $4
     returning id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
               "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
               "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"`,
    [new Date().toISOString(), user.id, user.tenantId, payoutId],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "PAYOUT", data.id, existing, data, { hold: { before: true, after: false } });
  return data;
}

export async function createPayoutAdjustment(
  user: TenantUser,
  payoutId: string,
  input: { direction?: "CREDIT" | "DEBIT"; amount?: number; reason?: string | null; notes?: string | null; opportunityId?: string | null }
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const amount = Number(input.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_ADJUSTMENT_AMOUNT");
  if (!input.reason?.trim()) throw new Error("ADJUSTMENT_REASON_REQUIRED");

  const payout = await queryOne<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
            "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
            "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"
     from "Payout"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, payoutId],
  );
  if (!payout) return null;
  if (payout.status === "INVOICED" || payout.status === "PAID") throw new Error("PAYOUT_LOCKED_FOR_ADJUSTMENT");
  if (payout.isHeld) throw new Error("PAYOUT_HELD");

  const cycle = await queryOne<any>(
    `select id, "tenantId", "cycleLabel", "startDate", "endDate", status, "generatedAt", "createdAt", "createdBy"
     from "PayoutCycle"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, payout.payoutCycleId],
  );
  if (!cycle) throw new Error("PAYOUT_CYCLE_NOT_FOUND");

  const direction = input.direction === "DEBIT" ? "DEBIT" : "CREDIT";
  const entryType = direction === "DEBIT" ? "CORRECTION_DEBIT" : "CORRECTION_CREDIT";
  const signedAmount = direction === "DEBIT" ? -amount : amount;
  const effectiveAt = new Date(cycle.startDate);
  effectiveAt.setUTCSeconds(effectiveAt.getUTCSeconds() + 1);

  const ledgerEntry = await writeCommissionLedgerEntry(user, {
    partnerId: payout.partnerId,
    opportunityId: input.opportunityId || null,
    entryType,
    baseAmount: null,
    commissionAmount: amount,
    calculationSnapshot: {
      source: "PAYOUT_ADJUSTMENT",
      payoutId,
      payoutCycleId: payout.payoutCycleId,
      reason: input.reason.trim(),
      notes: input.notes || null,
      direction,
    },
    triggerEvent: "PAYOUT_ADJUSTMENT",
    createdAt: effectiveAt.toISOString(),
  });

  const updatedPayout = await queryOne<any>(
    `update "Payout"
     set "totalCommissionAmount" = $1, "updatedAt" = $2
     where "tenantId" = $3 and id = $4
     returning id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status,
               "invoiceId", "approvedAt", "approvedBy", "paidAt", "paidBy", "paymentReference", "isHeld",
               "holdReason", "heldAt", "heldBy", "releasedAt", "releasedBy", "createdAt", "updatedAt"`,
    [Number(payout.totalCommissionAmount ?? 0) + signedAmount, new Date().toISOString(), user.tenantId, payout.id],
  );
  if (!updatedPayout) throw new Error("PAYOUT_UPDATE_FAILED");

  await createAuditLog(user as any, "UPDATE", "PAYOUT", payout.id, payout, updatedPayout, {
    adjustment: {
      direction,
      amount,
      reason: input.reason.trim(),
      ledgerEntryId: ledgerEntry.id,
    },
  });

  return { payout: updatedPayout, ledgerEntry };
}

export async function markPayoutPaid(user: TenantUser, payoutId: string, paymentReference: string) {
  if (!paymentReference?.trim()) {
    throw new Error("PAYMENT_REFERENCE_REQUIRED");
  }
  return transitionPayoutStatus(user, payoutId, "PAID", {
    paidAt: new Date().toISOString(),
    paidBy: user.id,
    paymentReference: paymentReference.trim(),
  });
}

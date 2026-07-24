import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FixtureDb } from "./helpers/supabase-mock";

const fixture = vi.hoisted(() => ({ db: {} as FixtureDb }));

function setFixtureDb(db: FixtureDb) {
  fixture.db = db;
}

function rows(table: string) {
  fixture.db[table] = fixture.db[table] ?? [];
  return fixture.db[table];
}

function assignDynamicUpdate(sql: string, target: Record<string, any>, params: any[]) {
  const setClause = sql.match(/set\s+([\s\S]+?)\s+where/i)?.[1] ?? "";
  const columns = [...setClause.matchAll(/"?([A-Za-z][A-Za-z0-9]*)"?\s*=\s*\$\d+/g)].map((match) => match[1]);
  columns.forEach((column, index) => {
    target[column] = params[index];
  });
}

vi.mock("@/lib/db/query", () => ({
  query: async (sql: string, params: any[] = []) => {
    if (sql.includes('from "PayoutCycle"') && sql.includes('order by "startDate" desc')) {
      return rows("PayoutCycle")
        .filter((row) => row.tenantId === params[0])
        .sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")));
    }
    if (sql.includes('from "CommissionLedger"')) {
      return rows("CommissionLedger").filter(
        (row) => row.tenantId === params[0] && row.createdAt >= params[1] && row.createdAt < params[2],
      );
    }
    if (sql.includes('from "Payout"') && sql.includes('"payoutCycleId" = $2')) {
      return rows("Payout").filter((row) => row.tenantId === params[0] && row.payoutCycleId === params[1]);
    }
    if (sql.includes('from "User"')) {
      const ids = params[1] ?? [];
      return rows("User").filter((row) => row.tenantId === params[0] && ids.includes(row.id));
    }
    if (sql.includes('from "PartnerProfile"')) {
      const ids = params[1] ?? [];
      return rows("PartnerProfile").filter((row) => row.tenantId === params[0] && ids.includes(row.userId));
    }
    return [];
  },
  queryOne: async (sql: string, params: any[] = []) => {
    if (sql.includes('from "PartnerPayoutSettings"')) {
      return rows("PartnerPayoutSettings").find((row) => row.tenantId === params[0]) ?? null;
    }
    if (sql.includes('from "PayoutCycle"')) {
      return rows("PayoutCycle").find((row) => row.tenantId === params[0] && row.id === params[1]) ?? null;
    }
    if (sql.includes('from "Payout"')) {
      return rows("Payout").find((row) => row.tenantId === params[0] && row.id === params[1]) ?? null;
    }
    if (sql.includes('insert into "Payout"')) {
      const row = {
        id: params[0],
        tenantId: params[1],
        payoutCycleId: params[2],
        partnerId: params[3],
        partnerOrganizationId: params[4],
        totalCommissionAmount: params[5],
        status: params[6],
        approvedAt: params[7],
        approvedBy: params[8],
        createdAt: params[9],
        updatedAt: params[9],
      };
      rows("Payout").push(row);
      return row;
    }
    if (sql.includes('update "Payout"') && sql.includes('"totalCommissionAmount" = $1')) {
      const row = rows("Payout").find((payout) => payout.tenantId === params[2] && payout.id === params[3]);
      if (!row) return null;
      Object.assign(row, { totalCommissionAmount: params[0], updatedAt: params[1] });
      return row;
    }
    if (sql.includes('update "Payout"') && sql.includes('"isHeld" = true')) {
      const row = rows("Payout").find((payout) => payout.tenantId === params[3] && payout.id === params[4]);
      if (!row) return null;
      Object.assign(row, { isHeld: true, holdReason: params[0], heldAt: params[1], heldBy: params[2], updatedAt: params[1] });
      return row;
    }
    if (sql.includes('update "Payout"') && sql.includes('"isHeld" = false')) {
      const row = rows("Payout").find((payout) => payout.tenantId === params[2] && payout.id === params[3]);
      if (!row) return null;
      Object.assign(row, { isHeld: false, releasedAt: params[0], releasedBy: params[1], updatedAt: params[0] });
      return row;
    }
    if (sql.includes('update "Payout"') && sql.includes('where id = $8')) {
      const row = rows("Payout").find((payout) => payout.id === params[7]);
      if (!row) return null;
      Object.assign(row, {
        partnerId: params[0],
        partnerOrganizationId: params[1],
        totalCommissionAmount: params[2],
        status: params[3],
        approvedAt: params[4],
        approvedBy: params[5],
        updatedAt: params[6],
      });
      return row;
    }
    if (sql.includes('update "Payout"')) {
      const row = rows("Payout").find((payout) => payout.tenantId === params.at(-2) && payout.id === params.at(-1));
      if (!row) return null;
      assignDynamicUpdate(sql, row, params);
      return row;
    }
    return null;
  },
  execute: async () => ({ rowCount: 0 }),
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

const partnerAccessMocks = vi.hoisted(() => ({
  rollups: new Map<string, { partnerId: string; partnerOrganizationId: string | null; memberUserIds: string[] }>(),
  resolvePartnerRollupTargets: vi.fn(async (_tenantId: string, userIds: string[]) => new Map(
    userIds.map((userId) => [
      userId,
      partnerAccessMocks.rollups.get(userId) ?? { partnerId: userId, partnerOrganizationId: null, memberUserIds: [userId] },
    ]),
  )),
}));

vi.mock("@/lib/server/partner-access", () => ({
  resolvePartnerRollupTargets: partnerAccessMocks.resolvePartnerRollupTargets,
  resolvePartnerRollupTarget: vi.fn(async (_tenantId: string, userId: string) => (
    partnerAccessMocks.rollups.get(userId) ?? { partnerId: userId, partnerOrganizationId: null, memberUserIds: [userId] }
  )),
  getPayoutVisiblePartnerUserIds: vi.fn(async (_user: unknown) => []),
  canAccessPayoutModule: vi.fn(async () => true),
  userMatchesTargetingConfig: vi.fn(async () => true),
}));

const commissionMocks = vi.hoisted(() => ({
  writeCommissionLedgerEntry: vi.fn(async (_user: unknown, input: any) => ({
    id: "ledger-adjustment-1",
    tenantId: TENANT,
    partnerId: input.partnerId,
    opportunityId: input.opportunityId ?? null,
    commissionRuleId: input.commissionRuleId ?? null,
    entryType: input.entryType,
    baseAmount: input.baseAmount ?? null,
    commissionAmount: input.commissionAmount,
    calculationSnapshot: input.calculationSnapshot ?? null,
    triggerEvent: input.triggerEvent ?? null,
    correctsEntryId: input.correctsEntryId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: "admin-1",
  })),
}));

vi.mock("@/lib/server/commission", () => ({
  writeCommissionLedgerEntry: commissionMocks.writeCommissionLedgerEntry,
}));

import {
  computeNextCycleWindow,
  computePayoutsForCycle,
  approvePayout,
  markPayoutPaid,
  createPayoutAdjustment,
} from "@/lib/server/payouts";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT };
const PARTNER_A = "partner-a";
const PARTNER_B = "partner-b";

beforeEach(() => {
  setFixtureDb({});
  partnerAccessMocks.rollups.clear();
  partnerAccessMocks.resolvePartnerRollupTargets.mockClear();
  commissionMocks.writeCommissionLedgerEntry.mockClear();
});

describe("computeNextCycleWindow — pure calendar math", () => {
  it("MONTHLY: first cycle starts now, ends one calendar month later", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");
    const { startDate, endDate } = computeNextCycleWindow({ cycleFrequency: "MONTHLY" }, null, now);
    expect(startDate.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("MONTHLY: subsequent cycle starts exactly where the previous one ended (gapless)", () => {
    const previousEnd = new Date("2026-02-15T00:00:00.000Z");
    const { startDate, endDate } = computeNextCycleWindow({ cycleFrequency: "MONTHLY" }, previousEnd);
    expect(startDate.toISOString()).toBe(previousEnd.toISOString());
    expect(endDate.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("MONTHLY: correctly rolls across a leap-year February", () => {
    const previousEnd = new Date("2028-01-31T00:00:00.000Z"); // 2028 is a leap year
    const { endDate } = computeNextCycleWindow({ cycleFrequency: "MONTHLY" }, previousEnd);
    // JS Date's setUTCMonth on Jan 31 + 1 month overflows into March 2/3 since Feb has
    // only 29 days in 2028 — documenting the actual (overflow) behavior here so a
    // future change to this function has to consciously decide to change it.
    expect(endDate.getUTCMonth()).toBe(2); // March (0-indexed)
  });

  it("BIWEEKLY: adds exactly 14 days", () => {
    const previousEnd = new Date("2026-03-01T00:00:00.000Z");
    const { endDate } = computeNextCycleWindow({ cycleFrequency: "BIWEEKLY" }, previousEnd);
    expect(endDate.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("CUSTOM_DAYS: adds the configured interval", () => {
    const previousEnd = new Date("2026-03-01T00:00:00.000Z");
    const { endDate } = computeNextCycleWindow({ cycleFrequency: "CUSTOM_DAYS", customIntervalDays: 45 }, previousEnd);
    expect(endDate.toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });

  it("CUSTOM_DAYS: falls back to 30 days if no interval is configured", () => {
    const previousEnd = new Date("2026-03-01T00:00:00.000Z");
    const { endDate } = computeNextCycleWindow({ cycleFrequency: "CUSTOM_DAYS", customIntervalDays: null }, previousEnd);
    expect(endDate.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });
});

describe("computePayoutsForCycle", () => {
  const cycle = {
    id: "cycle-1",
    tenantId: TENANT,
    cycleLabel: "Jan 2026",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-02-01T00:00:00.000Z",
    status: "OPEN",
  };

  it("sums EARNED ledger entries per partner within the cycle's date range", async () => {
    setFixtureDb({
      PayoutCycle: [cycle],
      CommissionLedger: [
        { id: "l1", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 100, entryType: "EARNED", createdAt: "2026-01-05T00:00:00.000Z" },
        { id: "l2", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 200, entryType: "EARNED", createdAt: "2026-01-20T00:00:00.000Z" },
        { id: "l3", tenantId: TENANT, partnerId: PARTNER_B, commissionAmount: 50, entryType: "EARNED", createdAt: "2026-01-10T00:00:00.000Z" },
        // Outside the cycle window — must be excluded.
        { id: "l4", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 999, entryType: "EARNED", createdAt: "2026-02-01T00:00:00.000Z" },
        { id: "l5", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 999, entryType: "EARNED", createdAt: "2025-12-31T23:59:59.000Z" },
      ],
    });

    const payouts = await computePayoutsForCycle(adminUser, "cycle-1");
    const byPartner = new Map(payouts!.map((p: any) => [p.partnerId, p.totalCommissionAmount]));
    expect(byPartner.get(PARTNER_A)).toBe(300);
    expect(byPartner.get(PARTNER_B)).toBe(50);
  });

  it("subtracts CORRECTION_DEBIT entries from the partner's total", async () => {
    setFixtureDb({
      PayoutCycle: [cycle],
      CommissionLedger: [
        { id: "l1", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 300, entryType: "EARNED", createdAt: "2026-01-05T00:00:00.000Z" },
        { id: "l2", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 50, entryType: "CORRECTION_DEBIT", createdAt: "2026-01-06T00:00:00.000Z" },
      ],
    });

    const payouts = await computePayoutsForCycle(adminUser, "cycle-1");
    expect(payouts![0].totalCommissionAmount).toBe(250);
  });

  it("never overwrites a payout that's already past DRAFT (re-running is safe after approval)", async () => {
    setFixtureDb({
      PayoutCycle: [cycle],
      CommissionLedger: [
        { id: "l1", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 100, entryType: "EARNED", createdAt: "2026-01-05T00:00:00.000Z" },
      ],
      Payout: [
        { id: "payout-1", tenantId: TENANT, payoutCycleId: "cycle-1", partnerId: PARTNER_A, totalCommissionAmount: 999, status: "APPROVED", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    const payouts = await computePayoutsForCycle(adminUser, "cycle-1");
    expect(payouts![0].totalCommissionAmount).toBe(999); // unchanged, not recomputed to 100
    expect(payouts![0].status).toBe("APPROVED");
  });

  it("returns an empty array when there are no ledger entries in range", async () => {
    setFixtureDb({ PayoutCycle: [cycle], CommissionLedger: [] });
    expect(await computePayoutsForCycle(adminUser, "cycle-1")).toEqual([]);
  });

  it("auto-approves computed payouts when configured below the threshold and above the minimum", async () => {
    setFixtureDb({
      PartnerPayoutSettings: [
        {
          id: "settings-1",
          tenantId: TENANT,
          cycleFrequency: "MONTHLY",
          approvalMode: "AUTO_BELOW_THRESHOLD",
          minimumPayoutAmount: 100,
          autoApproveBelowAmount: 500,
        },
      ],
      PayoutCycle: [cycle],
      CommissionLedger: [
        { id: "l1", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 250, entryType: "EARNED", createdAt: "2026-01-05T00:00:00.000Z" },
        { id: "l2", tenantId: TENANT, partnerId: PARTNER_B, commissionAmount: 50, entryType: "EARNED", createdAt: "2026-01-05T00:00:00.000Z" },
      ],
    });

    const payouts = await computePayoutsForCycle(adminUser, "cycle-1");
    const byPartner = new Map(payouts!.map((p: any) => [p.partnerId, p]));
    expect(byPartner.get(PARTNER_A).status).toBe("APPROVED");
    expect(byPartner.get(PARTNER_A).approvedBy).toBe(adminUser.id);
    expect(byPartner.get(PARTNER_B).status).toBe("DRAFT");
  });

  it("rolls up multiple partner logins into one partner-organization payout", async () => {
    const orgTarget = { partnerId: PARTNER_A, partnerOrganizationId: "org-1", memberUserIds: [PARTNER_A, "partner-a-finance"] };
    partnerAccessMocks.rollups.set(PARTNER_A, orgTarget);
    partnerAccessMocks.rollups.set("partner-a-finance", orgTarget);
    setFixtureDb({
      PayoutCycle: [cycle],
      PartnerProfile: [
        { id: "profile-primary", tenantId: TENANT, userId: PARTNER_A, partnerOrganizationId: "org-1", partnerLoginRole: "PRIMARY", status: "ACTIVE" },
        { id: "profile-finance", tenantId: TENANT, userId: "partner-a-finance", partnerOrganizationId: "org-1", partnerLoginRole: "FINANCE", status: "ACTIVE" },
      ],
      CommissionLedger: [
        { id: "l1", tenantId: TENANT, partnerId: PARTNER_A, commissionAmount: 100, entryType: "EARNED", createdAt: "2026-01-05T00:00:00.000Z" },
        { id: "l2", tenantId: TENANT, partnerId: "partner-a-finance", commissionAmount: 75, entryType: "EARNED", createdAt: "2026-01-20T00:00:00.000Z" },
      ],
    });

    const payouts = await computePayoutsForCycle(adminUser, "cycle-1");
    expect(payouts).toHaveLength(1);
    expect(payouts![0].partnerId).toBe(PARTNER_A);
    expect(payouts![0].partnerOrganizationId).toBe("org-1");
    expect(payouts![0].totalCommissionAmount).toBe(175);
  });
});

describe("Payout status transitions", () => {
  function draftPayout(overrides: Record<string, unknown> = {}) {
    return {
      id: "payout-1",
      tenantId: TENANT,
      payoutCycleId: "cycle-1",
      partnerId: PARTNER_A,
      totalCommissionAmount: 500,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("DRAFT -> APPROVED succeeds", async () => {
    setFixtureDb({ Payout: [draftPayout()] });
    const updated = await approvePayout(adminUser, "payout-1");
    expect(updated?.status).toBe("APPROVED");
    expect(updated?.approvedBy).toBe(adminUser.id);
  });

  it("DRAFT -> PAID is rejected (must go through APPROVED first)", async () => {
    setFixtureDb({ Payout: [draftPayout()] });
    await expect(markPayoutPaid(adminUser, "payout-1", "UTR123")).rejects.toThrow("INVALID_PAYOUT_TRANSITION");
  });

  it("APPROVED -> PAID succeeds and requires a payment reference", async () => {
    setFixtureDb({
      PartnerPayoutSettings: [{ id: "settings-1", tenantId: TENANT, requireInvoiceBeforePayment: false }],
      Payout: [draftPayout({ status: "APPROVED" })],
    });
    await expect(markPayoutPaid(adminUser, "payout-1", "")).rejects.toThrow("PAYMENT_REFERENCE_REQUIRED");

    const updated = await markPayoutPaid(adminUser, "payout-1", "UTR123456");
    expect(updated?.status).toBe("PAID");
    expect(updated?.paymentReference).toBe("UTR123456");
  });

  it("PAID -> anything is rejected — a paid payout is terminal", async () => {
    setFixtureDb({ Payout: [draftPayout({ status: "PAID" })] });
    await expect(approvePayout(adminUser, "payout-1")).rejects.toThrow("INVALID_PAYOUT_TRANSITION");
  });
});

describe("Payout adjustments", () => {
  it("writes an append-only correction entry and updates an unlocked payout total", async () => {
    setFixtureDb({
      PayoutCycle: [
        {
          id: "cycle-1",
          tenantId: TENANT,
          cycleLabel: "Jan 2026",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-02-01T00:00:00.000Z",
          status: "OPEN",
        },
      ],
      Payout: [
        {
          id: "payout-1",
          tenantId: TENANT,
          payoutCycleId: "cycle-1",
          partnerId: PARTNER_A,
          totalCommissionAmount: 500,
          status: "DRAFT",
          isHeld: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await createPayoutAdjustment(adminUser, "payout-1", {
      direction: "DEBIT",
      amount: 75,
      reason: "Clawback",
    });

    expect(result?.payout.totalCommissionAmount).toBe(425);
    expect(result?.ledgerEntry.entryType).toBe("CORRECTION_DEBIT");
    expect(result?.ledgerEntry.commissionAmount).toBe(75);
  });

  it("blocks adjustments once a payout is invoiced", async () => {
    setFixtureDb({
      PayoutCycle: [{ id: "cycle-1", tenantId: TENANT, startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-02-01T00:00:00.000Z" }],
      Payout: [
        {
          id: "payout-1",
          tenantId: TENANT,
          payoutCycleId: "cycle-1",
          partnerId: PARTNER_A,
          totalCommissionAmount: 500,
          status: "INVOICED",
          isHeld: false,
        },
      ],
    });

    await expect(createPayoutAdjustment(adminUser, "payout-1", {
      direction: "CREDIT",
      amount: 50,
      reason: "Goodwill",
    })).rejects.toThrow("PAYOUT_LOCKED_FOR_ADJUSTMENT");
  });
});

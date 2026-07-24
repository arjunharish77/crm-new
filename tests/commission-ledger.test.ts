import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const state: {
    CommissionRule: any[];
    CommissionLedger: any[];
    PartnerProfile: any[];
  } = {
    CommissionRule: [],
    CommissionLedger: [],
    PartnerProfile: [],
  };

  return {
    state,
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "CommissionRule"')) {
        return state.CommissionRule
          .filter((rule) => rule.tenantId === params[0] && rule.isActive === true)
          .sort((a, b) => (Number(b.priority ?? 0) - Number(a.priority ?? 0)) || String(b.createdAt).localeCompare(String(a.createdAt)));
      }
      if (sql.includes('from "CommissionLedger"')) {
        const partnerIds = params[1] as string[];
        return state.CommissionLedger
          .filter((entry) => entry.tenantId === params[0] && partnerIds.includes(entry.partnerId))
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      }
      return [];
    }),
    queryOne: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "PartnerProfile"')) {
        return state.PartnerProfile.find((profile) => profile.tenantId === params[0] && profile.userId === params[1]) ?? null;
      }
      if (sql.includes('insert into "CommissionLedger"')) {
        const entry = {
          id: params[0],
          tenantId: params[1],
          partnerId: params[2],
          opportunityId: params[3],
          commissionRuleId: params[4],
          entryType: params[5],
          baseAmount: params[6],
          commissionAmount: params[7],
          calculationSnapshot: params[8],
          triggerEvent: params[9],
          correctsEntryId: params[10],
          createdBy: params[11],
          createdAt: params[12],
        };
        state.CommissionLedger.push(entry);
        return entry;
      }
      return null;
    }),
    execute: vi.fn(),
  };
});

vi.mock("@/lib/db/query", () => ({
  query: dbMocks.query,
  queryOne: dbMocks.queryOne,
  execute: dbMocks.execute,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
  automationConditionMatches: vi.fn(() => true),
}));

import {
  writeCommissionLedgerEntry,
  listCommissionLedgerForPartner,
  calculateAndRecordCommissionForOpportunity,
} from "@/lib/server/commission";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT, isTenantAdmin: true };
const partnerUserId = "partner-1";

beforeEach(() => {
  dbMocks.state.CommissionRule = [];
  dbMocks.state.CommissionLedger = [];
  dbMocks.state.PartnerProfile = [];
  dbMocks.query.mockClear();
  dbMocks.queryOne.mockClear();
  dbMocks.execute.mockClear();
});

describe("writeCommissionLedgerEntry — append-only", () => {
  it("writes an EARNED entry", async () => {
    const entry = await writeCommissionLedgerEntry(adminUser, {
      partnerId: partnerUserId,
      opportunityId: "opp-1",
      entryType: "EARNED",
      baseAmount: 1000,
      commissionAmount: 50,
    });
    expect(entry.id).toBeTruthy();
    expect(entry.entryType).toBe("EARNED");

    const ledger = await listCommissionLedgerForPartner(adminUser, partnerUserId);
    expect(ledger).toHaveLength(1);
  });

  it("a correction is a new offsetting row, never an edit to the original", async () => {
    const original = await writeCommissionLedgerEntry(adminUser, {
      partnerId: partnerUserId,
      opportunityId: "opp-1",
      entryType: "EARNED",
      baseAmount: 1000,
      commissionAmount: 50,
    });

    const correction = await writeCommissionLedgerEntry(adminUser, {
      partnerId: partnerUserId,
      opportunityId: "opp-1",
      entryType: "CORRECTION_DEBIT",
      commissionAmount: 50,
      correctsEntryId: original.id,
    });

    const ledger = await listCommissionLedgerForPartner(adminUser, partnerUserId);
    expect(ledger).toHaveLength(2);

    const originalRow = ledger.find((e: any) => e.id === original.id)!;
    expect(originalRow.entryType).toBe("EARNED");
    expect(originalRow.commissionAmount).toBe(50);

    const correctionRow = ledger.find((e: any) => e.id === correction.id)!;
    expect(correctionRow.entryType).toBe("CORRECTION_DEBIT");
    expect(correctionRow.correctsEntryId).toBe(original.id);
  });

  it("there is no exported update/delete path for the ledger — corrections are the only way to change net commission", async () => {
    const commissionModule = await import("@/lib/server/commission");
    expect((commissionModule as any).updateCommissionLedgerEntry).toBeUndefined();
    expect((commissionModule as any).deleteCommissionLedgerEntry).toBeUndefined();
  });
});

describe("calculateAndRecordCommissionForOpportunity — trigger-time flow", () => {
  const opportunity = {
    id: "opp-1",
    tenantId: TENANT,
    ownerId: partnerUserId,
    opportunityTypeId: "type-x",
    amount: 70000,
  };

  it("writes a ledger entry when the owner is an active partner and a rule matches", async () => {
    dbMocks.state.PartnerProfile = [{ id: "pp-1", tenantId: TENANT, userId: partnerUserId, status: "ACTIVE" }];
    dbMocks.state.CommissionRule = [
      {
        id: "rule-1",
        tenantId: TENANT,
        name: "Default",
        partnerId: null,
        opportunityTypeId: null,
        conditions: {},
        ruleType: "PERCENTAGE",
        value: 8,
        priority: 1,
        isActive: true,
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: new Date().toISOString(),
      },
    ];

    const entry = await calculateAndRecordCommissionForOpportunity(adminUser, opportunity, "STAGE_CHANGED");
    expect(entry).not.toBeNull();
    expect(entry!.commissionAmount).toBe(5600); // 8% of 70000
    expect(entry!.entryType).toBe("EARNED");
    expect(entry!.triggerEvent).toBe("STAGE_CHANGED");
  });

  it("is a no-op when the owner is not a partner", async () => {
    dbMocks.state.PartnerProfile = [];
    dbMocks.state.CommissionRule = [{ id: "rule-1", tenantId: TENANT, isActive: true, priority: 1, ruleType: "PERCENTAGE", value: 8, conditions: {}, createdAt: new Date().toISOString() }];

    const entry = await calculateAndRecordCommissionForOpportunity(adminUser, opportunity, "STAGE_CHANGED");
    expect(entry).toBeNull();
    expect(await listCommissionLedgerForPartner(adminUser, partnerUserId)).toHaveLength(0);
  });

  it("is a no-op when the partner profile is suspended", async () => {
    dbMocks.state.PartnerProfile = [{ id: "pp-1", tenantId: TENANT, userId: partnerUserId, status: "SUSPENDED" }];
    dbMocks.state.CommissionRule = [{ id: "rule-1", tenantId: TENANT, isActive: true, priority: 1, ruleType: "PERCENTAGE", value: 8, conditions: {}, createdAt: new Date().toISOString() }];

    const entry = await calculateAndRecordCommissionForOpportunity(adminUser, opportunity, "STAGE_CHANGED");
    expect(entry).toBeNull();
  });

  it("is a no-op when no commission rule matches", async () => {
    dbMocks.state.PartnerProfile = [{ id: "pp-1", tenantId: TENANT, userId: partnerUserId, status: "ACTIVE" }];
    dbMocks.state.CommissionRule = [];

    const entry = await calculateAndRecordCommissionForOpportunity(adminUser, opportunity, "STAGE_CHANGED");
    expect(entry).toBeNull();
  });

  it("is a no-op when the opportunity has no owner", async () => {
    dbMocks.state.PartnerProfile = [{ id: "pp-1", tenantId: TENANT, userId: partnerUserId, status: "ACTIVE" }];
    dbMocks.state.CommissionRule = [{ id: "rule-1", tenantId: TENANT, isActive: true, priority: 1, ruleType: "PERCENTAGE", value: 8, conditions: {}, createdAt: new Date().toISOString() }];

    const entry = await calculateAndRecordCommissionForOpportunity(adminUser, { ...opportunity, ownerId: null }, "STAGE_CHANGED");
    expect(entry).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  commissionRules: [] as any[],
  query: vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('from "CommissionRule"')) {
      return dbMocks.commissionRules
        .filter((rule) => rule.tenantId === params[0] && rule.isActive === true)
        .sort((a, b) => (Number(b.priority ?? 0) - Number(a.priority ?? 0)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    return [];
  }),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db/query", () => ({
  query: dbMocks.query,
  queryOne: dbMocks.queryOne,
  execute: dbMocks.execute,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
  automationConditionMatches: (record: Record<string, unknown>, config: any) => {
    const conditions = Array.isArray(config?.conditions) ? config.conditions : [];
    return conditions.every((condition: any) => {
      const actual = Number(record[condition.field] ?? 0);
      const expected = Number(condition.value ?? 0);
      if (condition.operator === "greater_than_or_equal") return actual >= expected;
      if (condition.operator === "less_than") return actual < expected;
      return true;
    });
  },
}));

import { resolveCommissionRule, calculateCommissionAmount } from "@/lib/server/commission";

const TENANT = "tenant-a";
const PARTNER_A = "partner-a";
const PARTNER_B = "partner-b";
const PRODUCT_X = "type-x";

let ruleCounter = 0;
function rule(overrides: Record<string, unknown>) {
  ruleCounter += 1;
  return {
    id: `rule-${ruleCounter}`,
    tenantId: TENANT,
    name: `Rule ${ruleCounter}`,
    partnerId: null,
    opportunityTypeId: null,
    conditions: {},
    ruleType: "PERCENTAGE",
    value: 5,
    priority: 0,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  ruleCounter = 0;
  dbMocks.commissionRules = [];
  dbMocks.query.mockClear();
  dbMocks.queryOne.mockClear();
  dbMocks.execute.mockClear();
});

describe("resolveCommissionRule — priority order, first match wins", () => {
  it("higher-priority rule wins over a lower-priority rule that also matches", async () => {
    dbMocks.commissionRules = [
      rule({ priority: 1, ruleType: "PERCENTAGE", value: 5 }),
      rule({ priority: 10, ruleType: "PERCENTAGE", value: 9 }),
    ];
    const resolved = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, record: {} });
    expect(resolved?.value).toBe(9);
  });

  it("priority overrides specificity — a general rule with higher priority beats a more specific partner rule with lower priority", async () => {
    // This encodes a deliberate design choice: resolution is admin-ordered priority,
    // first-match-wins (like AssignmentRule) — NOT automatic specificity ranking.
    dbMocks.commissionRules = [
      rule({ partnerId: PARTNER_A, priority: 1, value: 20 }), // more specific, lower priority
      rule({ partnerId: null, priority: 5, value: 3 }), // less specific, higher priority
    ];
    const resolved = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, record: {} });
    expect(resolved?.value).toBe(3);
  });

  it("a rule scoped to a different partner never matches", async () => {
    dbMocks.commissionRules = [rule({ partnerId: PARTNER_B, priority: 10, value: 99 })];
    const resolved = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, record: {} });
    expect(resolved).toBeNull();
  });

  it("a rule scoped to a specific opportunity type only matches that type", async () => {
    dbMocks.commissionRules = [
      rule({ opportunityTypeId: PRODUCT_X, priority: 10, value: 7 }),
      rule({ opportunityTypeId: null, priority: 1, value: 4 }),
    ];
    const matchingType = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, opportunityTypeId: PRODUCT_X, record: {} });
    expect(matchingType?.value).toBe(7);

    const otherType = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, opportunityTypeId: "type-y", record: {} });
    expect(otherType?.value).toBe(4);
  });

  it("returns null when no active rule matches", async () => {
    dbMocks.commissionRules = [rule({ partnerId: PARTNER_B, priority: 10 })];
    expect(await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, record: {} })).toBeNull();
  });

  it("inactive rules are never considered even at top priority", async () => {
    dbMocks.commissionRules = [
      rule({ priority: 100, isActive: false, value: 50 }),
      rule({ priority: 1, isActive: true, value: 3 }),
    ];
    const resolved = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, record: {} });
    expect(resolved?.value).toBe(3);
  });

  it("respects effectiveFrom/effectiveTo windows", async () => {
    const asOf = new Date("2026-06-15T00:00:00.000Z");
    dbMocks.commissionRules = [
      rule({ priority: 10, value: 99, effectiveTo: "2026-01-01T00:00:00.000Z" }), // expired
      rule({ priority: 5, value: 88, effectiveFrom: "2026-07-01T00:00:00.000Z" }), // not yet active
      rule({ priority: 1, value: 6 }), // always active
    ];
    const resolved = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, record: {} }, asOf);
    expect(resolved?.value).toBe(6);
  });
});

describe("resolveCommissionRule — tiered slab boundary conditions", () => {
  // Three priority-ordered bands on opportunity.amount:
  //   [0, 50000)      -> 5%
  //   [50000, 100000) -> 8%
  //   [100000, inf)   -> 10%
  const tierRules = [
    rule({
      name: "Tier 3",
      priority: 3,
      value: 10,
      conditions: { logic: "AND", conditions: [{ field: "amount", operator: "greater_than_or_equal", value: 100000 }] },
    }),
    rule({
      name: "Tier 2",
      priority: 2,
      value: 8,
      conditions: {
        logic: "AND",
        conditions: [
          { field: "amount", operator: "greater_than_or_equal", value: 50000 },
          { field: "amount", operator: "less_than", value: 100000 },
        ],
      },
    }),
    rule({
      name: "Tier 1",
      priority: 1,
      value: 5,
      conditions: { logic: "AND", conditions: [{ field: "amount", operator: "less_than", value: 50000 }] },
    }),
  ];

  beforeEach(() => {
    dbMocks.commissionRules = tierRules;
  });

  it.each([
    [0, 5],
    [49999.99, 5],
    [50000, 8], // lower boundary of tier 2 is inclusive
    [75000, 8],
    [99999.99, 8],
    [100000, 10], // lower boundary of tier 3 is inclusive
    [250000, 10],
  ])("amount=%d resolves to the %d%% tier", async (amount, expectedValue) => {
    const resolved = await resolveCommissionRule(TENANT, { partnerId: PARTNER_A, record: { amount } });
    expect(resolved?.value).toBe(expectedValue);
  });
});

describe("calculateCommissionAmount", () => {
  it("FLAT returns the flat value regardless of base amount", () => {
    expect(calculateCommissionAmount({ ruleType: "FLAT", value: 500 }, 123456)).toBe(500);
    expect(calculateCommissionAmount({ ruleType: "FLAT", value: 500 }, 1)).toBe(500);
  });

  it("PERCENTAGE computes baseAmount * value / 100", () => {
    expect(calculateCommissionAmount({ ruleType: "PERCENTAGE", value: 8 }, 70000)).toBe(5600);
    expect(calculateCommissionAmount({ ruleType: "PERCENTAGE", value: 5 }, 1000)).toBe(50);
  });

  it("rounds to the nearest cent/paisa rather than accumulating floating point drift", () => {
    // 33.333...% of 100 = 33.333... -> rounds to 33.33
    expect(calculateCommissionAmount({ ruleType: "PERCENTAGE", value: 33.333 }, 100)).toBe(33.33);
    // 5.5% of 333 = 18.315 -> rounds to 18.32 (round-half-up)
    expect(calculateCommissionAmount({ ruleType: "PERCENTAGE", value: 5.5 }, 333)).toBe(18.32);
  });

  it("throws on an unknown rule type rather than silently returning 0", () => {
    expect(() => calculateCommissionAmount({ ruleType: "TIERED", value: 1 }, 100)).toThrow("UNKNOWN_RULE_TYPE");
  });
});

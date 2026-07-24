import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const state: {
    Badge: any[];
    GamificationPointsLedger: any[];
    UserBadge: any[];
  } = {
    Badge: [],
    GamificationPointsLedger: [],
    UserBadge: [],
  };

  return {
    state,
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "Badge"')) {
        return state.Badge.filter((badge) => badge.tenantId === params[0] && badge.isActive === true);
      }
      return [];
    }),
    queryOne: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "UserBadge"')) {
        return state.UserBadge.find(
          (award) =>
            award.tenantId === params[0] &&
            award.userId === params[1] &&
            award.badgeId === params[2] &&
            award.sourcePeriodStart === params[3],
        ) ?? null;
      }

      if (sql.includes('from "GamificationPointsLedger"')) {
        const [, , , start, end] = params as [string, string, string, string, string];
        const count = state.GamificationPointsLedger.filter(
          (entry) =>
            entry.tenantId === params[0] &&
            entry.userId === params[1] &&
            entry.triggerEvent === params[2] &&
            entry.entryType === "EARNED" &&
            entry.createdAt >= start &&
            entry.createdAt <= end,
        ).length;
        return { count };
      }

      if (sql.includes('insert into "UserBadge"')) {
        const award = {
          id: params[0],
          tenantId: params[1],
          userId: params[2],
          badgeId: params[3],
          earnedAt: params[4],
          sourcePeriodStart: params[5],
          sourcePeriodEnd: params[6],
        };
        state.UserBadge.push(award);
        return award;
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
  createAuditLog: vi.fn(),
}));

import { computeBadgeWindow, evaluateBadgesForEvent } from "@/lib/server/badges";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT };
const USER_ID = "user-1";

describe("computeBadgeWindow", () => {
  it("all-time (no windowDays) uses the epoch sentinel as the window start", () => {
    const asOf = new Date("2026-06-15T00:00:00.000Z");
    const { start, end } = computeBadgeWindow(null, asOf);
    expect(start).toBe("1970-01-01T00:00:00.000Z");
    expect(end).toBe(asOf.toISOString());
  });

  it("windowed badge subtracts windowDays from the as-of date", () => {
    const asOf = new Date("2026-06-15T00:00:00.000Z");
    const { start, end } = computeBadgeWindow(30, asOf);
    expect(start).toBe("2026-05-16T00:00:00.000Z");
    expect(end).toBe(asOf.toISOString());
  });
});

function ledgerEntry(overrides: Record<string, unknown>) {
  return {
    id: `l-${Math.random()}`,
    tenantId: TENANT,
    userId: USER_ID,
    entryType: "EARNED",
    triggerEvent: "STAGE_CHANGED",
    points: 10,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function badge(overrides: Record<string, unknown>) {
  return {
    id: `badge-${Math.random()}`,
    tenantId: TENANT,
    name: "10 Wins",
    iconEmoji: "🏆",
    audienceScope: "ALL",
    criteriaRules: { eventType: "STAGE_CHANGED", threshold: 3, windowDays: null },
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  dbMocks.state.Badge = [];
  dbMocks.state.GamificationPointsLedger = [];
  dbMocks.state.UserBadge = [];
  dbMocks.query.mockClear();
  dbMocks.queryOne.mockClear();
  dbMocks.execute.mockClear();
});

describe("evaluateBadgesForEvent", () => {
  it("awards a badge once the ledger entry count meets the threshold", async () => {
    dbMocks.state.Badge = [badge({ criteriaRules: { eventType: "STAGE_CHANGED", threshold: 3, windowDays: null } })];
    dbMocks.state.GamificationPointsLedger = [ledgerEntry({}), ledgerEntry({}), ledgerEntry({})];
    const earned = await evaluateBadgesForEvent(adminUser, USER_ID, false, "STAGE_CHANGED");
    expect(earned).toHaveLength(1);
  });

  it("does not award below the threshold", async () => {
    dbMocks.state.Badge = [badge({ criteriaRules: { eventType: "STAGE_CHANGED", threshold: 5, windowDays: null } })];
    dbMocks.state.GamificationPointsLedger = [ledgerEntry({}), ledgerEntry({})];
    const earned = await evaluateBadgesForEvent(adminUser, USER_ID, false, "STAGE_CHANGED");
    expect(earned).toHaveLength(0);
  });

  it("never double-awards the same all-time badge on a later event", async () => {
    dbMocks.state.Badge = [badge({ id: "badge-1", criteriaRules: { eventType: "STAGE_CHANGED", threshold: 3, windowDays: null } })];
    dbMocks.state.GamificationPointsLedger = [ledgerEntry({}), ledgerEntry({}), ledgerEntry({}), ledgerEntry({})];
    const firstAward = await evaluateBadgesForEvent(adminUser, USER_ID, false, "STAGE_CHANGED");
    expect(firstAward).toHaveLength(1);

    const secondAward = await evaluateBadgesForEvent(adminUser, USER_ID, false, "STAGE_CHANGED");
    expect(secondAward).toHaveLength(0); // already earned, ledger has grown past threshold again but no re-award
  });

  it("only counts ledger entries within the badge's window", async () => {
    const now = new Date("2026-06-15T00:00:00.000Z");
    dbMocks.state.Badge = [badge({ criteriaRules: { eventType: "STAGE_CHANGED", threshold: 2, windowDays: 30 } })];
    dbMocks.state.GamificationPointsLedger = [
      ledgerEntry({ createdAt: "2026-06-10T00:00:00.000Z" }), // in window
      ledgerEntry({ createdAt: "2026-06-05T00:00:00.000Z" }), // in window
      ledgerEntry({ createdAt: "2026-01-01T00:00:00.000Z" }), // outside window
    ];
    const earned = await evaluateBadgesForEvent(adminUser, USER_ID, false, "STAGE_CHANGED", now);
    expect(earned).toHaveLength(1); // exactly 2 within window meets threshold of 2
  });

  it("respects audience scope — a PARTNER-only badge doesn't fire for an internal rep", async () => {
    dbMocks.state.Badge = [badge({ audienceScope: "PARTNER", criteriaRules: { eventType: "STAGE_CHANGED", threshold: 1, windowDays: null } })];
    dbMocks.state.GamificationPointsLedger = [ledgerEntry({})];
    const earnedByRep = await evaluateBadgesForEvent(adminUser, USER_ID, false, "STAGE_CHANGED");
    expect(earnedByRep).toHaveLength(0);

    const earnedByPartner = await evaluateBadgesForEvent(adminUser, USER_ID, true, "STAGE_CHANGED");
    expect(earnedByPartner).toHaveLength(1);
  });

  it("ignores inactive badges", async () => {
    dbMocks.state.Badge = [badge({ isActive: false, criteriaRules: { eventType: "STAGE_CHANGED", threshold: 1, windowDays: null } })];
    dbMocks.state.GamificationPointsLedger = [ledgerEntry({})];
    const earned = await evaluateBadgesForEvent(adminUser, USER_ID, false, "STAGE_CHANGED");
    expect(earned).toHaveLength(0);
  });
});

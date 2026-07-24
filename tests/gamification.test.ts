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

vi.mock("@/lib/db/query", () => ({
  query: async (sql: string, params: any[] = []) => {
    if (sql.includes('from "GamificationRule"')) {
      return rows("GamificationRule")
        .filter((row) => row.tenantId === params[0])
        .filter((row) => !params[1] || row.triggerEventType === params[1])
        .filter((row) => !sql.includes('"isActive" = true') || row.isActive === true)
        .sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
    }
    if (sql.includes('from "GamificationPointsLedger"')) {
      return rows("GamificationPointsLedger")
        .filter((row) => row.tenantId === params[0])
        .filter((row) => !params[1] || row.userId === params[1])
        .filter((row) => !sql.includes('"createdAt" >=') || row.createdAt >= params[2])
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    }
    if (sql.includes('from "GamificationRedemption"')) {
      return rows("GamificationRedemption")
        .filter((row) => row.tenantId === params[0])
        .filter((row) => !sql.includes('"userId" = $2') || row.userId === params[1])
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    }
    if (sql.includes('from "User"')) {
      const userIds = params[1] ?? [];
      return rows("User").filter((row) => row.tenantId === params[0] && userIds.includes(row.id));
    }
    return [];
  },
  queryOne: async (sql: string, params: any[] = []) => {
    if (sql.includes('from "GamificationSettings"')) {
      return rows("GamificationSettings").find((row) => row.tenantId === params[0]) ?? null;
    }
    if (sql.includes('from "PartnerProfile"')) {
      return rows("PartnerProfile").find((row) => row.tenantId === params[0] && row.userId === params[1]) ?? null;
    }
    if (sql.includes('insert into "GamificationPointsLedger"')) {
      const row = {
        id: params[0],
        tenantId: params[1],
        userId: params[2],
        gamificationRuleId: params[3],
        points: params[4],
        entryType: params[5],
        sourceEntityType: params[6],
        sourceEntityId: params[7],
        triggerEvent: params[8],
        redemptionId: params[9],
        createdBy: params[10],
        createdAt: params[11],
      };
      rows("GamificationPointsLedger").push(row);
      return row;
    }
    if (sql.includes('from "GamificationPointsLedger"')) {
      return rows("GamificationPointsLedger").find((row) =>
        row.tenantId === params[0] &&
        row.userId === params[1] &&
        row.gamificationRuleId === params[2] &&
        row.sourceEntityType === params[3] &&
        row.sourceEntityId === params[4] &&
        row.triggerEvent === params[5] &&
        row.entryType === "EARNED" &&
        row.createdAt >= params[6]
      ) ?? null;
    }
    if (sql.includes('insert into "GamificationRedemption"')) {
      const row = {
        id: params[0],
        tenantId: params[1],
        userId: params[2],
        redemptionType: params[3],
        pointsRedeemed: params[4],
        monetaryAmount: params[5],
        thirdPartyProvider: params[6],
        thirdPartyReference: null,
        status: "REQUESTED",
        catalogItemKey: params[7],
        rewardName: params[8],
        notes: params[9],
        failureReason: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: params[10],
        updatedAt: params[10],
      };
      rows("GamificationRedemption").push(row);
      return row;
    }
    if (sql.includes('update "GamificationRedemption"')) {
      const row = rows("GamificationRedemption").find((candidate) => candidate.tenantId === params[5] && candidate.id === params[6]);
      if (!row) return null;
      Object.assign(row, {
        status: params[0],
        thirdPartyReference: params[1],
        failureReason: params[2],
        reviewedBy: params[3],
        reviewedAt: params[4],
        updatedAt: params[4],
      });
      return row;
    }
    if (sql.includes('from "GamificationRedemption"')) {
      return rows("GamificationRedemption").find((row) => row.tenantId === params[0] && row.id === params[1]) ?? null;
    }
    return null;
  },
  execute: async () => ({ rowCount: 0 }),
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
  automationConditionMatches: (record: Record<string, any>, config: any) => {
    const conditions = Array.isArray(config?.conditions) ? config.conditions : [];
    return conditions.every((condition: any) => {
      if (condition.operator === "equals") return record[condition.field] === condition.value;
      return true;
    });
  },
}));

vi.mock("@/lib/server/partner-access", () => ({
  userMatchesTargetingConfig: async (_tenantId: string, userId: string, config: any) =>
    !config || config.mode !== "SELECTED" || (Array.isArray(config.userIds) && config.userIds.includes(userId)),
}));

import {
  ruleMatchesAudience,
  resolveMatchingGamificationRules,
  awardPointsForEvent,
  listGamificationPointsLedgerForUser,
  getPointsBalanceForUser,
  requestGamificationRedemption,
  updateGamificationRedemptionStatus,
} from "@/lib/server/gamification";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT };
const REP_ID = "rep-1";
const PARTNER_ID = "partner-1";

let ruleCounter = 0;
function rule(overrides: Record<string, unknown>) {
  ruleCounter += 1;
  return {
    id: `rule-${ruleCounter}`,
    tenantId: TENANT,
    name: `Rule ${ruleCounter}`,
    triggerEventType: "LEAD_CREATED",
    audienceScope: "ALL",
    conditions: {},
    pointsAwarded: 10,
    priority: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  ruleCounter = 0;
  setFixtureDb({});
});

describe("ruleMatchesAudience", () => {
  it("ALL matches everyone", () => {
    expect(ruleMatchesAudience({ audienceScope: "ALL" }, true)).toBe(true);
    expect(ruleMatchesAudience({ audienceScope: "ALL" }, false)).toBe(true);
  });
  it("PARTNER matches only partners", () => {
    expect(ruleMatchesAudience({ audienceScope: "PARTNER" }, true)).toBe(true);
    expect(ruleMatchesAudience({ audienceScope: "PARTNER" }, false)).toBe(false);
  });
  it("INTERNAL matches only non-partners", () => {
    expect(ruleMatchesAudience({ audienceScope: "INTERNAL" }, false)).toBe(true);
    expect(ruleMatchesAudience({ audienceScope: "INTERNAL" }, true)).toBe(false);
  });
});

describe("resolveMatchingGamificationRules — additive, not first-match-wins", () => {
  it("returns every active matching rule, not just one (points stack)", async () => {
    setFixtureDb({
      GamificationRule: [
        rule({ triggerEventType: "LEAD_CREATED", pointsAwarded: 10 }),
        rule({ triggerEventType: "LEAD_CREATED", pointsAwarded: 5 }),
      ],
    });
    const matches = await resolveMatchingGamificationRules(TENANT, {
      triggerEventType: "LEAD_CREATED",
      isPartnerUser: false,
      record: {},
    });
    expect(matches).toHaveLength(2);
  });

  it("filters out rules for a different trigger event", async () => {
    setFixtureDb({
      GamificationRule: [rule({ triggerEventType: "OPPORTUNITY_CREATED" })],
    });
    const matches = await resolveMatchingGamificationRules(TENANT, {
      triggerEventType: "LEAD_CREATED",
      isPartnerUser: false,
      record: {},
    });
    expect(matches).toHaveLength(0);
  });

  it("filters by audience scope", async () => {
    setFixtureDb({
      GamificationRule: [
        rule({ audienceScope: "PARTNER" }),
        rule({ audienceScope: "INTERNAL" }),
        rule({ audienceScope: "ALL" }),
      ],
    });
    const forPartner = await resolveMatchingGamificationRules(TENANT, {
      triggerEventType: "LEAD_CREATED",
      isPartnerUser: true,
      record: {},
    });
    expect(forPartner).toHaveLength(2); // PARTNER + ALL

    const forRep = await resolveMatchingGamificationRules(TENANT, {
      triggerEventType: "LEAD_CREATED",
      isPartnerUser: false,
      record: {},
    });
    expect(forRep).toHaveLength(2); // INTERNAL + ALL
  });

  it("respects field-based conditions", async () => {
    setFixtureDb({
      GamificationRule: [
        rule({ conditions: { logic: "AND", conditions: [{ field: "source", operator: "equals", value: "referral" }] } }),
      ],
    });
    const matched = await resolveMatchingGamificationRules(TENANT, {
      triggerEventType: "LEAD_CREATED",
      isPartnerUser: false,
      record: { source: "referral" },
    });
    expect(matched).toHaveLength(1);

    const unmatched = await resolveMatchingGamificationRules(TENANT, {
      triggerEventType: "LEAD_CREATED",
      isPartnerUser: false,
      record: { source: "website" },
    });
    expect(unmatched).toHaveLength(0);
  });

  it("excludes inactive rules", async () => {
    setFixtureDb({ GamificationRule: [rule({ isActive: false })] });
    const matches = await resolveMatchingGamificationRules(TENANT, {
      triggerEventType: "LEAD_CREATED",
      isPartnerUser: false,
      record: {},
    });
    expect(matches).toHaveLength(0);
  });
});

describe("awardPointsForEvent — trigger-time flow", () => {
  it("resolves the record owner for LEAD/OPPORTUNITY events and writes one entry per matching rule", async () => {
    setFixtureDb({
      GamificationRule: [
        rule({ triggerEventType: "STAGE_CHANGED", pointsAwarded: 10, name: "Base" }),
        rule({ triggerEventType: "STAGE_CHANGED", pointsAwarded: 5, name: "Bonus" }),
      ],
    });

    const entries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-1", ownerId: REP_ID }, "STAGE_CHANGED");
    expect(entries).toHaveLength(2);
    expect(entries.map((e: any) => e.points).sort((a: number, b: number) => a - b)).toEqual([5, 10]);

    const balance = await getPointsBalanceForUser(adminUser, REP_ID);
    expect(balance).toBe(15);
  });

  it("resolves createdBy (not ownerId) for ACTIVITY events", async () => {
    setFixtureDb({ GamificationRule: [rule({ triggerEventType: "ACTIVITY_CREATED", pointsAwarded: 3 })] });
    await awardPointsForEvent(adminUser, "ACTIVITY", { id: "act-1", createdBy: REP_ID, ownerId: null }, "ACTIVITY_CREATED");
    const ledger = await listGamificationPointsLedgerForUser(adminUser, REP_ID);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].points).toBe(3);
  });

  it("is a no-op when there's no resolvable target user", async () => {
    setFixtureDb({ GamificationRule: [rule({ triggerEventType: "STAGE_CHANGED" })] });
    const entries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-1", ownerId: null }, "STAGE_CHANGED");
    expect(entries).toEqual([]);
  });

  it("correctly scopes points to a partner owner vs an internal rep owner", async () => {
    setFixtureDb({
      PartnerProfile: [{ id: "pp-1", tenantId: TENANT, userId: PARTNER_ID, status: "ACTIVE" }],
      GamificationRule: [
        rule({ triggerEventType: "STAGE_CHANGED", audienceScope: "PARTNER", pointsAwarded: 20, name: "Partner bonus" }),
        rule({ triggerEventType: "STAGE_CHANGED", audienceScope: "INTERNAL", pointsAwarded: 10, name: "Rep bonus" }),
      ],
    });

    const partnerEntries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-1", ownerId: PARTNER_ID }, "STAGE_CHANGED");
    expect(partnerEntries).toHaveLength(1);
    expect(partnerEntries[0].points).toBe(20);

    const repEntries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-2", ownerId: REP_ID }, "STAGE_CHANGED");
    expect(repEntries).toHaveLength(1);
    expect(repEntries[0].points).toBe(10);
  });

  it("suppresses duplicate awards inside the configured duplicate event window", async () => {
    const recent = new Date().toISOString();
    setFixtureDb({
      GamificationSettings: [
        {
          id: "settings-1",
          tenantId: TENANT,
          levels: [],
          leaderboardConfig: {},
          redemptionCatalog: [],
          antiGamingRules: { duplicateEventWindowMinutes: 30 },
        },
      ],
      GamificationRule: [rule({ id: "rule-duplicate", triggerEventType: "STAGE_CHANGED", pointsAwarded: 10 })],
      GamificationPointsLedger: [
        {
          id: "ledger-1",
          tenantId: TENANT,
          userId: REP_ID,
          gamificationRuleId: "rule-duplicate",
          points: 10,
          entryType: "EARNED",
          sourceEntityType: "OPPORTUNITY",
          sourceEntityId: "opp-1",
          triggerEvent: "STAGE_CHANGED",
          createdAt: recent,
        },
      ],
    });

    const entries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-1", ownerId: REP_ID }, "STAGE_CHANGED");
    expect(entries).toEqual([]);
    expect(await getPointsBalanceForUser(adminUser, REP_ID)).toBe(10);
  });

  it("caps awarded points at the configured daily max", async () => {
    const today = new Date().toISOString();
    setFixtureDb({
      GamificationSettings: [
        {
          id: "settings-1",
          tenantId: TENANT,
          levels: [],
          leaderboardConfig: {},
          redemptionCatalog: [],
          antiGamingRules: { maxPointsPerUserPerDay: 15 },
        },
      ],
      GamificationRule: [rule({ triggerEventType: "STAGE_CHANGED", pointsAwarded: 10 })],
      GamificationPointsLedger: [
        { id: "ledger-1", tenantId: TENANT, userId: REP_ID, points: 10, entryType: "EARNED", createdAt: today },
      ],
    });

    const entries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-1", ownerId: REP_ID }, "STAGE_CHANGED");
    expect(entries).toHaveLength(1);
    expect(entries[0].points).toBe(5);
    expect(await getPointsBalanceForUser(adminUser, REP_ID)).toBe(15);
  });

  it("skips awards for users outside the configured participant targets", async () => {
    setFixtureDb({
      GamificationSettings: [
        {
          id: "settings-1",
          tenantId: TENANT,
          levels: [],
          leaderboardConfig: {},
          redemptionCatalog: [],
          antiGamingRules: {},
          participantConfig: { mode: "SELECTED", userIds: ["eligible-rep"], teamIds: [], salesGroupIds: [], partnerOrganizationIds: [] },
        },
      ],
      GamificationRule: [rule({ triggerEventType: "STAGE_CHANGED", pointsAwarded: 10 })],
    });

    const excludedEntries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-1", ownerId: REP_ID }, "STAGE_CHANGED");
    expect(excludedEntries).toEqual([]);

    const includedEntries = await awardPointsForEvent(adminUser, "OPPORTUNITY", { id: "opp-2", ownerId: "eligible-rep" }, "STAGE_CHANGED");
    expect(includedEntries).toHaveLength(1);
    expect(includedEntries[0].points).toBe(10);
  });
});

describe("gamification redemptions", () => {
  const repUser = { id: REP_ID, tenantId: TENANT };

  it("reserves points immediately when a user requests an active catalog reward", async () => {
    setFixtureDb({
      GamificationSettings: [
        {
          id: "settings-1",
          tenantId: TENANT,
          redemptionCatalog: [
            { key: "gift-card", name: "Gift Card", rewardType: "THIRD_PARTY_REWARD", pointsCost: 100, thirdPartyProvider: "VoucherCo", isActive: true },
          ],
          levels: [],
          leaderboardConfig: {},
          antiGamingRules: {},
        },
      ],
      GamificationPointsLedger: [
        { id: "ledger-1", tenantId: TENANT, userId: REP_ID, points: 150, entryType: "EARNED", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    const redemption = await requestGamificationRedemption(repUser, { catalogItemKey: "gift-card" });
    expect(redemption.status).toBe("REQUESTED");
    expect(redemption.pointsRedeemed).toBe(100);
    expect(await getPointsBalanceForUser(repUser, REP_ID)).toBe(50);
  });

  it("rejects a redemption when the user does not have enough points", async () => {
    setFixtureDb({
      GamificationSettings: [
        {
          id: "settings-1",
          tenantId: TENANT,
          redemptionCatalog: [{ key: "cash", name: "Cash", rewardType: "MONETARY", pointsCost: 200, monetaryAmount: 100, isActive: true }],
          levels: [],
          leaderboardConfig: {},
          antiGamingRules: {},
        },
      ],
      GamificationPointsLedger: [
        { id: "ledger-1", tenantId: TENANT, userId: REP_ID, points: 150, entryType: "EARNED", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    await expect(requestGamificationRedemption(repUser, { catalogItemKey: "cash" })).rejects.toThrow("INSUFFICIENT_POINTS");
  });

  it("refunds reserved points when an admin fails a requested redemption", async () => {
    setFixtureDb({
      GamificationRedemption: [
        {
          id: "redemption-1",
          tenantId: TENANT,
          userId: REP_ID,
          redemptionType: "INTERNAL_PERK",
          pointsRedeemed: 75,
          rewardName: "Priority Parking",
          status: "REQUESTED",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      GamificationPointsLedger: [
        { id: "ledger-1", tenantId: TENANT, userId: REP_ID, points: 100, entryType: "EARNED", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "ledger-2", tenantId: TENANT, userId: REP_ID, points: -75, entryType: "REDEEMED", redemptionId: "redemption-1", createdAt: "2026-01-01T00:01:00.000Z" },
      ],
    });

    const updated = await updateGamificationRedemptionStatus(adminUser, "redemption-1", {
      status: "FAILED",
      failureReason: "Reward unavailable",
    });

    expect(updated?.status).toBe("FAILED");
    expect(await getPointsBalanceForUser(adminUser, REP_ID)).toBe(100);
  });
});

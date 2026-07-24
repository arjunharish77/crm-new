import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/access-mode", () => ({
  isPostgresMode: () => true,
}));

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
  automationConditionMatches: vi.fn(() => true),
}));

describe("direct Postgres gamification", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("awards points through Postgres rules and ledger writes", async () => {
    queryOneMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "settings-1", antiGamingRules: { maxPointsPerUserPerDay: 100 } })
      .mockResolvedValueOnce({
        id: "ledger-1",
        userId: "rep-1",
        points: 25,
        entryType: "EARNED",
      });
    queryMock
      .mockResolvedValueOnce([
        {
          id: "rule-1",
          audienceScope: "INTERNAL",
          conditions: {},
          pointsAwarded: 25,
        },
      ])
      .mockResolvedValueOnce([]);

    const { awardPointsForEvent } = await import("@/lib/server/gamification");
    const entries = await awardPointsForEvent(
      { id: "admin-1", tenantId: "tenant-1" },
      "LEAD",
      { id: "lead-1", ownerId: "rep-1" },
      "LEAD_CREATED",
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "ledger-1", points: 25 });
    expect(queryMock.mock.calls[0][0]).toContain('from "GamificationRule"');
    expect(queryOneMock.mock.calls.at(-1)?.[0]).toContain('insert into "GamificationPointsLedger"');
  });

  it("builds an individual leaderboard from Postgres ledger rows", async () => {
    queryMock
      .mockResolvedValueOnce([
        { userId: "rep-1", points: 10 },
        { userId: "rep-1", points: 5 },
        { userId: "rep-2", points: 30 },
      ])
      .mockResolvedValueOnce([
        { id: "rep-1", name: "Rep One", email: "one@example.com", teamId: "team-1" },
        { id: "rep-2", name: "Rep Two", email: "two@example.com", teamId: "team-2" },
      ]);
    queryOneMock.mockResolvedValueOnce({ id: "settings-1", participantConfig: { mode: "ALL" } });

    const { getLeaderboard } = await import("@/lib/server/leaderboard");
    const rows = await getLeaderboard({ id: "admin-1", tenantId: "tenant-1" });

    expect(rows).toEqual([
      { userId: "rep-2", name: "Rep Two", email: "two@example.com", points: 30 },
      { userId: "rep-1", name: "Rep One", email: "one@example.com", points: 15 },
    ]);
  });

  it("evaluates badges with Postgres counts and inserts the earned badge", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "badge-1",
        audienceScope: "ALL",
        criteriaRules: { eventType: "LEAD_CREATED", threshold: 2 },
      },
    ]);
    queryOneMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({
        id: "user-badge-1",
        userId: "rep-1",
        badgeId: "badge-1",
      });

    const { evaluateBadgesForEvent } = await import("@/lib/server/badges");
    const earned = await evaluateBadgesForEvent(
      { id: "admin-1", tenantId: "tenant-1" },
      "rep-1",
      false,
      "LEAD_CREATED",
      new Date("2026-07-18T00:00:00.000Z"),
    );

    expect(earned).toHaveLength(1);
    expect(earned[0]).toMatchObject({ id: "user-badge-1", badge: { id: "badge-1" } });
    expect(queryOneMock.mock.calls.at(-1)?.[0]).toContain('insert into "UserBadge"');
  });
});

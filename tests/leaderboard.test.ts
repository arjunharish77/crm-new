import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const state: {
    GamificationPointsLedger: any[];
    User: any[];
    Team: any[];
  } = {
    GamificationPointsLedger: [],
    User: [],
    Team: [],
  };

  return {
    state,
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "GamificationPointsLedger"')) {
        return state.GamificationPointsLedger.filter((entry) => {
          if (entry.tenantId !== params[0]) return false;
          if (params[1] && entry.createdAt < params[1]) return false;
          if (params[2] && entry.createdAt > params[2]) return false;
          return true;
        });
      }
      if (sql.includes('from "User"')) {
        const userIds = params[1] as string[];
        return state.User.filter((user) => userIds.includes(user.id));
      }
      if (sql.includes('from "Team"')) {
        const teamIds = params[1] as string[];
        return state.Team.filter((team) => teamIds.includes(team.id));
      }
      return [];
    }),
  };
});

vi.mock("@/lib/db/query", () => ({
  query: dbMocks.query,
}));

vi.mock("@/lib/server/gamification", () => ({
  getGamificationSettingsForTenant: vi.fn(async () => ({ participantConfig: { mode: "ALL" } })),
}));

vi.mock("@/lib/server/partner-access", () => ({
  userMatchesTargetingConfig: vi.fn(async () => true),
}));

import { getLeaderboard } from "@/lib/server/leaderboard";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT };

beforeEach(() => {
  dbMocks.state.GamificationPointsLedger = [];
  dbMocks.state.User = [];
  dbMocks.state.Team = [];
  dbMocks.query.mockClear();
});

describe("getLeaderboard — individual scope", () => {
  it("sums points per user and ranks descending", async () => {
    dbMocks.state.GamificationPointsLedger = [
      { tenantId: TENANT, userId: "u1", points: 10, createdAt: "2026-01-01T00:00:00.000Z" },
      { tenantId: TENANT, userId: "u1", points: 5, createdAt: "2026-01-02T00:00:00.000Z" },
      { tenantId: TENANT, userId: "u2", points: 30, createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    dbMocks.state.User = [
      { id: "u1", name: "Alice", email: "alice@x.com", teamId: null },
      { id: "u2", name: "Bob", email: "bob@x.com", teamId: null },
    ];

    const board = await getLeaderboard(adminUser, { scope: "INDIVIDUAL" });
    expect(board).toEqual([
      { userId: "u2", name: "Bob", email: "bob@x.com", points: 30 },
      { userId: "u1", name: "Alice", email: "alice@x.com", points: 15 },
    ]);
  });

  it("respects the from/to date range", async () => {
    dbMocks.state.GamificationPointsLedger = [
      { tenantId: TENANT, userId: "u1", points: 100, createdAt: "2025-01-01T00:00:00.000Z" }, // outside range
      { tenantId: TENANT, userId: "u1", points: 10, createdAt: "2026-06-01T00:00:00.000Z" },
    ];
    dbMocks.state.User = [{ id: "u1", name: "Alice", email: null, teamId: null }];

    const board = await getLeaderboard(adminUser, { scope: "INDIVIDUAL", from: "2026-01-01T00:00:00.000Z" });
    expect(board).toEqual([{ userId: "u1", name: "Alice", email: null, points: 10 }]);
  });

  it("returns an empty array when nobody has earned points", async () => {
    dbMocks.state.GamificationPointsLedger = [];
    expect(await getLeaderboard(adminUser, { scope: "INDIVIDUAL" })).toEqual([]);
  });
});

describe("getLeaderboard — team scope", () => {
  it("aggregates points by team, with an Unassigned bucket for users without a team", async () => {
    dbMocks.state.GamificationPointsLedger = [
      { tenantId: TENANT, userId: "u1", points: 10, createdAt: "2026-01-01T00:00:00.000Z" },
      { tenantId: TENANT, userId: "u2", points: 20, createdAt: "2026-01-01T00:00:00.000Z" },
      { tenantId: TENANT, userId: "u3", points: 5, createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    dbMocks.state.User = [
      { id: "u1", name: "Alice", teamId: "team-a" },
      { id: "u2", name: "Bob", teamId: "team-a" },
      { id: "u3", name: "Carol", teamId: null },
    ];
    dbMocks.state.Team = [{ id: "team-a", name: "Team Alpha" }];

    const board = await getLeaderboard(adminUser, { scope: "TEAM" });
    expect(board).toEqual([
      { teamId: "team-a", teamName: "Team Alpha", points: 30 },
      { teamId: "unassigned", teamName: "Unassigned", points: 5 },
    ]);
  });
});

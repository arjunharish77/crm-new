import { beforeEach, describe, expect, it, vi } from "vitest";

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards") -- Partner + Team detail pages, built per explicit user decision after
// confirming no per-record detail page existed anywhere in this codebase for either.

const dbMocks = vi.hoisted(() => {
  const state: { PartnerProfile: any[]; User: any[]; CommissionLedger: any[]; Payout: any[]; Team: any[]; TeamMember: any[] } = {
    PartnerProfile: [], User: [], CommissionLedger: [], Payout: [], Team: [], TeamMember: [],
  };
  return {
    state,
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "CommissionLedger"')) {
        const partnerIds = params[1] as string[];
        return state.CommissionLedger.filter((entry) => entry.tenantId === params[0] && partnerIds.includes(entry.partnerId));
      }
      if (sql.includes('from "Payout"')) {
        return state.Payout.filter((payout) => payout.tenantId === params[0] && payout.partnerId === params[1]);
      }
      if (sql.includes('from "User"') && sql.includes('id::text = any')) {
        const ids = params[1] as string[];
        return state.User.filter((user) => user.tenantId === params[0] && ids.includes(user.id));
      }
      if (sql.includes('from "TeamMember"')) {
        return state.TeamMember.filter((member) => member.tenantId === params[0] && member.teamId === params[1]);
      }
      return [];
    }),
    queryOne: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "PartnerProfile"')) {
        return state.PartnerProfile.find((profile) => profile.tenantId === params[0] && profile.id === params[1]) ?? null;
      }
      if (sql.includes('from "User" where "tenantId" = $1 and id = $2')) {
        return state.User.find((user) => user.tenantId === params[0] && user.id === params[1]) ?? null;
      }
      if (sql.includes('from "Team"')) {
        return state.Team.find((team) => team.tenantId === params[0] && team.id === params[1]) ?? null;
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

import { getPartnerDashboardForTenant, getPartnerProfileForTenant } from "@/lib/server/partners";
import { listPayoutsForPartnerAsAdmin } from "@/lib/server/payouts";
import { getTeamForTenant } from "@/lib/server/admin-modules";
import { getTeamPerformanceForTenant } from "@/lib/server/inbuilt-reports";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT, isTenantAdmin: true };

beforeEach(() => {
  dbMocks.state.PartnerProfile = [];
  dbMocks.state.User = [];
  dbMocks.state.CommissionLedger = [];
  dbMocks.state.Payout = [];
  dbMocks.state.Team = [];
  dbMocks.state.TeamMember = [];
  dbMocks.query.mockClear();
  dbMocks.queryOne.mockClear();
  dbMocks.execute.mockClear();
});

describe("getPartnerProfileForTenant", () => {
  it("resolves a partner profile with its embedded user", async () => {
    dbMocks.state.PartnerProfile.push({ id: "profile-1", tenantId: TENANT, userId: "user-1", legalBusinessName: "Acme Partners", status: "ACTIVE" });
    dbMocks.state.User.push({ id: "user-1", tenantId: TENANT, name: "Alice", email: "alice@example.com", status: "ACTIVE" });

    const profile = await getPartnerProfileForTenant(adminUser, "profile-1");
    expect(profile).toMatchObject({ id: "profile-1", legalBusinessName: "Acme Partners", user: { name: "Alice" } });
  });

  it("returns null for a profile that doesn't exist in this tenant", async () => {
    const profile = await getPartnerProfileForTenant(adminUser, "missing");
    expect(profile).toBeNull();
  });
});

describe("listPayoutsForPartnerAsAdmin", () => {
  it("rejects a non-admin caller", async () => {
    const result = await listPayoutsForPartnerAsAdmin({ id: "u1", tenantId: TENANT }, "user-1");
    expect(result).toEqual([]);
  });

  it("returns every payout for the exact partnerId, scoped to the caller's tenant", async () => {
    dbMocks.state.Payout.push(
      { id: "payout-1", tenantId: TENANT, partnerId: "user-1", status: "PAID", totalCommissionAmount: 500, createdAt: "2026-01-01" },
      { id: "payout-2", tenantId: TENANT, partnerId: "user-1", status: "PENDING", totalCommissionAmount: 200, createdAt: "2026-01-02" },
      { id: "payout-3", tenantId: TENANT, partnerId: "user-2", status: "PAID", totalCommissionAmount: 999, createdAt: "2026-01-01" },
      { id: "payout-4", tenantId: "other-tenant", partnerId: "user-1", status: "PAID", totalCommissionAmount: 999, createdAt: "2026-01-01" },
    );

    const result = await listPayoutsForPartnerAsAdmin(adminUser, "user-1");
    expect(result.map((p: any) => p.id).sort()).toEqual(["payout-1", "payout-2"]);
  });
});

describe("getPartnerDashboardForTenant", () => {
  it("computes totals from the partner's own commission ledger and payouts, scoped by the admin-safe payout fetch", async () => {
    dbMocks.state.PartnerProfile.push({ id: "profile-1", tenantId: TENANT, userId: "user-1", legalBusinessName: "Acme Partners", status: "ACTIVE" });
    dbMocks.state.User.push({ id: "user-1", tenantId: TENANT, name: "Alice", email: "alice@example.com", status: "ACTIVE" });
    dbMocks.state.CommissionLedger.push(
      { id: "l1", tenantId: TENANT, partnerId: "user-1", entryType: "EARNED", commissionAmount: 300, createdAt: "2026-01-02" },
      { id: "l2", tenantId: TENANT, partnerId: "user-1", entryType: "EARNED", commissionAmount: 150, createdAt: "2026-01-01" },
      { id: "l3", tenantId: TENANT, partnerId: "user-1", entryType: "REVERSED", commissionAmount: 50, createdAt: "2026-01-03" },
    );
    dbMocks.state.Payout.push(
      { id: "p1", tenantId: TENANT, partnerId: "user-1", status: "PAID", totalCommissionAmount: 400, createdAt: "2026-01-01" },
      { id: "p2", tenantId: TENANT, partnerId: "user-1", status: "PENDING", totalCommissionAmount: 50, createdAt: "2026-01-02" },
    );

    const dashboard = await getPartnerDashboardForTenant(adminUser, "profile-1");

    expect(dashboard).not.toBeNull();
    expect(dashboard!.totals).toEqual({ totalEarned: 450, totalPaid: 400, pendingPayouts: 1 });
    expect(dashboard!.recentLedgerEntries).toHaveLength(3);
    expect(dashboard!.recentPayouts).toHaveLength(2);
  });

  it("returns null for a partner profile that doesn't exist", async () => {
    const dashboard = await getPartnerDashboardForTenant(adminUser, "missing");
    expect(dashboard).toBeNull();
  });
});

describe("getTeamForTenant", () => {
  it("resolves a team with its embedded, user-joined members", async () => {
    dbMocks.state.Team.push({ id: "team-1", tenantId: TENANT, name: "Sales West", isActive: true });
    dbMocks.state.TeamMember.push({ id: "tm-1", tenantId: TENANT, teamId: "team-1", userId: "user-1", role: "Member", joinedAt: "2026-01-01" });
    dbMocks.state.User.push({ id: "user-1", tenantId: TENANT, name: "Bob", email: "bob@example.com" });

    const team = await getTeamForTenant(adminUser, "team-1");
    expect(team).toMatchObject({ id: "team-1", name: "Sales West", memberCount: 1 });
    expect(team!.members[0]).toMatchObject({ userId: "user-1", user: { name: "Bob" } });
  });

  it("returns null for a team that doesn't exist", async () => {
    const team = await getTeamForTenant(adminUser, "missing");
    expect(team).toBeNull();
  });

  it("drops a member row whose user can't be resolved (e.g. deleted since)", async () => {
    dbMocks.state.Team.push({ id: "team-1", tenantId: TENANT, name: "Sales West", isActive: true });
    dbMocks.state.TeamMember.push({ id: "tm-1", tenantId: TENANT, teamId: "team-1", userId: "ghost-user", role: "Member", joinedAt: "2026-01-01" });

    const team = await getTeamForTenant(adminUser, "team-1");
    expect(team!.members).toHaveLength(0);
    expect(team!.memberCount).toBe(0);
  });
});

describe("getTeamPerformanceForTenant", () => {
  it("filters the tenant-wide rep-performance rows down to only the given member ids, and sums their totals", async () => {
    vi.doMock("@/lib/server/crm", () => ({
      listLeadsForTenant: vi.fn(async () => ({
        data: [
          { id: "lead-1", ownerId: "user-1", source: "Website", status: "NEW", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "lead-2", ownerId: "user-2", source: "Website", status: "NEW", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "lead-3", ownerId: "user-3", source: "Website", status: "NEW", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      })),
      listOpportunitiesForTenant: vi.fn(async () => ({ data: [] })),
      listActivitiesForTenant: vi.fn(async () => ({ data: [] })),
      listOpportunityTypesForTenant: vi.fn(async () => []),
    }));
    dbMocks.state.User.push(
      { id: "user-1", tenantId: TENANT, name: "Alice", managerId: null, teamId: "team-1" },
      { id: "user-2", tenantId: TENANT, name: "Carol", managerId: null, teamId: "team-1" },
      { id: "user-3", tenantId: TENANT, name: "Dave", managerId: null, teamId: "team-2" },
    );
    dbMocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "User" where "tenantId" = $1')) {
        return dbMocks.state.User.filter((user) => user.tenantId === params[0]);
      }
      return [];
    });

    const { getTeamPerformanceForTenant: freshGetTeamPerformanceForTenant } = await import("@/lib/server/inbuilt-reports");
    const result = await freshGetTeamPerformanceForTenant(adminUser, ["user-1", "user-2"]);

    expect(result.rows.map((row) => row.repId).sort()).toEqual(["user-1", "user-2"]);
    expect(result.totals.leadsOwned).toBe(2);
    vi.doUnmock("@/lib/server/crm");
  });
});

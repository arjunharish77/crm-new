import { beforeEach, describe, expect, it, vi } from "vitest";

// F23 fix (WP11): /dashboard/admin/usage and /dashboard/admin/rate-limits previously called API
// routes that didn't exist at all, silently falling back to 0 -- indistinguishable from real
// zero usage. These test the new, real, wired-up data functions directly.
const dbMocks = vi.hoisted(() => {
  const query = vi.fn();
  const queryOne = vi.fn();
  const execute = vi.fn();
  return { query, queryOne, execute, queryAsSystem: query, queryOneAsSystem: queryOne, executeAsSystem: execute };
});
vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/repositories/auth-admin-postgres", () => ({}));
vi.mock("@/lib/server/auth", () => ({}));
vi.mock("@/lib/server/crm", () => ({ createAuditLog: vi.fn() }));
vi.mock("@/lib/server/sessions", () => ({ createUserSession: vi.fn() }));

describe("getPlatformUsageOverview", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
  });

  it("returns real, platform-wide tenant/user/data counts", async () => {
    dbMocks.query
      .mockResolvedValueOnce([{ status: "ACTIVE", count: 8 }, { status: "SUSPENDED", count: 2 }]) // tenant counts by status
      .mockResolvedValueOnce([{ tenantId: "tenant-a", count: 50 }, { tenantId: "tenant-b", count: 30 }]); // users by tenant
    dbMocks.queryOne
      .mockResolvedValueOnce({ count: 80 }) // total users
      .mockResolvedValueOnce({ count: 1200 }) // leads
      .mockResolvedValueOnce({ count: 340 }) // opportunities
      .mockResolvedValueOnce({ count: 5000 }); // activities

    const { getPlatformUsageOverview } = await import("@/lib/server/admin");
    const result = await getPlatformUsageOverview();

    expect(result).toEqual({
      tenants: { total: 10, active: 8, suspended: 2, trial: 0 },
      users: { total: 80, byTenant: [{ tenantId: "tenant-a", count: 50 }, { tenantId: "tenant-b", count: 30 }] },
      data: { leads: 1200, opportunities: 340, activities: 5000 },
    });
  });

  it("never fabricates a non-zero number when a query returns nothing", async () => {
    dbMocks.query.mockResolvedValue([]);
    dbMocks.queryOne.mockResolvedValue(null);

    const { getPlatformUsageOverview } = await import("@/lib/server/admin");
    const result = await getPlatformUsageOverview();

    expect(result.tenants).toEqual({ total: 0, active: 0, suspended: 0, trial: 0 });
    expect(result.users.total).toBe(0);
    expect(result.data).toEqual({ leads: 0, opportunities: 0, activities: 0 });
  });
});

describe("getPlatformAutomationStats", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
  });

  it("returns real execution counts and a top-rules ranking from AutomationExecution", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ count: 12 }) // totalRules
      .mockResolvedValueOnce({ count: 40 }); // last24h
    dbMocks.query
      .mockResolvedValueOnce([{ status: "COMPLETED", count: 90 }, { status: "FAILED", count: 10 }]) // execution counts by status
      .mockResolvedValueOnce([{ automationId: "auto-1", ruleName: "Welcome Email", count: 55 }]); // top rules

    const { getPlatformAutomationStats } = await import("@/lib/server/admin");
    const result = await getPlatformAutomationStats();

    expect(result).toEqual({
      totalRules: 12,
      executions: { total: 100, success: 90, failed: 10, last24h: 40 },
      topRules: [{ ruleId: "auto-1", ruleName: "Welcome Email", executionCount: 55 }],
    });
  });

  it("labels a deleted rule instead of showing a blank name", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    dbMocks.query
      .mockResolvedValueOnce([{ status: "COMPLETED", count: 1 }])
      .mockResolvedValueOnce([{ automationId: "auto-deleted", ruleName: null, count: 1 }]);

    const { getPlatformAutomationStats } = await import("@/lib/server/admin");
    const result = await getPlatformAutomationStats();

    expect(result.topRules[0].ruleName).toBe("(deleted rule)");
  });
});

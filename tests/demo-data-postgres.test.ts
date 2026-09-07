import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

const errorsMocks = vi.hoisted(() => ({
  DatabaseError: class DatabaseError extends Error {
    code?: string;
    constructor(message: string, opts?: { code?: string }) {
      super(message);
      this.code = opts?.code;
    }
  },
}));
vi.mock("@/lib/db/errors", () => errorsMocks);

const leadsMocks = vi.hoisted(() => ({ createLeadForTenant: vi.fn() }));
vi.mock("@/lib/repositories/leads-postgres", () => leadsMocks);

const opportunitiesMocks = vi.hoisted(() => ({
  createOpportunityForTenant: vi.fn(),
  listOpportunityTypesForTenant: vi.fn(),
}));
vi.mock("@/lib/repositories/opportunities-postgres", () => opportunitiesMocks);

import {
  getDemoDataStatusForTenant,
  resetDemoDataForTenant,
  seedDemoDataForTenant,
} from "@/lib/repositories/demo-data-postgres";

const TENANT_ID = "tenant-1";

// Gap checklist Module 10's "guided onboarding and demo mode" item -- "seeded demo labels" and
// "safe demo reset utilities", scoped to Lead + Opportunity.
describe("getDemoDataStatusForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("returns the demo lead and opportunity counts for the tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ count: 8 }).mockResolvedValueOnce({ count: 3 });
    const result = await getDemoDataStatusForTenant(TENANT_ID);
    expect(result).toEqual({ leadCount: 8, opportunityCount: 3 });
  });

  it("defaults to zero when nothing has been seeded yet", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const result = await getDemoDataStatusForTenant(TENANT_ID);
    expect(result).toEqual({ leadCount: 0, opportunityCount: 0 });
  });
});

describe("seedDemoDataForTenant", () => {
  beforeEach(() => {
    dbMocks.execute.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.queryOne.mockResolvedValue({ id: "owner-user-1" });
    leadsMocks.createLeadForTenant.mockReset();
    opportunitiesMocks.createOpportunityForTenant.mockReset();
    opportunitiesMocks.listOpportunityTypesForTenant.mockReset();
  });

  it("throws TENANT_HAS_NO_USERS rather than seeding with a fabricated actor when the tenant has no users", async () => {
    dbMocks.queryOne.mockReset();
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(seedDemoDataForTenant(TENANT_ID)).rejects.toThrow("TENANT_HAS_NO_USERS");
    expect(leadsMocks.createLeadForTenant).not.toHaveBeenCalled();
  });

  it("creates 8 demo leads and flags each one as demo data", async () => {
    leadsMocks.createLeadForTenant.mockImplementation(async (_user: unknown, payload: { name: string }) => ({ id: `lead-${payload.name}` }));
    opportunitiesMocks.listOpportunityTypesForTenant.mockResolvedValue([]);

    const result = await seedDemoDataForTenant(TENANT_ID);

    expect(leadsMocks.createLeadForTenant).toHaveBeenCalledTimes(8);
    expect(dbMocks.execute).toHaveBeenCalledTimes(8);
    expect(result.leadsCreated).toBe(8);
  });

  it("skips demo opportunities and gives a reason when no pipeline is configured", async () => {
    leadsMocks.createLeadForTenant.mockResolvedValue({ id: "lead-1" });
    opportunitiesMocks.listOpportunityTypesForTenant.mockResolvedValue([]);

    const result = await seedDemoDataForTenant(TENANT_ID);

    expect(result.opportunitiesCreated).toBe(0);
    expect(result.opportunitiesSkippedReason).toMatch(/no pipeline/i);
    expect(opportunitiesMocks.createOpportunityForTenant).not.toHaveBeenCalled();
  });

  it("seeds demo opportunities against the first configured pipeline's first stage", async () => {
    leadsMocks.createLeadForTenant.mockImplementation(async (_user: unknown, payload: { name: string }) => ({ id: payload.name }));
    opportunitiesMocks.listOpportunityTypesForTenant.mockResolvedValue([{ id: "type-1", stages: [{ id: "stage-1" }] }]);
    opportunitiesMocks.createOpportunityForTenant.mockResolvedValue({ id: "opp-1" });

    const result = await seedDemoDataForTenant(TENANT_ID);

    expect(opportunitiesMocks.createOpportunityForTenant).toHaveBeenCalledTimes(3);
    expect(opportunitiesMocks.createOpportunityForTenant.mock.calls[0][1]).toMatchObject({ opportunityTypeId: "type-1" });
    expect(result.opportunitiesCreated).toBe(3);
    expect(result.opportunitiesSkippedReason).toBeNull();
  });

  it("skips opportunities gracefully when the Opportunities module is disabled for the tenant", async () => {
    leadsMocks.createLeadForTenant.mockResolvedValue({ id: "lead-1" });
    opportunitiesMocks.listOpportunityTypesForTenant.mockRejectedValue(new Error("FEATURE_DISABLED:opportunityEnabled"));

    const result = await seedDemoDataForTenant(TENANT_ID);

    expect(result.leadsCreated).toBe(8);
    expect(result.opportunitiesCreated).toBe(0);
    expect(result.opportunitiesSkippedReason).toMatch(/not enabled/i);
  });
});

describe("resetDemoDataForTenant", () => {
  beforeEach(() => {
    dbMocks.execute.mockReset();
  });

  it("deletes demo opportunities before demo leads, scoped to the tenant and the demo flag", async () => {
    dbMocks.execute.mockResolvedValue(undefined);

    const result = await resetDemoDataForTenant(TENANT_ID);

    expect(result).toEqual({ ok: true });
    expect(dbMocks.execute).toHaveBeenNthCalledWith(1, expect.stringContaining('delete from "Opportunity"'), [TENANT_ID]);
    expect(dbMocks.execute).toHaveBeenNthCalledWith(2, expect.stringContaining('delete from "Lead"'), [TENANT_ID]);
  });

  it("returns a friendly, non-throwing reason when a foreign key blocks the delete", async () => {
    dbMocks.execute.mockRejectedValueOnce(new errorsMocks.DatabaseError("blocked", { code: "23503" }));

    const result = await resetDemoDataForTenant(TENANT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/real activity, tasks, or notes/i);
  });

  it("rethrows an unrelated database error rather than swallowing it", async () => {
    dbMocks.execute.mockRejectedValueOnce(new Error("connection reset"));
    await expect(resetDemoDataForTenant(TENANT_ID)).rejects.toThrow("connection reset");
  });
});

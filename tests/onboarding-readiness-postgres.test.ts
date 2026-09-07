import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

const transactionMocks = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock("@/lib/db/transaction", () => transactionMocks);

import { dismissOnboardingChecklistForTenant, getOnboardingReadinessForTenant } from "@/lib/repositories/onboarding-readiness-postgres";

const user = { id: "user-1", tenantId: "tenant-1" };

// Gap checklist Module 10's "guided onboarding and demo mode" item -- "module readiness
// checklist" / "first-run setup tasks".
describe("getOnboardingReadinessForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("throws TENANT_CONTEXT_REQUIRED when the caller has no tenant", async () => {
    await expect(getOnboardingReadinessForTenant({ id: "u1", tenantId: null })).rejects.toThrow("TENANT_CONTEXT_REQUIRED");
  });

  it("marks every item done when all counts are positive", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ count: 1 }) // pipeline
      .mockResolvedValueOnce({ count: 3 }) // users
      .mockResolvedValueOnce({ count: 10 }) // leads
      .mockResolvedValueOnce({ count: 1 }) // automations
      .mockResolvedValueOnce({ count: 0 }) // saved views
      .mockResolvedValueOnce({ count: 1 }) // communication providers
      .mockResolvedValueOnce({ featureFlags: {} }); // tenant config

    const result = await getOnboardingReadinessForTenant(user);

    expect(result.completedCount).toBe(5);
    expect(result.totalCount).toBe(5);
    expect(result.items.every((item) => item.done)).toBe(true);
    expect(result.dismissed).toBe(false);
  });

  it("marks the team item done only when more than one user exists", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 }) // only the admin -- not done
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce(null);

    const result = await getOnboardingReadinessForTenant(user);
    const teamItem = result.items.find((item) => item.key === "team");
    expect(teamItem?.done).toBe(false);
  });

  it("marks the workflow item done from EITHER automations or saved views", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 }) // automations: none
      .mockResolvedValueOnce({ count: 2 }) // saved views: some
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce(null);

    const result = await getOnboardingReadinessForTenant(user);
    const workflowItem = result.items.find((item) => item.key === "workflow");
    expect(workflowItem?.done).toBe(true);
  });

  it("reflects a dismissed flag stored in TenantConfig.featureFlags.onboarding", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ featureFlags: { onboarding: { dismissed: true } } });

    const result = await getOnboardingReadinessForTenant(user);
    expect(result.dismissed).toBe(true);
  });

  it("treats a missing TenantConfig row as not dismissed", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce(null);

    const result = await getOnboardingReadinessForTenant(user);
    expect(result.dismissed).toBe(false);
  });
});

describe("dismissOnboardingChecklistForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    transactionMocks.withTransaction.mockReset();
  });

  it("merge-patches onboarding.dismissed into an existing TenantConfig row without clobbering other feature flags", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "config-1", featureFlags: { opportunityEnabled: true } });
    const txQuery = vi.fn();
    transactionMocks.withTransaction.mockImplementation(async (_ctx: unknown, fn: (tx: { query: typeof txQuery }) => Promise<void>) => {
      await fn({ query: txQuery });
    });

    await dismissOnboardingChecklistForTenant(user);

    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('update "TenantConfig"'),
      [{ opportunityEnabled: true, onboarding: { dismissed: true } }, "tenant-1", "config-1"],
    );
  });

  it("inserts a new TenantConfig row when the tenant has none yet", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const txQuery = vi.fn();
    transactionMocks.withTransaction.mockImplementation(async (_ctx: unknown, fn: (tx: { query: typeof txQuery }) => Promise<void>) => {
      await fn({ query: txQuery });
    });

    await dismissOnboardingChecklistForTenant(user);

    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into "TenantConfig"'),
      expect.arrayContaining(["tenant-1", { onboarding: { dismissed: true } }]),
    );
  });
});

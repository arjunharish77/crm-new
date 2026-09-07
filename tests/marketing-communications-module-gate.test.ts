import { beforeEach, describe, expect, it, vi } from "vitest";

// Focused regression test for the MARKETING module-entitlement gate added this session --
// not a full campaign-lifecycle test suite (none existed for this file before), just proof
// that the four mutation/send entry points actually enforce it, matching the same real
// isModuleEnabledForTenant/TenantModuleEntitlement lookup used everywhere else this session
// (rather than mocking assertModuleEnabled directly, so this exercises the real check).

const state = vi.hoisted(() => ({
  entitlements: [] as Array<{ tenantId: string; moduleKey: string; status: string }>,
}));

function resetState() {
  state.entitlements = [];
}
resetState();

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('select status from "TenantModuleEntitlement"')) {
      return state.entitlements.find((row) => row.tenantId === params[0] && row.moduleKey === params[1]) ?? null;
    }
    return null;
  }),
  execute: vi.fn(async () => 0),
}));

const TENANT_USER = { id: "user-1", tenantId: "tenant-1" };

describe("Marketing Communications module gate", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  it("rejects creating/updating a campaign when MARKETING is disabled", async () => {
    state.entitlements.push({ tenantId: "tenant-1", moduleKey: "MARKETING", status: "DISABLED" });
    const { upsertMarketingCampaignForTenant } = await import("@/lib/server/marketing-communications");
    await expect(upsertMarketingCampaignForTenant(TENANT_USER, { name: "Spring Promo" })).rejects.toThrow("MODULE_DISABLED");
  });

  it("rejects a campaign status transition when MARKETING is disabled", async () => {
    state.entitlements.push({ tenantId: "tenant-1", moduleKey: "MARKETING", status: "SUSPENDED" });
    const { updateMarketingCampaignStatusForTenant } = await import("@/lib/server/marketing-communications");
    await expect(updateMarketingCampaignStatusForTenant(TENANT_USER, "campaign-1", "APPROVED")).rejects.toThrow("MODULE_DISABLED");
  });

  it("rejects launching a campaign when MARKETING is disabled", async () => {
    state.entitlements.push({ tenantId: "tenant-1", moduleKey: "MARKETING", status: "DISABLED" });
    const { launchMarketingCampaignForTenant } = await import("@/lib/server/marketing-communications");
    await expect(launchMarketingCampaignForTenant(TENANT_USER, "campaign-1")).rejects.toThrow("MODULE_DISABLED");
  });

  it("rejects a test send when MARKETING is disabled", async () => {
    state.entitlements.push({ tenantId: "tenant-1", moduleKey: "MARKETING", status: "DISABLED" });
    const { sendMarketingCampaignTestForTenant } = await import("@/lib/server/marketing-communications");
    await expect(sendMarketingCampaignTestForTenant(TENANT_USER, "campaign-1", "test@example.com")).rejects.toThrow("MODULE_DISABLED");
  });

  it("does not block campaign mutations when no explicit entitlement row exists (default enabled)", async () => {
    // No TenantModuleEntitlement row at all -- isModuleEnabledForTenant's "missing row ->
    // enabled" convention should let this proceed past the gate (and fail later for an
    // unrelated reason: no campaign name given).
    const { upsertMarketingCampaignForTenant } = await import("@/lib/server/marketing-communications");
    await expect(upsertMarketingCampaignForTenant(TENANT_USER, {})).rejects.toThrow("CAMPAIGN_NAME_REQUIRED");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const moduleMocks = vi.hoisted(() => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined) }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/module-entitlements", () => moduleMocks);
vi.mock("@/lib/server/crm", () => crmMocks);

import { updateMarketingCampaignStatusForTenant } from "@/lib/server/marketing-communications";

const user = { id: "user-1", tenantId: "tenant-1" };

function campaignRow(overrides: Record<string, unknown> = {}) {
  return { id: "campaign-1", tenantId: "tenant-1", name: "Spring Promo", status: "DRAFT", ...overrides };
}

// Gap checklist Module 10's "approval inbox" item, "campaign approvals" sub-item -- real bug
// found and fixed while wiring campaigns into the unified inbox: this function previously
// accepted ANY status with no transition validation, so a campaign could jump straight from
// DRAFT to RUNNING, completely bypassing PENDING_APPROVAL/APPROVED.
describe("updateMarketingCampaignStatusForTenant -- transition guard", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
  });

  it("rejects skipping straight from DRAFT to RUNNING -- previously silently allowed", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(campaignRow({ status: "DRAFT" }));
    await expect(updateMarketingCampaignStatusForTenant(user, "campaign-1", "RUNNING")).rejects.toThrow("INVALID_CAMPAIGN_TRANSITION: DRAFT -> RUNNING");
  });

  // Each call does 3 queryOne round-trips: fetch "before", the update itself, then re-fetch
  // "after" (getMarketingCampaignForTenant is called twice -- once for the existing-row guard,
  // once to return the fresh post-update row for the audit log).
  function queueTransition(fromStatus: string, toStatus: string) {
    dbMocks.queryOne
      .mockResolvedValueOnce(campaignRow({ status: fromStatus }))
      .mockResolvedValueOnce(campaignRow({ status: toStatus }))
      .mockResolvedValueOnce(campaignRow({ status: toStatus }));
  }

  it("allows the real approval path: DRAFT -> PENDING_APPROVAL -> APPROVED -> RUNNING", async () => {
    queueTransition("DRAFT", "PENDING_APPROVAL");
    await updateMarketingCampaignStatusForTenant(user, "campaign-1", "PENDING_APPROVAL");

    queueTransition("PENDING_APPROVAL", "APPROVED");
    await updateMarketingCampaignStatusForTenant(user, "campaign-1", "APPROVED");

    queueTransition("APPROVED", "RUNNING");
    await expect(updateMarketingCampaignStatusForTenant(user, "campaign-1", "RUNNING")).resolves.toBeTruthy();
  });

  it("allows a same-status no-op transition (e.g. re-invoking RUNNING while already RUNNING)", async () => {
    queueTransition("RUNNING", "RUNNING");
    await expect(updateMarketingCampaignStatusForTenant(user, "campaign-1", "RUNNING")).resolves.toBeTruthy();
  });

  it("rejects reviving a COMPLETED campaign back to RUNNING", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(campaignRow({ status: "COMPLETED" }));
    await expect(updateMarketingCampaignStatusForTenant(user, "campaign-1", "RUNNING")).rejects.toThrow("INVALID_CAMPAIGN_TRANSITION: COMPLETED -> RUNNING");
  });

  it("allows PENDING_APPROVAL -> DRAFT (sending it back for edits) and PENDING_APPROVAL -> CANCELLED (rejecting it)", async () => {
    queueTransition("PENDING_APPROVAL", "DRAFT");
    await expect(updateMarketingCampaignStatusForTenant(user, "campaign-1", "DRAFT")).resolves.toBeTruthy();

    queueTransition("PENDING_APPROVAL", "CANCELLED");
    await expect(updateMarketingCampaignStatusForTenant(user, "campaign-1", "CANCELLED")).resolves.toBeTruthy();
  });
});

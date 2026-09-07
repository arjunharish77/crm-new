import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const moduleMocks = vi.hoisted(() => ({ isModuleEnabledForTenant: vi.fn().mockResolvedValue(true) }));
const domainMocks = vi.hoisted(() => ({
  approvePayout: vi.fn().mockResolvedValue({ id: "payout-1", status: "APPROVED" }),
  updateMarketingCampaignStatusForTenant: vi.fn().mockResolvedValue({ id: "campaign-1", status: "APPROVED" }),
  setTemplateApprovalStatusForTenant: vi.fn().mockResolvedValue({ id: "template-1", approvalStatus: "APPROVED" }),
  approveExportRequest: vi.fn().mockResolvedValue({ id: "export-1", status: "QUEUED" }),
  rejectExportRequest: vi.fn().mockResolvedValue({ id: "export-1", status: "REJECTED" }),
  promoteScoringModelVersion: vi.fn().mockResolvedValue({ modelId: "model-1", modelVersionId: "version-1" }),
  approvePartnerChangeRequest: vi.fn().mockResolvedValue({ id: "request-1", status: "APPROVED" }),
  rejectPartnerChangeRequest: vi.fn().mockResolvedValue({ id: "request-1", status: "REJECTED" }),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/module-entitlements", () => moduleMocks);
vi.mock("@/lib/server/payouts", () => ({ approvePayout: domainMocks.approvePayout }));
vi.mock("@/lib/server/marketing-communications", () => ({ updateMarketingCampaignStatusForTenant: domainMocks.updateMarketingCampaignStatusForTenant }));
vi.mock("@/lib/server/communications", () => ({ setTemplateApprovalStatusForTenant: domainMocks.setTemplateApprovalStatusForTenant }));
vi.mock("@/lib/server/exports", () => ({ approveExportRequest: domainMocks.approveExportRequest, rejectExportRequest: domainMocks.rejectExportRequest }));
vi.mock("@/lib/server/self-learning-scoring", () => ({ promoteScoringModelVersion: domainMocks.promoteScoringModelVersion }));
vi.mock("@/lib/server/partner-change-requests", () => ({
  approvePartnerChangeRequest: domainMocks.approvePartnerChangeRequest,
  rejectPartnerChangeRequest: domainMocks.rejectPartnerChangeRequest,
}));

import { decideApprovalItem, listPendingApprovalsForTenant } from "@/lib/server/approval-inbox";

const adminUser = { id: "admin-1", tenantId: "tenant-1", isTenantAdmin: true };

// Gap checklist Module 10's "approval inbox" item -- a thin aggregator/dispatcher over each
// domain's own real (or, for partner changes, newly built) approve/reject logic.
describe("listPendingApprovalsForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    moduleMocks.isModuleEnabledForTenant.mockReset().mockResolvedValue(true);
  });

  it("returns an empty list with no tenant context", async () => {
    expect(await listPendingApprovalsForTenant({ id: "u1", tenantId: null })).toEqual([]);
  });

  it("aggregates pending items across every domain, sorted oldest-first", async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "Payout"')) return [{ id: "payout-1", totalCommissionAmount: 500, createdAt: "2026-01-03T00:00:00Z", partnerName: "Acme Partner" }];
      if (text.includes('from "MarketingCampaign"')) return [{ id: "campaign-1", name: "Spring Promo", channel: "EMAIL", createdAt: "2026-01-01T00:00:00Z", createdByName: "Jo" }];
      if (text.includes('from "CommunicationTemplate"')) return [];
      if (text.includes('from "ExportRequest"')) return [];
      if (text.includes('from "ScoringModelVersion"')) return [];
      if (text.includes('from "PartnerChangeRequest"')) return [];
      return [];
    });

    const result = await listPendingApprovalsForTenant(adminUser);

    expect(result.map((item) => item.entityType)).toEqual(["CAMPAIGN", "PAYOUT"]);
    expect(result[0].requestedAt < result[1].requestedAt).toBe(true);
  });

  it("skips a domain entirely when its module is disabled for the tenant", async () => {
    moduleMocks.isModuleEnabledForTenant.mockImplementation(async (_tenantId: string, moduleKey: string) => moduleKey !== "PAYOUTS");
    dbMocks.query.mockResolvedValue([{ id: "payout-1", totalCommissionAmount: 100, createdAt: "2026-01-01T00:00:00Z" }]);

    const result = await listPendingApprovalsForTenant(adminUser);

    expect(result.some((item) => item.entityType === "PAYOUT")).toBe(false);
  });

  it("does not let one domain's query failure take down the whole inbox", async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "Payout"')) throw new Error("boom");
      return [];
    });
    await expect(listPendingApprovalsForTenant(adminUser)).resolves.toEqual([]);
  });
});

describe("decideApprovalItem", () => {
  beforeEach(() => {
    Object.values(domainMocks).forEach((mock) => mock.mockClear());
  });

  it("rejects a non-admin caller before dispatching to any domain", async () => {
    await expect(decideApprovalItem({ id: "u1", tenantId: "tenant-1" }, "PAYOUT", "payout-1", "APPROVE")).rejects.toThrow("FORBIDDEN");
    expect(domainMocks.approvePayout).not.toHaveBeenCalled();
  });

  it("routes PAYOUT/APPROVE to approvePayout, and refuses REJECT (not supported)", async () => {
    await decideApprovalItem(adminUser, "PAYOUT", "payout-1", "APPROVE");
    expect(domainMocks.approvePayout).toHaveBeenCalledWith(adminUser, "payout-1");
    await expect(decideApprovalItem(adminUser, "PAYOUT", "payout-1", "REJECT")).rejects.toThrow("PAYOUT_REJECTION_NOT_SUPPORTED");
  });

  it("routes CAMPAIGN decisions to updateMarketingCampaignStatusForTenant with the right target status", async () => {
    await decideApprovalItem(adminUser, "CAMPAIGN", "campaign-1", "APPROVE");
    expect(domainMocks.updateMarketingCampaignStatusForTenant).toHaveBeenCalledWith(adminUser, "campaign-1", "APPROVED");
    await decideApprovalItem(adminUser, "CAMPAIGN", "campaign-1", "REJECT");
    expect(domainMocks.updateMarketingCampaignStatusForTenant).toHaveBeenCalledWith(adminUser, "campaign-1", "CANCELLED");
  });

  it("routes TEMPLATE decisions to setTemplateApprovalStatusForTenant", async () => {
    await decideApprovalItem(adminUser, "TEMPLATE", "template-1", "REJECT");
    expect(domainMocks.setTemplateApprovalStatusForTenant).toHaveBeenCalledWith(adminUser, "template-1", "REJECTED");
  });

  it("routes EXPORT_REQUEST decisions to the matching approve/reject function", async () => {
    await decideApprovalItem(adminUser, "EXPORT_REQUEST", "export-1", "APPROVE");
    expect(domainMocks.approveExportRequest).toHaveBeenCalledWith(adminUser, "export-1");
    await decideApprovalItem(adminUser, "EXPORT_REQUEST", "export-1", "REJECT");
    expect(domainMocks.rejectExportRequest).toHaveBeenCalledWith(adminUser, "export-1");
  });

  it("routes SCORING_MODEL_VERSION/APPROVE to promoteScoringModelVersion with the comment as reviewNotes, and refuses REJECT", async () => {
    await decideApprovalItem(adminUser, "SCORING_MODEL_VERSION", "version-1", "APPROVE", "looks good");
    expect(domainMocks.promoteScoringModelVersion).toHaveBeenCalledWith(adminUser, "version-1", { reviewNotes: "looks good" });
    await expect(decideApprovalItem(adminUser, "SCORING_MODEL_VERSION", "version-1", "REJECT")).rejects.toThrow("SCORING_MODEL_VERSION_REJECTION_NOT_SUPPORTED");
  });

  it("routes PARTNER_CHANGE_REQUEST decisions to the matching approve/reject function with the comment", async () => {
    await decideApprovalItem(adminUser, "PARTNER_CHANGE_REQUEST", "request-1", "APPROVE", "ok");
    expect(domainMocks.approvePartnerChangeRequest).toHaveBeenCalledWith(adminUser, "request-1", "ok");
    await decideApprovalItem(adminUser, "PARTNER_CHANGE_REQUEST", "request-1", "REJECT", "no");
    expect(domainMocks.rejectPartnerChangeRequest).toHaveBeenCalledWith(adminUser, "request-1", "no");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// "Recommendation surfaces... marketing campaign audience builder" (gap checklist: "NBA
// recommendation surfaces") -- confirms the audience preview attaches a real per-recipient
// pendingNbaCount (what the frontend's expandable row/NbaCountChip renders) alongside the
// tenant-wide aggregate, using the same bulk lookup the Leads list page's count-chip column
// already relies on.

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

const leadListMock = vi.hoisted(() => ({ getLeadListForTenant: vi.fn() }));
vi.mock("@/lib/repositories/lead-lists-postgres", () => leadListMock);

const leadsPostgresMocks = vi.hoisted(() => ({
  listLeadsForTenant: vi.fn(),
  getPendingNbaCountMap: vi.fn(),
}));
vi.mock("@/lib/repositories/leads-postgres", () => leadsPostgresMocks);

vi.mock("@/lib/server/crm", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/server/communications", () => ({
  queueCommunicationForTenant: vi.fn(),
  renderTemplate: vi.fn((text: string) => text),
}));
vi.mock("@/lib/server/module-entitlements", () => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined) }));

const TENANT_USER = { id: "user-1", tenantId: "tenant-1" };

describe("previewMarketingCampaignAudienceForTenant NBA attachment", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    leadListMock.getLeadListForTenant.mockReset();
    leadsPostgresMocks.listLeadsForTenant.mockReset();
    leadsPostgresMocks.getPendingNbaCountMap.mockReset();
  });

  it("attaches a per-recipient pendingNbaCount and computes the tenant-wide aggregate", async () => {
    leadListMock.getLeadListForTenant.mockResolvedValueOnce({
      leads: [
        { id: "lead-1", name: "Alice", email: "alice@example.com" },
        { id: "lead-2", name: "Bob", email: "bob@example.com" },
      ],
      count: 2,
    });
    leadsPostgresMocks.getPendingNbaCountMap.mockResolvedValueOnce(new Map([["lead-1", 3]]));

    const { previewMarketingCampaignAudienceForTenant } = await import("@/lib/server/marketing-communications");
    const preview = await previewMarketingCampaignAudienceForTenant(TENANT_USER, {
      audienceType: "LEAD_LIST",
      audienceConfig: { leadListId: "list-1" },
      channel: "EMAIL",
    });

    expect(preview.sampledLeadCount).toBe(2);
    expect(preview.recipientsWithPendingNba).toBe(1);

    const alice = preview.sample.find((item: any) => item.entityId === "lead-1");
    const bob = preview.sample.find((item: any) => item.entityId === "lead-2");
    expect(alice.pendingNbaCount).toBe(3);
    expect(bob.pendingNbaCount).toBe(0);

    expect(leadsPostgresMocks.getPendingNbaCountMap).toHaveBeenCalledWith("tenant-1", ["lead-1", "lead-2"]);
  });

  it("skips the pending-count lookup entirely when there are no LEAD-backed recipients", async () => {
    leadListMock.getLeadListForTenant.mockResolvedValueOnce({ leads: [], count: 0 });

    const { previewMarketingCampaignAudienceForTenant } = await import("@/lib/server/marketing-communications");
    const preview = await previewMarketingCampaignAudienceForTenant(TENANT_USER, {
      audienceType: "LEAD_LIST",
      audienceConfig: { leadListId: "list-1" },
      channel: "EMAIL",
    });

    expect(preview.sampledLeadCount).toBe(0);
    expect(preview.recipientsWithPendingNba).toBe(0);
    expect(leadsPostgresMocks.getPendingNbaCountMap).not.toHaveBeenCalled();
  });
});

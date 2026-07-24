import { beforeEach, describe, expect, it, vi } from "vitest";

const pgQueryMock = vi.fn();
const pgQueryOneMock = vi.fn();
const listLeadsMock = vi.fn();
const listOpportunitiesMock = vi.fn();
const listActivitiesMock = vi.fn();
const listOpportunityTypesMock = vi.fn();

vi.mock("@/lib/db/access-mode", () => ({
  isPostgresMode: () => true,
}));

vi.mock("@/lib/db/query", () => ({
  query: pgQueryMock,
  queryOne: pgQueryOneMock,
}));

vi.mock("@/lib/server/crm", () => ({
  listLeadsForTenant: listLeadsMock,
  listOpportunitiesForTenant: listOpportunitiesMock,
  listActivitiesForTenant: listActivitiesMock,
  listOpportunityTypesForTenant: listOpportunityTypesMock,
}));

describe("direct Postgres inbuilt report helper lookups", () => {
  beforeEach(() => {
    pgQueryMock.mockReset();
    pgQueryOneMock.mockReset();
    listLeadsMock.mockReset();
    listOpportunitiesMock.mockReset();
    listActivitiesMock.mockReset();
    listOpportunityTypesMock.mockReset();
  });

  it("uses direct Postgres custom fields for funnel by source campaign", async () => {
    listLeadsMock.mockResolvedValueOnce({
      data: [{ id: "lead-1", source: "Website" }],
    });
    listOpportunitiesMock.mockResolvedValueOnce({
      data: [{ id: "opp-1", leadId: "lead-1", amount: 1000, stage: { isWon: true } }],
    });
    pgQueryOneMock.mockResolvedValueOnce({ id: "field-campaign", key: "utm_campaign" });
    pgQueryMock.mockResolvedValueOnce([{ recordId: "lead-1", fieldDefinitionId: "field-campaign", valueString: "July Intake" }]);

    const { getFunnelBySourceCampaignReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getFunnelBySourceCampaignReportForTenant({ id: "user-1", tenantId: "tenant-1" });

    expect(report.campaignFieldFound).toBe(true);
    expect(report.rows[0]).toMatchObject({ source: "Website", campaign: "July Intake", leads: 1, opportunities: 1, wonOpportunities: 1 });
    expect(pgQueryOneMock.mock.calls[0][0]).toContain('from "FieldDefinition"');
    expect(pgQueryMock.mock.calls[0][0]).toContain('from "CustomFieldValue"');
  });

  it("uses direct Postgres payout inputs for commission summary", async () => {
    pgQueryMock
      .mockResolvedValueOnce([{ id: "ledger-1", partnerId: "partner-user-1", entryType: "EARNED", commissionAmount: 500 }])
      .mockResolvedValueOnce([{ id: "payout-1", partnerId: "partner-user-1", totalCommissionAmount: 400, status: "PAID" }])
      .mockResolvedValueOnce([{ id: "invoice-1", partnerId: "partner-user-1", totalAmount: 400 }])
      .mockResolvedValueOnce([{ id: "cycle-1", cycleLabel: "Jul 2026", startDate: "2026-07-01", endDate: "2026-07-31", status: "CLOSED" }])
      .mockResolvedValueOnce([{ id: "profile-1", userId: "partner-user-1", legalBusinessName: "North Admissions" }])
      .mockResolvedValueOnce([{ id: "partner-user-1", name: "Partner One", email: "partner@example.com" }]);

    const { getCommissionPayoutSummaryReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getCommissionPayoutSummaryReportForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(report.totals.earnedCommission).toBe(500);
    expect(report.totals.paidPayout).toBe(400);
    expect(report.totals.invoiceTotal).toBe(400);
    expect(report.rows[0].partnerName).toBe("North Admissions");
    expect(pgQueryMock.mock.calls[0][0]).toContain('from "CommissionLedger"');
    expect(pgQueryMock.mock.calls[4][0]).toContain('from "PartnerProfile"');
  });
});

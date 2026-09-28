import { beforeEach, describe, expect, it, vi } from "vitest";

const pgQueryMock = vi.fn();
const pgQueryOneMock = vi.fn();
const pgExecuteMock = vi.fn();
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
  execute: pgExecuteMock,
  queryAsSystem: pgQueryMock,
  queryOneAsSystem: pgQueryOneMock,
  executeAsSystem: pgExecuteMock,
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
    pgExecuteMock.mockReset();
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

  it("breaks down Next-Best-Action performance by lead source, opportunity stage, and owner team", async () => {
    pgQueryMock
      .mockResolvedValueOnce([
        { actionType: "CREATE_TASK", recordType: "LEAD", recordId: "lead-1", ownerId: "rep-1", status: "ACCEPTED" },
        { actionType: "ASSIGN_OWNER", recordType: "OPPORTUNITY", recordId: "opp-1", ownerId: "rep-2", status: "DISMISSED" },
      ]) // recommendations
      .mockResolvedValueOnce([]) // suppressionBreakdown
      .mockResolvedValueOnce([
        { id: "rep-1", name: "Rep One", email: "rep1@example.com", teamId: "team-1" },
        { id: "rep-2", name: "Rep Two", email: "rep2@example.com", teamId: "team-2" },
      ]) // owners
      .mockResolvedValueOnce([
        { id: "team-1", name: "Sales A" },
        { id: "team-2", name: "Sales B" },
      ]) // teams
      // no ruleId on either recommendation -> ruleIds is empty, rules query skipped
      .mockResolvedValueOnce([{ id: "lead-1", source: "Website" }]) // leadSources
      .mockResolvedValueOnce([{ id: "lead-1", status: "NEW" }]) // leadStatuses
      .mockResolvedValueOnce([{ id: "opp-1", stageName: "Negotiation" }]) // opportunityStages
      .mockResolvedValueOnce([{ id: "opp-1", isWon: false }]); // opportunityWonFlags

    const { getNextBestActionPerformanceReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getNextBestActionPerformanceReportForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(report.bySource).toEqual([{ source: "Website", total: 1, accepted: 1, acceptedRate: 100 }]);
    expect(report.byStage).toEqual([{ stageName: "Negotiation", total: 1, accepted: 0, acceptedRate: 0 }]);
    expect(report.byTeam).toEqual([
      { teamId: "team-1", teamName: "Sales A", total: 1, accepted: 1, acceptedRate: 100 },
      { teamId: "team-2", teamName: "Sales B", total: 1, accepted: 0, acceptedRate: 0 },
    ]);
    expect(pgQueryMock.mock.calls[4][0]).toContain('from "Lead"');
    expect(pgQueryMock.mock.calls[6][0]).toContain('from "Opportunity"');
  });

  it("returns empty breakdown buckets (not a crash) when a recommendation's record has no resolvable source/stage/team", async () => {
    pgQueryMock
      .mockResolvedValueOnce([
        { actionType: "CREATE_TASK", recordType: "LEAD", recordId: "lead-1", ownerId: null, status: "PENDING" },
      ]) // recommendations
      .mockResolvedValueOnce([]) // suppressionBreakdown
      // ownerIds is empty (ownerId null) -> owners/teams queries skipped; ruleId absent -> rules skipped
      .mockResolvedValueOnce([{ id: "lead-1", source: null }]) // leadSources
      .mockResolvedValueOnce([{ id: "lead-1", status: null }]); // leadStatuses
    // opportunityIds is empty -> opportunityStages/opportunityWonFlags queries skipped

    const { getNextBestActionPerformanceReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getNextBestActionPerformanceReportForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(report.bySource).toEqual([]);
    expect(report.byStage).toEqual([]);
    expect(report.byTeam).toEqual([]);
    expect(report.totals.totalRecommendations).toBe(1);
  });

  it("computes completion rate, byRule breakdown, action-fatigue suppression counts, and conversion/response impact", async () => {
    pgQueryMock
      .mockResolvedValueOnce([
        // Accepted-then-completed lead recommendation, on a Lead that's since converted.
        { actionType: "CREATE_TASK", recordType: "LEAD", recordId: "lead-1", ownerId: "rep-1", ruleId: "rule-1", status: "COMPLETED" },
        // Accepted-but-not-completed opportunity recommendation, on a since-won Opportunity.
        { actionType: "ASSIGN_OWNER", recordType: "OPPORTUNITY", recordId: "opp-1", ownerId: "rep-1", ruleId: "rule-2", status: "ACCEPTED" },
        // Dismissed lead recommendation, on a Lead that never converted -- part of "notAccepted"/"responded".
        { actionType: "CALL_LEAD", recordType: "LEAD", recordId: "lead-2", ownerId: "rep-1", ruleId: "rule-1", status: "DISMISSED" },
        // Still-pending recommendation -- part of "noResponse".
        { actionType: "SEND_EMAIL", recordType: "LEAD", recordId: "lead-3", ownerId: "rep-1", ruleId: "rule-1", status: "PENDING" },
      ]) // recommendations
      .mockResolvedValueOnce([
        { suppressedReason: "Channel fatigue: another communication channel was already suggested for this record recently", count: 3 },
        { suppressedReason: "Daily action cap reached for this owner", count: 1 },
      ]) // suppressionBreakdown
      .mockResolvedValueOnce([{ id: "rep-1", name: "Rep One", email: "rep1@example.com", teamId: null }]) // owners
      // teamId is null -> teams query skipped
      .mockResolvedValueOnce([
        { id: "rule-1", name: "Follow up cold leads" },
        { id: "rule-2", name: "Assign hot opportunities" },
      ]) // rules
      .mockResolvedValueOnce([
        { id: "lead-1", source: "Website" },
        { id: "lead-2", source: "Referral" },
        { id: "lead-3", source: "Website" },
      ]) // leadSources
      .mockResolvedValueOnce([
        { id: "lead-1", status: "CONVERTED" },
        { id: "lead-2", status: "NEW" },
        { id: "lead-3", status: "NEW" },
      ]) // leadStatuses
      .mockResolvedValueOnce([{ id: "opp-1", stageName: "Closed Won" }]) // opportunityStages
      .mockResolvedValueOnce([{ id: "opp-1", isWon: true }]); // opportunityWonFlags

    const { getNextBestActionPerformanceReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getNextBestActionPerformanceReportForTenant({ id: "admin-1", tenantId: "tenant-1" });

    // Completion rate: 1 of 2 accepted (COMPLETED + ACCEPTED) recommendations reached COMPLETED.
    expect(report.totals.acceptedCount).toBe(2);
    expect(report.totals.completedCount).toBe(1);
    expect(report.totals.completionRate).toBe(50);

    expect(report.byRule).toEqual(
      expect.arrayContaining([
        { ruleId: "rule-1", ruleName: "Follow up cold leads", total: 3, accepted: 1, acceptedRate: expect.closeTo(33.3, 1) },
        { ruleId: "rule-2", ruleName: "Assign hot opportunities", total: 1, accepted: 1, acceptedRate: 100 },
      ]),
    );

    expect(report.suppressionBreakdown).toEqual([
      { reason: "Channel fatigue: another communication channel was already suggested for this record recently", count: 3 },
      { reason: "Daily action cap reached for this owner", count: 1 },
    ]);

    // Conversion impact: both accepted recommendations (lead-1 COMPLETED, opp-1 ACCEPTED) sit on
    // now-converted/won records; the dismissed and pending ones don't.
    expect(report.conversionImpact.accepted).toEqual({ total: 2, convertedOrWon: 2, rate: 100 });
    expect(report.conversionImpact.notAccepted).toEqual({ total: 2, convertedOrWon: 0, rate: 0 });

    // Response impact: 3 recommendations got a definitive response (COMPLETED/ACCEPTED/DISMISSED),
    // 1 is still PENDING ("no response"). Two of the three responded-to records converted/won.
    expect(report.responseImpact.responded).toEqual({ total: 3, convertedOrWon: 2, rate: expect.closeTo(66.7, 1) });
    expect(report.responseImpact.noResponse).toEqual({ total: 1, convertedOrWon: 0, rate: 0 });
  });

  it("wires attribution touches, SLA breach counts, and opportunity stage data into the data quality report", async () => {
    listLeadsMock.mockResolvedValueOnce({ data: [{ id: "lead-1", name: "Lead 1", ownerId: "u1", updatedAt: "2026-01-01T00:00:00.000Z" }] });
    listActivitiesMock.mockResolvedValueOnce({ data: [] });
    listOpportunitiesMock.mockResolvedValueOnce({ data: [{ id: "opp-1", stageId: "stage-1", amount: null }] });
    listOpportunityTypesMock.mockResolvedValueOnce([{ id: "type-1", stages: [{ id: "stage-0", order: 0 }, { id: "stage-1", order: 1 }] }]);

    pgQueryOneMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "ObjectDefinition"')) return null;
      if (String(sql).includes('from "Task"')) return { count: 2 };
      return null;
    });
    pgQueryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "MarketingAttributionTouch"')) {
        return [{ id: "touch-1", source: null, medium: "cpc", campaign: null }];
      }
      return [];
    });

    const { getDataQualityReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getDataQualityReportForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(report.totals.invalidUtmTouches).toBe(1);
    expect(report.totals.slaBreaches).toBe(2);
    expect(report.totals.opportunitiesMissingStageRequiredFields).toBe(1);
  });

  it("persists one DataQualityScorecard row per active tenant in the scheduled scan", async () => {
    pgQueryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "Tenant"')) return [{ id: "tenant-1" }, { id: "tenant-2" }];
      return [];
    });
    pgQueryOneMock.mockResolvedValue(null);
    listLeadsMock.mockResolvedValue({ data: [] });
    listActivitiesMock.mockResolvedValue({ data: [] });
    listOpportunitiesMock.mockResolvedValue({ data: [] });
    listOpportunityTypesMock.mockResolvedValue([]);

    const { runScheduledDataQualityScan } = await import("@/lib/server/inbuilt-reports");
    const results = await runScheduledDataQualityScan(10);

    expect(results.map((r) => r.tenantId)).toEqual(["tenant-1", "tenant-2"]);
    expect(pgExecuteMock).toHaveBeenCalledTimes(2);
    expect(pgExecuteMock.mock.calls[0][0]).toContain('insert into "DataQualityScorecard"');
    expect(pgExecuteMock.mock.calls[0][1][1]).toBe("tenant-1");
    expect(pgExecuteMock.mock.calls[1][1][1]).toBe("tenant-2");
  });

  // Real bug found while verifying WP10 (F18) against a real running worker: node-postgres
  // serializes a plain object query parameter as JSON automatically, but a plain ARRAY parameter
  // is instead converted to a Postgres array literal ("{...,...}") -- not valid JSON syntax --
  // which a jsonb column rejects with "invalid input syntax for type json". report.issues is an
  // array, so the insert must JSON.stringify it explicitly (confirmed against real Postgres:
  // the un-stringified array param reproduces the exact error; JSON.stringify fixes it).
  it("JSON-stringifies the issues array before inserting into the jsonb column (real Postgres would otherwise reject it)", async () => {
    pgQueryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "Tenant"')) return [{ id: "tenant-1" }];
      return [];
    });
    pgQueryOneMock.mockResolvedValue(null);
    listLeadsMock.mockResolvedValue({
      data: [{ id: "seed-lead-duplicate-a", email: "dup@example.com" }, { id: "seed-lead-duplicate-b", email: "dup@example.com" }],
    });
    listActivitiesMock.mockResolvedValue({ data: [] });
    listOpportunitiesMock.mockResolvedValue({ data: [] });
    listOpportunityTypesMock.mockResolvedValue([]);

    const { runScheduledDataQualityScan } = await import("@/lib/server/inbuilt-reports");
    await runScheduledDataQualityScan(10);

    const issuesParam = pgExecuteMock.mock.calls[0][1][5];
    expect(typeof issuesParam).toBe("string");
    expect(() => JSON.parse(issuesParam)).not.toThrow();
    expect(JSON.parse(issuesParam)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "duplicate_email" })]));
  });

  it("lists persisted scorecard history newest-first for a tenant", async () => {
    pgQueryMock.mockResolvedValueOnce([
      { id: "scorecard-2", generatedAt: "2026-01-02T00:00:00.000Z", staleDays: 30, totals: {}, issues: [] },
      { id: "scorecard-1", generatedAt: "2026-01-01T00:00:00.000Z", staleDays: 30, totals: {}, issues: [] },
    ]);

    const { listDataQualityScorecardHistoryForTenant } = await import("@/lib/server/inbuilt-reports");
    const history = await listDataQualityScorecardHistoryForTenant({ id: "admin-1", tenantId: "tenant-1" }, 5);

    expect(history.map((row) => row.id)).toEqual(["scorecard-2", "scorecard-1"]);
    expect(pgQueryMock.mock.calls[0][0]).toContain('from "DataQualityScorecard"');
    expect(pgQueryMock.mock.calls[0][1]).toEqual(["tenant-1", 5]);
  });

  it("fetches call logs and users, then computes telephony call performance", async () => {
    pgQueryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TelephonyCallLog"')) {
        return [
          { id: "log-1", provider: "twilio", direction: "OUTBOUND", status: "completed", duration: 90, agentId: "agent-1" },
          { id: "log-2", provider: "twilio", direction: "INBOUND", status: "missed", duration: null, agentId: "agent-1" },
        ];
      }
      if (text.includes('from "User"')) return [{ id: "agent-1", name: "Rep One", email: "rep1@example.com" }];
      return [];
    });

    const { getTelephonyCallPerformanceReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getTelephonyCallPerformanceReportForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(report.totals.totalCalls).toBe(2);
    expect(report.totals.answered).toBe(1);
    expect(report.byAgent[0]).toMatchObject({ agentId: "agent-1", agentName: "Rep One", totalCalls: 2 });
  });

  it("returns an empty telephony report without querying when there is no tenant", async () => {
    const { getTelephonyCallPerformanceReportForTenant } = await import("@/lib/server/inbuilt-reports");
    const report = await getTelephonyCallPerformanceReportForTenant({ id: "admin-1", tenantId: null });

    expect(report.totals.totalCalls).toBe(0);
    expect(pgQueryMock).not.toHaveBeenCalled();
  });

  describe("cohort explorer SALES_GROUP dimension (gap checklist Module 17, item 8)", () => {
    it("buckets leads by their owner's sales group, falling back to 'No Sales Group' for an unassigned owner", async () => {
      listLeadsMock.mockResolvedValueOnce({
        data: [
          { id: "lead-1", createdAt: "2026-01-01T00:00:00.000Z", ownerId: "user-1" },
          { id: "lead-2", createdAt: "2026-01-02T00:00:00.000Z", ownerId: "user-2" },
          { id: "lead-3", createdAt: "2026-01-03T00:00:00.000Z", ownerId: null },
        ],
      });
      listOpportunitiesMock.mockResolvedValueOnce({ data: [] });
      listOpportunityTypesMock.mockResolvedValueOnce([]);
      pgQueryMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "SalesGroupMember"')) {
          return [
            { userId: "user-1", groupId: "group-1" },
            { userId: "user-2", groupId: "group-2" },
          ];
        }
        if (text.includes('from "SalesGroup"')) {
          return [
            { id: "group-1", name: "Enterprise" },
            { id: "group-2", name: "SMB" },
          ];
        }
        return [];
      });

      const { getCohortReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getCohortReportForTenant({ id: "admin-1", tenantId: "tenant-1" }, "month", "SALES_GROUP");

      expect(report.dimension).toBe("SALES_GROUP");
      expect(report.rows.map((row) => ({ label: row.cohortLabel, leads: row.leads }))).toEqual(
        expect.arrayContaining([
          { label: "Enterprise", leads: 1 },
          { label: "SMB", leads: 1 },
          { label: "No Sales Group", leads: 1 },
        ]),
      );
    });
  });

  describe("funnel explorer PARTNER segment dimension (gap checklist Module 17, item 8)", () => {
    it("resolves partner name via CommissionLedger.partnerId -> User/PartnerProfile, falling back to 'No Partner' when no commission entry exists", async () => {
      listLeadsMock.mockResolvedValueOnce({ data: [] });
      listOpportunitiesMock.mockResolvedValueOnce({
        data: [
          { id: "opp-1", createdAt: "2026-01-01T00:00:00.000Z", stage: { isWon: true } },
          { id: "opp-2", createdAt: "2026-01-02T00:00:00.000Z", stage: { isWon: false, isClosed: true } },
        ],
      });
      listOpportunityTypesMock.mockResolvedValueOnce([]);
      pgQueryMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "User" where "tenantId"')) return []; // listTenantUsers
        if (text.includes('from "CommissionLedger"')) {
          return [{ opportunityId: "opp-1", partnerName: "Acme Partners LLC" }];
        }
        return []; // OpportunityStageHistory / CallDisposition
      });

      const { getFunnelExplorerForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getFunnelExplorerForTenant({ id: "admin-1", tenantId: "tenant-1" }, "PARTNER");

      expect(report.segmentDimension).toBe("PARTNER");
      expect(report.segments).toEqual(
        expect.arrayContaining([
          { segment: "Acme Partners LLC", totalOpportunities: 1, wonCount: 1, wonRate: 1 },
          { segment: "No Partner", totalOpportunities: 1, wonCount: 0, wonRate: 0 },
        ]),
      );
    });
  });

  describe("sensitive report access (gap checklist Module 17, item 17)", () => {
    it("rejects a non-admin, non-platform-admin user before ever querying lead source ROI data", async () => {
      const { getLeadSourceRoiReportForTenant } = await import("@/lib/server/inbuilt-reports");
      await expect(
        getLeadSourceRoiReportForTenant({ id: "rep-1", tenantId: "tenant-1", role: { permissions: { modules: {}, recordAccess: "OWN" } } })
      ).rejects.toThrow("SENSITIVE_REPORT_ACCESS_DENIED");
      expect(listLeadsMock).not.toHaveBeenCalled();
      expect(pgQueryMock).not.toHaveBeenCalled();
    });

    it("allows a tenant admin (recordAccess ALL) through", async () => {
      // WP09 (F11): getLeadSourceRoiReportForTenant now runs its own real SQL aggregate queries
      // (getLeadSourceRoiAggregateForTenant) directly against "@/lib/db/query", not
      // listLeadsForTenant/listOpportunitiesForTenant -- two `query` calls (lead-source counts,
      // then the opportunity/lead join), both empty for this "no data" case.
      pgQueryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const { getLeadSourceRoiReportForTenant } = await import("@/lib/server/inbuilt-reports");
      await expect(
        getLeadSourceRoiReportForTenant({ id: "admin-1", tenantId: "tenant-1", role: { permissions: { modules: {}, recordAccess: "ALL" } } })
      ).resolves.toBeTruthy();
    });

    it("allows a platform admin through regardless of role permissions", async () => {
      pgQueryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const { getLeadSourceRoiReportForTenant } = await import("@/lib/server/inbuilt-reports");
      await expect(getLeadSourceRoiReportForTenant({ id: "pa-1", tenantId: "tenant-1", isPlatformAdmin: true })).resolves.toBeTruthy();
    });
  });

  // Gap checklist Module 17, item 8 ("segmentation and comparison tools" -- the bullet's own
  // core remaining gap: a genuine two-arbitrary-segment diff tool).
  describe("segment comparison (gap checklist Module 17, item 8)", () => {
    const user = { id: "user-1", tenantId: "tenant-1" };

    it("compares a LEAD segment against an OPPORTUNITY segment on a different dimension", async () => {
      listLeadsMock.mockResolvedValueOnce({
        data: [
          { id: "lead-1", source: "Website" },
          { id: "lead-2", source: "Referral" },
        ],
      });
      listOpportunitiesMock.mockResolvedValueOnce({
        data: [
          { id: "opp-1", leadId: "lead-1", amount: 1000, stage: { name: "Enrolled", isWon: true } },
          { id: "opp-2", leadId: "lead-2", amount: 500, stage: { name: "Application", isWon: false } },
        ],
      });
      listOpportunityTypesMock.mockResolvedValueOnce([]);
      pgQueryMock.mockResolvedValue([]); // listTenantUsers

      const { getSegmentComparisonReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const result = await getSegmentComparisonReportForTenant(
        user,
        { level: "LEAD", dimension: "SOURCE", value: "Website" },
        { level: "OPPORTUNITY", dimension: "STAGE", value: "Enrolled" },
      );

      expect(result.segments[0]).toMatchObject({
        level: "LEAD", dimension: "SOURCE", value: "Website",
        recordCount: 1, wonCount: 1, wonRate: 1, avgDealValue: 1000,
      });
      expect(result.segments[1]).toMatchObject({
        level: "OPPORTUNITY", dimension: "STAGE", value: "Enrolled",
        recordCount: 1, wonCount: 1, wonRate: 1, avgDealValue: 1000,
      });
    });

    it("returns null wonRate/avgDealValue (not a divide-by-zero) when a segment matches no records", async () => {
      listLeadsMock.mockResolvedValueOnce({ data: [{ id: "lead-1", source: "Website" }] });
      listOpportunitiesMock.mockResolvedValueOnce({ data: [] });
      listOpportunityTypesMock.mockResolvedValueOnce([]);
      pgQueryMock.mockResolvedValue([]);

      const { getSegmentComparisonReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const result = await getSegmentComparisonReportForTenant(
        user,
        { level: "LEAD", dimension: "SOURCE", value: "Nonexistent Source" },
        { level: "LEAD", dimension: "SOURCE", value: "Website" },
      );

      expect(result.segments[0]).toMatchObject({ recordCount: 0, wonCount: 0, wonRate: null, avgDealValue: null });
      expect(result.segments[1]).toMatchObject({ recordCount: 1, wonCount: 0, wonRate: 0, avgDealValue: null });
    });

    it("rejects a dimension that isn't valid for the given level", async () => {
      listLeadsMock.mockResolvedValueOnce({ data: [] });
      listOpportunitiesMock.mockResolvedValueOnce({ data: [] });
      listOpportunityTypesMock.mockResolvedValueOnce([]);
      pgQueryMock.mockResolvedValue([]);

      const { getSegmentComparisonReportForTenant } = await import("@/lib/server/inbuilt-reports");
      await expect(
        getSegmentComparisonReportForTenant(
          user,
          { level: "LEAD", dimension: "STAGE", value: "Enrolled" }, // STAGE is an OPPORTUNITY-only dimension
          { level: "OPPORTUNITY", dimension: "STAGE", value: "Enrolled" },
        ),
      ).rejects.toThrow("Unsupported lead comparison dimension");
    });
  });

  // WP09 (F11): these three reports were rewritten from "fetch up to 1000 leads/opportunities
  // tenant-wide, reduce in JS" to real SQL aggregation over the FULL matching set (see
  // 25_AUDIT_REMEDIATION_PLAN.md WP09 tracking record). These tests confirm the wrapper functions
  // now call the new aggregate repository functions (real SQL group-by/count/sum queries)
  // instead of listLeadsForTenant/listOpportunitiesForTenant -- the real Postgres-scale
  // verification (>1000 rows, old-vs-new comparison) was run separately against a live local
  // Postgres database, not as part of this mocked suite.
  describe("WP09 (F11) SQL-aggregation rewrites", () => {
    it("getFunnelByStageReportForTenant aggregates via SQL (group by stageId), not listOpportunitiesForTenant", async () => {
      pgQueryMock.mockResolvedValueOnce([
        { stageId: "stage-new", stage: "New", count: 3, value: 300, isWon: false, isClosed: false, order: 0 },
        { stageId: "stage-won", stage: "Won", count: 2, value: 400, isWon: true, isClosed: true, order: 1 },
      ]);

      const { getFunnelByStageReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getFunnelByStageReportForTenant({ id: "user-1", tenantId: "tenant-1" });

      expect(report.totalOpportunities).toBe(5);
      expect(report.totalValue).toBe(700);
      expect(report.rows[0]).toMatchObject({ stageId: "stage-new", count: 3, conversionFromFirst: 1 });
      expect(report.rows[1]).toMatchObject({ stageId: "stage-won", count: 2, conversionFromFirst: 2 / 3, conversionFromPrevious: 2 / 3 });
      // Never touches the old capped list-then-reduce path.
      expect(listOpportunitiesMock).not.toHaveBeenCalled();
      expect(pgQueryMock.mock.calls[0][0]).toContain("with scoped_opportunities as");
      expect(pgQueryMock.mock.calls[0][0]).toContain('group by o."stageId"');
    });

    it("getLeadSourceRoiReportForTenant aggregates via SQL joins, not listLeadsForTenant/listOpportunitiesForTenant", async () => {
      pgQueryMock
        .mockResolvedValueOnce([{ source: "Website", leads: 10 }])
        .mockResolvedValueOnce([{ source: "Website", opportunities: 4, pipelineValue: 4000, wonOpportunities: 1, wonValue: 1000 }]);

      const { getLeadSourceRoiReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getLeadSourceRoiReportForTenant({ id: "admin-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(report.rows).toEqual([
        {
          source: "Website",
          leads: 10,
          opportunities: 4,
          wonOpportunities: 1,
          pipelineValue: 4000,
          wonValue: 1000,
          spend: null,
          roi: null,
          opportunityConversionRate: 0.4,
          wonConversionRate: 0.1,
        },
      ]);
      expect(listLeadsMock).not.toHaveBeenCalled();
      expect(listOpportunitiesMock).not.toHaveBeenCalled();
      expect(pgQueryMock.mock.calls[0][0]).toContain("group by source");
      expect(pgQueryMock.mock.calls[1][0]).toContain("with scoped_opportunities as");
    });

    it("getPeriodComparisonReportForTenant aggregates via SQL count/sum filter queries, not a capped fetch-then-JS-filter", async () => {
      pgQueryOneMock
        .mockResolvedValueOnce({ current: 5, previous: 20 }) // leads
        .mockResolvedValueOnce({
          currentCount: 3,
          previousCount: 10,
          currentWonCount: 1,
          previousWonCount: 4,
          currentWonValue: 500,
          previousWonValue: 2000,
        }); // opportunities

      const { getPeriodComparisonReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getPeriodComparisonReportForTenant({ id: "user-1", tenantId: "tenant-1" }, "THIS_MONTH_VS_LAST");

      expect(report.current).toMatchObject({ leadsCreated: 5, opportunitiesCreated: 3, opportunitiesWon: 1, wonValue: 500, winRate: 0.3333 });
      expect(report.previous).toMatchObject({ leadsCreated: 20, opportunitiesCreated: 10, opportunitiesWon: 4, wonValue: 2000, winRate: 0.4 });
      expect(report.percentChange.leadsCreated).toBe(-75);
      // Never touches the old capped list-then-reduce path.
      expect(listLeadsMock).not.toHaveBeenCalled();
      expect(listOpportunitiesMock).not.toHaveBeenCalled();
      expect(pgQueryOneMock.mock.calls[0][0]).toContain("count(*) filter");
      expect(pgQueryOneMock.mock.calls[1][0]).toContain("with scoped_opportunities as");
    });
  });

  describe("anomaly detection (gap checklist Module 17, item 9)", () => {
    it("computes a real report end to end, wiring all 7 domains through the shared rolling-baseline method", async () => {
      const today = new Date().toISOString().slice(0, 10);
      pgQueryMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "Lead"')) return [{ day: today, value: "100" }]; // spike vs. an otherwise-empty (0) baseline
        if (text.includes('from "OpportunityStageHistory"')) return [];
        if (text.includes('from "Activity"')) return [];
        if (text.includes('from "CommissionLedger"')) return [];
        if (text.includes('from "MarketingAttributionTouch"')) return [];
        if (text.includes('from "RecordScore"')) return [];
        if (text.includes('from "Case"')) return [];
        return [];
      });

      const { getAnomalyDetectionReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getAnomalyDetectionReportForTenant({ id: "user-1", tenantId: "tenant-1" });

      expect(report.windowDays).toBe(15);
      expect(report.domains.map((d: any) => d.domain)).toEqual([
        "LEAD_VOLUME", "CONVERSIONS", "SLA_BREACHES", "PAYOUT_AMOUNT", "CAMPAIGN_PERFORMANCE", "SCORING_DRIFT", "SERVICE_BACKLOG",
      ]);
      const leadVolume = report.domains.find((d: any) => d.domain === "LEAD_VOLUME");
      expect(leadVolume).toMatchObject({ isAnomaly: true, direction: "SPIKE", latestValue: 100 });
      for (const domain of report.domains.filter((d: any) => d.domain !== "LEAD_VOLUME")) {
        expect(domain.isAnomaly).toBe(false);
      }
    });

    it("returns an empty report for a user with no tenant, without querying the database", async () => {
      const { getAnomalyDetectionReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getAnomalyDetectionReportForTenant({ id: "user-1", tenantId: null });
      expect(report.domains).toEqual([]);
      expect(pgQueryMock).not.toHaveBeenCalled();
    });
  });

  describe("forecasting-lite (gap checklist Module 17, item 10)", () => {
    it("computes a real report end to end, wiring all 4 domains through the shared linear-trend method", async () => {
      pgQueryMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "MarketingAttributionTouch"')) return [];
        if (text.includes('from "Task"') && text.includes('"completedAt" is not null')) return [];
        if (text.includes('from "Task"')) return [];
        if (text.includes('from "Activity"')) return [];
        if (text.includes('from "CommissionLedger"')) return [];
        return [];
      });

      const { getForecastReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getForecastReportForTenant({ id: "user-1", tenantId: "tenant-1" });

      expect(report.historyDays).toBe(30);
      expect(report.horizonDays).toBe(7);
      expect(report.domains.map((d: any) => d.domain)).toEqual([
        "CAMPAIGN_VOLUME", "TASK_BACKLOG", "SLA_BREACH_RISK", "PARTNER_PAYOUT_PROJECTION",
      ]);
      for (const domain of report.domains) {
        expect(domain.history).toHaveLength(30);
        expect(domain.forecast).toHaveLength(7);
      }
    });

    it("returns an empty report for a user with no tenant, without querying the database", async () => {
      const { getForecastReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getForecastReportForTenant({ id: "user-1", tenantId: null });
      expect(report.domains).toEqual([]);
      expect(pgQueryMock).not.toHaveBeenCalled();
    });
  });

  describe("executive scorecard (gap checklist Module 17, item 12)", () => {
    it("aggregates all 8 buildable areas into one report for a tenant admin, without fabricating data for an all-empty tenant", async () => {
      listLeadsMock.mockResolvedValue({ data: [] });
      listOpportunitiesMock.mockResolvedValue({ data: [] });
      listActivitiesMock.mockResolvedValue({ data: [] });
      listOpportunityTypesMock.mockResolvedValue([]);
      pgQueryMock.mockResolvedValue([]); // blanket default: every raw fetch across all 6 sub-reports comes back empty

      const { getExecutiveScorecardReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getExecutiveScorecardReportForTenant({ id: "admin-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(report.sections.map((s: any) => s.key)).toEqual([
        "marketing_roi", "counselor_productivity", "partner_performance", "payout_exposure",
        "scoring_quality", "service_case_sla", "telephony_performance", "data_quality",
      ]);
      const marketingRoi = report.sections.find((s: any) => s.key === "marketing_roi");
      expect(marketingRoi?.metrics).toContainEqual({ label: "Journeys tracked", value: 0 });
    });

    it("rejects a non-admin -- this is sensitive, leadership-level data, gated the same way campaign_roi already is", async () => {
      const { getExecutiveScorecardReportForTenant } = await import("@/lib/server/inbuilt-reports");
      await expect(
        getExecutiveScorecardReportForTenant({ id: "rep-1", tenantId: "tenant-1", role: { permissions: { modules: {}, recordAccess: "OWN" } } }),
      ).rejects.toThrow("SENSITIVE_REPORT_ACCESS_DENIED");
    });

    it("returns an empty report for a user with no tenant", async () => {
      const { getExecutiveScorecardReportForTenant } = await import("@/lib/server/inbuilt-reports");
      const report = await getExecutiveScorecardReportForTenant({ id: "admin-1", tenantId: null, isPlatformAdmin: true });
      expect(report.sections).toEqual([]);
    });
  });
});

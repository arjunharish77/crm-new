// Business-data tests use an enabled catalog; combined gate behavior is tested separately.
vi.mock("@/lib/server/module-entitlements", () => ({isModuleEnabledForTenant:vi.fn().mockResolvedValue(true)}));
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/db/access-mode", () => ({
  isPostgresMode: () => true,
}));

describe("direct Postgres reports and dashboards", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists dashboard widgets scoped to the current user and tenant", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "widget-1",
        title: "My Leads",
        type: "STAT",
        config: { module: "LEADS" },
        w: 1,
        h: 1,
        x: 0,
        y: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const { listDashboardWidgetsForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    const result = await listDashboardWidgetsForTenant({ id: "user-1", tenantId: "tenant-1" });

    expect(result[0].layout).toEqual({ w: 1, h: 1, x: 0, y: 0 });
    expect(queryMock.mock.calls[0][0]).toContain('"userId" = $1');
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $2');
    expect(queryMock.mock.calls[0][1]).toEqual(["user-1", "tenant-1"]);
  });

  describe("dashboard sharing (gap checklist Module 17, item 3)", () => {
    it("lists private widgets plus TENANT- and same-team TEAM-shared widgets, not other teams' shared widgets", async () => {
      queryMock.mockResolvedValueOnce([
        { id: "widget-own", title: "Mine", type: "STAT", config: {}, w: 1, h: 1, x: 0, y: 0, visibility: "PRIVATE", sharedWithTeamId: null, userId: "user-1", createdAt: "t", updatedAt: "t" },
        { id: "widget-tenant", title: "Everyone", type: "STAT", config: {}, w: 1, h: 1, x: 0, y: 0, visibility: "TENANT", sharedWithTeamId: null, userId: "user-2", createdAt: "t", updatedAt: "t" },
      ]);

      const { listDashboardWidgetsForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
      const result = await listDashboardWidgetsForTenant({ id: "user-1", tenantId: "tenant-1" });

      expect(queryMock.mock.calls[0][0]).toContain("visibility = 'TENANT'");
      expect(queryMock.mock.calls[0][0]).toContain("visibility = 'TEAM'");
      // The mocked rows simulate what the SQL's own OR-clause would have already filtered --
      // this test verifies the query shape and the isOwner mapping, not the SQL engine itself.
      expect(result).toHaveLength(2);
      expect(result.find((w: any) => w.id === "widget-own")).toMatchObject({ isOwner: true });
      expect(result.find((w: any) => w.id === "widget-tenant")).toMatchObject({ isOwner: false, visibility: "TENANT" });
    });

    it("creates a TEAM-shared widget with the given sharedWithTeamId, and clears it for PRIVATE/TENANT visibility", async () => {
      queryOneMock.mockReset();
      queryOneMock
        .mockResolvedValueOnce({
          id: "widget-1",
          title: "Team View",
          type: "STAT",
          config: {},
          w: 1,
          h: 1,
          x: 0,
          y: 0,
          visibility: "TEAM",
          sharedWithTeamId: "team-1",
          userId: "user-1",
          createdAt: "t",
          updatedAt: "t",
        });

      const { createDashboardWidgetForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
      const widget = await createDashboardWidgetForTenant(
        { id: "user-1", tenantId: "tenant-1" },
        { title: "Team View", type: "STAT", config: {}, visibility: "TEAM", sharedWithTeamId: "team-1" },
      );

      expect(widget.visibility).toBe("TEAM");
      expect(widget.sharedWithTeamId).toBe("team-1");
      expect(widget.isOwner).toBe(true);
      const insertParams = queryOneMock.mock.calls[0][1];
      expect(insertParams).toContain("TEAM");
      expect(insertParams).toContain("team-1");
    });

    it("fetches a shared widget for a non-owner viewer (backing the widget-data route)", async () => {
      queryOneMock.mockReset();
      queryOneMock.mockResolvedValueOnce({
        id: "widget-1",
        title: "Everyone",
        type: "STAT",
        config: {},
        w: 1,
        h: 1,
        x: 0,
        y: 0,
        visibility: "TENANT",
        sharedWithTeamId: null,
        userId: "user-2",
        createdAt: "t",
        updatedAt: "t",
      });

      const { getDashboardWidgetForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
      const widget = await getDashboardWidgetForTenant({ id: "user-1", tenantId: "tenant-1" }, "widget-1");

      expect(widget).toMatchObject({ isOwner: false, visibility: "TENANT" });
      expect(queryOneMock.mock.calls[0][0]).toContain("visibility = 'TENANT'");
    });
  });

  it("creates custom reports without allowing saved-view records through this path", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('insert into "CustomReport"')) {
        return {
          id: "report-1",
          name: "Admissions Conversion",
          description: null,
          module: "LEADS",
          config: { queryDefinition: { root: "lead", fields: [{ object: "lead", field: "source" }] } },
          chartType: "TABLE",
          isPublic: false,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      }
      return null;
    });

    const { createCustomReportForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    const result = await createCustomReportForTenant(
      { id: "user-1", tenantId: "tenant-1" },
      { name: " Admissions Conversion ", module: "leads", config: { queryDefinition: { root: "lead", fields: [{ object: "lead", field: "source" }] } } },
    );

    expect(result.id).toBe("report-1");
    const insertCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "CustomReport"'));
    expect(insertCall).toBeTruthy();
    expect(insertCall![1][4]).toBe("LEADS");
    expect(insertCall![1][6]).toBe("TABLE");
  });

  it("filters and sorts Postgres Date values alongside serialized dates", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "before", name: "Before", createdAt: new Date("2025-12-31T00:00:00Z") },
      { id: "early", name: "Early", createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "late", name: "Late", createdAt: "2026-02-01T00:00:00Z" },
    ]).mockResolvedValue([]);
    const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
    const result = await executeReportQueryForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } },
      { root: "lead", fields: [{ object: "lead", field: "name" }],
        filters: [{ object: "lead", field: "createdAt", operator: "gte", value: "2026-01-01" }],
        orderBy: { object: "lead", field: "createdAt", direction: "desc" } },
    );
    expect(result.rows).toEqual([{ "lead.name": "Late" }, { "lead.name": "Early" }]);
  });

  it("executes structured report queries from direct Postgres datasets", async () => {
    queryMock
      .mockResolvedValueOnce([
        { id: "lead-1", name: "Alpha", email: "alpha@example.com", source: "Website", status: "NEW", ownerId: "user-1" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
    const result = await executeReportQueryForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } },
      {
        root: "lead",
        fields: [{ object: "lead", field: "name", label: "Lead Name" }],
        filters: [{ object: "lead", field: "source", operator: "equals", value: "Website" }],
      },
    );

    expect(result.columns[0].label).toBe("Lead Name");
    expect(result.rows).toEqual([{ "lead.name": "Alpha" }]);
    expect(queryMock.mock.calls[0][0]).toContain('from "Lead"');
    // F03 fix (WP04): OWN and TEAM scope now share one code path (a resolved list of visible
    // owner ids), so even a single-id OWN scope renders as "= any(...)" rather than bare "=".
    expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = any($2::text[])');
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", ["user-1"], 1000]);
  });

  // F03 fix (WP04): the report builder had its own separate OWN-vs-everything-else check --
  // "TEAM Records" fell through to unrestricted tenant-wide report data, same bug already fixed
  // in leads-postgres.ts/opportunities-postgres.ts/exports.ts.
  it("scopes report data to team membership, not tenant-wide, for a TEAM-access role", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "member-1" }, { id: "member-2" }]) // team-member id resolution
      .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "member-2" }])
      .mockResolvedValueOnce([]);

    const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
    await executeReportQueryForTenant(
      { id: "user-1", tenantId: "tenant-1", teamId: "team-1", role: { permissions: { recordAccess: "TEAM" } } },
      { root: "lead", fields: [{ object: "lead", field: "name", label: "Lead Name" }] },
    );

    const teamLookupCall = queryMock.mock.calls[0];
    expect(teamLookupCall[0]).toContain('from "User"');
    expect(teamLookupCall[1]).toEqual(["tenant-1", "team-1"]);

    const leadCall = queryMock.mock.calls[1];
    expect(leadCall[0]).toContain('"ownerId" = any($2::text[])');
    expect(leadCall[1]).toEqual(["tenant-1", ["member-1", "member-2"], 1000]);
  });

  it("rejects a structured report query that takes too long (gap checklist Module 17, item 24 -- query timeout limits)", async () => {
    vi.useFakeTimers();
    try {
      queryMock.mockImplementation(() => new Promise(() => undefined)); // never resolves

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const resultPromise = executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        { root: "lead", fields: [{ object: "lead", field: "name" }] },
      );
      const expectation = expect(resultPromise).rejects.toThrow("REPORT_QUERY_TIMEOUT");
      await vi.advanceTimersByTimeAsync(15_000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  describe("dataset catalog extension (gap checklist Module 17, item 21 -- Tasks, Telephony, Cases)", () => {
    it("joins Task rows onto a lead-rooted query by leadId", async () => {
      queryMock
        .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }]) // leads
        .mockResolvedValueOnce([{ id: "task-1", title: "Follow up", leadId: "lead-1", ownerId: "user-2" }]); // tasks

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const result = await executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        {
          root: "lead",
          fields: [
            { object: "lead", field: "name" },
            { object: "task", field: "title" },
          ],
        },
      );

      expect(result.rows).toEqual([{ "lead.name": "Alpha", "task.title": "Follow up" }]);
      expect(queryMock.mock.calls[1][0]).toContain('from "Task"');
    });

    it("joins TelephonyCallLog and Case rows onto an opportunity-rooted query, resolving CaseType/CaseStatus/CasePriority satellites", async () => {
      queryMock
        .mockResolvedValueOnce([{ id: "opp-1", title: "Big Deal", ownerId: "user-1", leadId: null, stageId: null }]) // opportunities
        .mockResolvedValueOnce([{ id: "call-1", status: "completed", leadId: null, opportunityId: "opp-1", agentId: "user-3" }]) // telephonyCalls
        .mockResolvedValueOnce([{ id: "case-1", subject: "Billing issue", typeId: "type-1", statusId: "status-1", priorityId: "prio-1", ownerId: "user-4", leadId: null, opportunityId: "opp-1" }]) // cases
        .mockResolvedValueOnce([{ id: "type-1", name: "Billing" }]) // caseTypes
        .mockResolvedValueOnce([{ id: "status-1", name: "Open", category: "OPEN" }]) // caseStatuses
        .mockResolvedValueOnce([{ id: "prio-1", name: "High", level: 2 }]); // casePriorities

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const result = await executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        {
          root: "opportunity",
          fields: [
            { object: "opportunity", field: "title" },
            { object: "telephonyCall", field: "status" },
            { object: "case", field: "subject" },
            { object: "caseType", field: "name" },
            { object: "caseStatus", field: "name" },
            { object: "casePriority", field: "name" },
          ],
        },
      );

      expect(result.rows).toEqual([{
        "opportunity.title": "Big Deal",
        "telephonyCall.status": "completed",
        "case.subject": "Billing issue",
        "caseType.name": "Billing",
        "caseStatus.name": "Open",
        "casePriority.name": "High",
      }]);
      expect(queryMock.mock.calls[1][0]).toContain('from "TelephonyCallLog"');
      expect(queryMock.mock.calls[2][0]).toContain('from "Case"');
      expect(queryMock.mock.calls[2][0]).toContain('"relatedLeadId" as "leadId"');
    });

    it("resolves taskOwner via the shared Users dataset, mirroring the activityCreator satellite pattern", async () => {
      queryMock
        .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }]) // leads
        .mockResolvedValueOnce([{ id: "user-2", name: "Bob Owner", email: "bob@example.com" }]) // users
        .mockResolvedValueOnce([{ id: "task-1", title: "Follow up", leadId: "lead-1", ownerId: "user-2" }]); // tasks

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const result = await executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        {
          root: "lead",
          fields: [
            { object: "task", field: "title" },
            { object: "taskOwner", field: "name" },
          ],
        },
      );

      expect(result.rows).toEqual([{ "task.title": "Follow up", "taskOwner.name": "Bob Owner" }]);
    });

    it("resolves partner and payout (Opportunity-only, via CommissionLedger) with payout matched by partner, not by record", async () => {
      queryMock
        .mockResolvedValueOnce([{ id: "opp-1", title: "Big Deal", ownerId: "user-1", leadId: null, stageId: null }]) // opportunities
        .mockResolvedValueOnce([{ id: "user-2", name: "Partner Bob", email: "bob@partners.com" }]) // users
        .mockResolvedValueOnce([{ id: "cl-1", opportunityId: "opp-1", partnerId: "user-2", entryType: "EARNED", baseAmount: 1000, commissionAmount: 100, triggerEvent: "OPP_WON", createdAt: "2026-01-01T00:00:00.000Z" }]) // commissionLedgers
        .mockResolvedValueOnce([{ id: "payout-1", partnerId: "user-2", payoutCycleId: "cycle-1", status: "PAID", totalCommissionAmount: 500, approvedAt: "2026-01-02", paidAt: "2026-01-03", createdAt: "2026-01-02T00:00:00.000Z" }]); // payouts

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const result = await executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        {
          root: "opportunity",
          fields: [
            { object: "opportunity", field: "title" },
            { object: "partner", field: "name" },
            { object: "payout", field: "status" },
            { object: "commissionLedger", field: "commissionAmount" },
          ],
        },
      );

      expect(result.rows).toEqual([{
        "opportunity.title": "Big Deal",
        "partner.name": "Partner Bob",
        "payout.status": "PAID",
        "commissionLedger.commissionAmount": 100,
      }]);
      expect(queryMock.mock.calls[2][0]).toContain('from "CommissionLedger"');
      expect(queryMock.mock.calls[3][0]).toContain('from "Payout"');
    });

    it("joins Communication, Journey Enrollment, and Predictive Score onto a lead-rooted query via the same polymorphic entityType/recordType pattern AssignmentLog already uses", async () => {
      queryMock
        .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }]) // leads
        .mockResolvedValueOnce([{ id: "comm-1", entityType: "LEAD", entityId: "lead-1", channel: "EMAIL", status: "SENT", recipient: "a@x.com", subject: "Hi", sentAt: "t", createdAt: "t" }]) // communications
        .mockResolvedValueOnce([{ id: "je-1", recordType: "LEAD", recordId: "lead-1", journeyId: "j-1", status: "ACTIVE", enrolledAt: "t", exitedAt: null, exitReason: null }]) // journeyEnrollments
        .mockResolvedValueOnce([{ id: "rs-1", recordType: "LEAD", recordId: "lead-1", scoreBand: "HOT", fitScore: 80, engagementScore: 70, conversionProbability: 60, winProbability: 50, stallRisk: 10, confidence: 90, calculatedAt: "t" }]); // recordScores

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const result = await executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        {
          root: "lead",
          fields: [
            { object: "lead", field: "name" },
            { object: "communication", field: "channel" },
            { object: "journeyEnrollment", field: "status" },
            { object: "recordScore", field: "scoreBand" },
          ],
        },
      );

      expect(result.rows).toEqual([{
        "lead.name": "Alpha",
        "communication.channel": "EMAIL",
        "journeyEnrollment.status": "ACTIVE",
        "recordScore.scoreBand": "HOT",
      }]);
      expect(queryMock.mock.calls[1][0]).toContain('from "CommunicationOutbox"');
      expect(queryMock.mock.calls[2][0]).toContain('from "MarketingJourneyEnrollment"');
      expect(queryMock.mock.calls[3][0]).toContain('from "RecordScore"');
    });

    it("resolves a custom field's value by FieldDefinition id, picking the correct typed value column", async () => {
      queryMock
        .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }]) // leads
        .mockResolvedValueOnce([{ id: "cfv-1", fieldDefinitionId: "fielddef-budget", recordId: "lead-1", valueString: "50000-100000", valueNumber: null, valueBoolean: null, valueDate: null, valueJson: null }]); // customFieldValues

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const result = await executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        {
          root: "lead",
          fields: [
            { object: "lead", field: "name" },
            { object: "customField", field: "fielddef-budget" },
          ],
        },
      );

      expect(result.rows).toEqual([{ "lead.name": "Alpha", "customField.fielddef-budget": "50000-100000" }]);
      expect(queryMock.mock.calls[1][0]).toContain('from "CustomFieldValue"');
    });

    it("returns null for a custom field id with no value recorded on that record, without throwing", async () => {
      queryMock
        .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }])
        .mockResolvedValueOnce([]); // no CustomFieldValue rows at all

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      const result = await executeReportQueryForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        { root: "lead", fields: [{ object: "customField", field: "fielddef-budget" }] },
      );

      expect(result.rows).toEqual([{ "customField.fielddef-budget": null }]);
    });
  });

  describe("entitlement gating", () => {
    it("rejects creating a custom report when Advanced Reporting is disabled for the tenant", async () => {
      // The module alone decides (decision 15); module-entitlements is mocked in this file.
      const entitlements = await import("@/lib/server/module-entitlements");
      vi.mocked(entitlements.isModuleEnabledForTenant).mockResolvedValueOnce(false);
      queryOneMock.mockResolvedValue(null);

      const { createCustomReportForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
      await expect(
        createCustomReportForTenant({ id: "user-1", tenantId: "tenant-1" }, { name: "Report", module: "leads", config: {} }),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("rejects creating a dashboard widget when Advanced Reporting is disabled for the tenant", async () => {
      // The module alone decides (decision 15); module-entitlements is mocked in this file.
      const entitlements = await import("@/lib/server/module-entitlements");
      vi.mocked(entitlements.isModuleEnabledForTenant).mockResolvedValueOnce(false);
      queryOneMock.mockResolvedValue(null);

      const { createDashboardWidgetForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
      await expect(
        createDashboardWidgetForTenant({ id: "user-1", tenantId: "tenant-1" }, { title: "My Leads", type: "STAT", config: {} }),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("rejects executing a structured report query when Advanced Reporting is disabled for the tenant", async () => {
      // The module alone decides (decision 15); module-entitlements is mocked in this file.
      const entitlements = await import("@/lib/server/module-entitlements");
      vi.mocked(entitlements.isModuleEnabledForTenant).mockResolvedValueOnce(false);
      queryOneMock.mockResolvedValue(null);

      const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
      await expect(
        executeReportQueryForTenant(
          { id: "user-1", tenantId: "tenant-1" },
          { root: "lead", fields: [{ object: "lead", field: "name" }] },
        ),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("allows a platform admin to bypass the Advanced Reporting gate", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "TenantModuleEntitlement"')) return { status: "DISABLED" };
        if (text.includes('insert into "CustomReport"')) return { id: "report-1", name: "Report" };
        return null;
      });

      const { createCustomReportForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
      await expect(
        createCustomReportForTenant(
          { id: "admin-1", tenantId: "tenant-1", isPlatformAdmin: true },
          { name: "Report", module: "leads", config: {} },
        ),
      ).resolves.toBeDefined();
    });
  });
});

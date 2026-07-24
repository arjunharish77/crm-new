import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/server/inbuilt-reports", () => ({
  getFunnelByStageReportForTenant: vi.fn(async () => ({
    reportKey: "funnel_conversion_by_stage",
    generatedAt: "2026-01-01T00:00:00.000Z",
    rows: [],
  })),
}));

describe("direct Postgres report infrastructure", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("creates report schedules with normalized recipients and computed next run", async () => {
    queryOneMock.mockResolvedValueOnce({
      id: "schedule-1",
      tenantId: "tenant-1",
      userId: "user-1",
      reportKey: "funnel_conversion_by_stage",
      recipients: ["admin@example.com"],
      frequency: "WEEKLY",
    });

    const { createReportScheduleForTenant } = await import("@/lib/repositories/report-schedules-postgres");
    const result = await createReportScheduleForTenant(
      { id: "user-1", tenantId: "tenant-1", email: "admin@example.com" },
      { reportKey: "funnel_conversion_by_stage", recipients: [" Admin@Example.com ", "bad"] },
    );

    expect(result.id).toBe("schedule-1");
    expect(queryOneMock.mock.calls[0][0]).toContain('insert into "ReportSchedule"');
    expect(queryOneMock.mock.calls[0][1][5]).toEqual(["admin@example.com"]);
  });

  it("processes due schedules and writes pending delivery rows", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    queryMock.mockResolvedValueOnce([
      {
        id: "schedule-1",
        tenantId: "tenant-1",
        userId: "user-1",
        reportKey: "funnel_conversion_by_stage",
        queryDefinition: null,
        recipients: ["admin@example.com"],
        format: "LINK",
        frequency: "DAILY",
        dayOfWeek: null,
        dayOfMonth: null,
      },
    ]);
    queryOneMock
      .mockResolvedValueOnce({ id: "user-1", tenantId: "tenant-1", email: "admin@example.com", rolePermissions: {} })
      .mockResolvedValueOnce({ id: "delivery-1", status: "PENDING" });
    executeMock.mockResolvedValue(undefined);

    const { processDueReportSchedules } = await import("@/lib/repositories/report-schedules-postgres");
    const result = await processDueReportSchedules(now);

    expect(result).toEqual({ processed: [{ scheduleId: "schedule-1", deliveryId: "delivery-1", status: "PENDING" }] });
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "ReportEmailDelivery"'))).toBe(true);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('update "ReportSchedule"'))).toBe(true);
  });

  it("requests rollup refresh and marks refresh state stale", async () => {
    queryOneMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "state-1" })
      .mockResolvedValueOnce({ id: "job-1", status: "PENDING" });

    const { requestReportRollupRefresh } = await import("@/lib/repositories/report-rollups-postgres");
    const result = await requestReportRollupRefresh(
      { id: "user-1", tenantId: "tenant-1" },
      { reportKey: "funnel_conversion_by_stage" },
    );

    expect((result as any).id).toBe("job-1");
    expect(queryOneMock.mock.calls[1][0]).toContain('insert into "ReportRefreshState"');
    expect(queryOneMock.mock.calls[2][0]).toContain('insert into "ReportRefreshJob"');
  });

  it("processes pending rollup jobs and writes rollup rows", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "job-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        reportKey: "funnel_conversion_by_stage",
        scopeType: "ORG",
        scopeId: null,
        periodStart: null,
        periodEnd: null,
        reason: "MANUAL",
      },
    ]);
    queryOneMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "state-refreshing" })
      .mockResolvedValueOnce({ id: "rollup-1" })
      .mockResolvedValueOnce({ id: "state-refreshing" })
      .mockResolvedValueOnce({ id: "state-fresh" });
    executeMock.mockResolvedValue(undefined);

    const { processPendingReportRefreshJobs } = await import("@/lib/repositories/report-rollups-postgres");
    const result = await processPendingReportRefreshJobs(10);

    expect(result).toEqual({ processed: [{ jobId: "job-1", status: "SUCCEEDED", rollupId: "rollup-1" }] });
    expect(executeMock.mock.calls[0][0]).toContain('update "ReportRefreshJob" set status = $1');
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "ReportRollup"'))).toBe(true);
  });
});

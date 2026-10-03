import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const query = vi.fn();
  const queryOne = vi.fn();
  const execute = vi.fn();
  return { query, queryOne, execute, queryAsSystem: query, queryOneAsSystem: queryOne, executeAsSystem: execute };
});
const entitlementsMocks = vi.hoisted(() => ({
  assertFeatureEnabled: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabledForTenant: vi.fn().mockResolvedValue(true),
}));
const exportsMocks = vi.hoisted(() => ({
  createExportRequestForUser: vi.fn(),
  processExportRequest: vi.fn(),
}));
const communicationsMocks = vi.hoisted(() => ({ queueCommunicationForTenant: vi.fn().mockResolvedValue(undefined) }));
const fileStorageMocks = vi.hoisted(() => ({ readPrivateFile: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const inbuiltReportsMocks = vi.hoisted(() => ({
  getRepPerformanceReportForTenant: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/entitlements", () => entitlementsMocks);
vi.mock("@/lib/server/exports", () => exportsMocks);
vi.mock("@/lib/server/communications", () => communicationsMocks);
vi.mock("@/lib/storage/file-storage", () => fileStorageMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/inbuilt-reports", () => inbuiltReportsMocks);

import { processDueReportSchedules, retryFailedReportSchedules, getReportDeliveryDownload } from "@/lib/repositories/report-schedules-postgres";

function scheduleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sched-1",
    tenantId: "tenant-a",
    userId: "user-1",
    reportKey: "rep_performance",
    queryDefinition: null,
    recipients: ["a@x.com", "b@x.com"],
    format: "CSV",
    frequency: "WEEKLY",
    dayOfWeek: 1,
    dayOfMonth: null,
    nextRunAt: "2026-01-01T00:00:00.000Z",
    lastRunAt: null,
    lastStatus: null,
    isActive: true,
    retryCount: 0,
    nextRetryAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const userRow = {
  id: "user-1",
  email: "user1@x.com",
  name: "User One",
  tenantId: "tenant-a",
  roleId: null,
  rolePermissions: null,
};

describe("processDueReportSchedules", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
    entitlementsMocks.isFeatureEnabledForTenant.mockReset().mockResolvedValue(true);
    exportsMocks.createExportRequestForUser.mockReset();
    exportsMocks.processExportRequest.mockReset();
    communicationsMocks.queueCommunicationForTenant.mockReset().mockResolvedValue(undefined);
    inbuiltReportsMocks.getRepPerformanceReportForTenant.mockReset().mockResolvedValue({ rows: [] });
  });

  it("CSV-format schedule creates a real export and queues a real email with a working download link", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow()]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-1", status: "PENDING" });
    exportsMocks.createExportRequestForUser.mockResolvedValueOnce({
      id: "exp-1",
      status: "COMPLETED",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(result.processed).toEqual([{ scheduleId: "sched-1", deliveryId: "delivery-1", status: "PENDING" }]);
    expect(exportsMocks.processExportRequest).not.toHaveBeenCalled();
    expect(communicationsMocks.queueCommunicationForTenant).toHaveBeenCalledTimes(2);
    const [, firstMessage] = communicationsMocks.queueCommunicationForTenant.mock.calls[0];
    expect(firstMessage.body).toContain("/api/public/report-deliveries/delivery-1/download");

    const bodyUpdateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('update "ReportEmailDelivery"'));
    expect(bodyUpdateCall?.[1][0].downloadUrl).toContain("/api/public/report-deliveries/delivery-1/download");
    expect(bodyUpdateCall?.[1][0].failedRecipients).toEqual([]);
  });

  it("resolves a QUEUED export via processExportRequest before treating it as completed", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow()]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-1b", status: "PENDING" });
    exportsMocks.createExportRequestForUser.mockResolvedValueOnce({ id: "exp-1b", status: "QUEUED" });
    exportsMocks.processExportRequest.mockResolvedValueOnce({ id: "exp-1b", status: "COMPLETED", expiresAt: null });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(exportsMocks.processExportRequest).toHaveBeenCalledWith("exp-1b");
    expect(result.processed[0].status).toBe("PENDING");
  });

  it("LINK-format schedule queues an email with an app-view link and validates the report resolves first", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ format: "LINK", recipients: ["a@x.com"] })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-2", status: "PENDING" });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(inbuiltReportsMocks.getRepPerformanceReportForTenant).toHaveBeenCalled();
    expect(result.processed[0]).toEqual({ scheduleId: "sched-1", deliveryId: "delivery-2", status: "PENDING" });
    expect(communicationsMocks.queueCommunicationForTenant).toHaveBeenCalledTimes(1);
    const [, message] = communicationsMocks.queueCommunicationForTenant.mock.calls[0];
    expect(message.body).toContain("/dashboard/reports/standard/rep_performance");
  });

  it("marks a LINK-format schedule FAILED, without queueing an email, when the report fails to resolve", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ format: "LINK", reportKey: "unknown_key" })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-2b", status: "FAILED" });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(result.processed[0].status).toBe("FAILED");
    expect(communicationsMocks.queueCommunicationForTenant).not.toHaveBeenCalled();
  });

  it("PDF-format schedule creates a real export (gap checklist Module 17, item 19) and queues a real email", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ format: "PDF" })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-3", status: "PENDING" });
    exportsMocks.createExportRequestForUser.mockResolvedValueOnce({
      id: "exp-3",
      status: "COMPLETED",
      expiresAt: null,
    });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(result.processed[0]).toEqual({ scheduleId: "sched-1", deliveryId: "delivery-3", status: "PENDING" });
    expect(exportsMocks.createExportRequestForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ exportType: "PDF" }),
    );
    expect(communicationsMocks.queueCommunicationForTenant).toHaveBeenCalledTimes(2);
  });

  it("XLSX-format schedule creates a real export (gap checklist Module 17, item 19) and queues a real email", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ format: "XLSX" })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-3b", status: "PENDING" });
    exportsMocks.createExportRequestForUser.mockResolvedValueOnce({
      id: "exp-3b",
      status: "COMPLETED",
      expiresAt: null,
    });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(result.processed[0]).toEqual({ scheduleId: "sched-1", deliveryId: "delivery-3b", status: "PENDING" });
    expect(exportsMocks.createExportRequestForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ exportType: "XLSX" }),
    );
  });

  it("a format-schedule for a reportKey outside FILE_EXPORTABLE_REPORT_KEYS is marked FAILED with <FORMAT>_EXPORT_NOT_AVAILABLE", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ reportKey: "not_a_real_key" })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-4", status: "FAILED" });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(result.processed[0].status).toBe("FAILED");
    expect(exportsMocks.createExportRequestForUser).not.toHaveBeenCalled();
    const insertCall = dbMocks.queryOne.mock.calls[1];
    expect(insertCall[1]).toContain("CSV_EXPORT_NOT_AVAILABLE");
  });

  it("an export that resolves to PENDING_APPROVAL is marked FAILED with EXPORT_PENDING_APPROVAL and does NOT queue an email", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow()]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-5", status: "FAILED" });
    exportsMocks.createExportRequestForUser.mockResolvedValueOnce({ id: "exp-2", status: "PENDING_APPROVAL" });

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(result.processed[0].status).toBe("FAILED");
    expect(communicationsMocks.queueCommunicationForTenant).not.toHaveBeenCalled();
    const insertCall = dbMocks.queryOne.mock.calls[1];
    expect(insertCall[1]).toContain("EXPORT_PENDING_APPROVAL");
    expect(insertCall[1]).toContain("exp-2");
  });

  it("isolates per-recipient email-queueing failures -- one bad recipient doesn't block others", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ recipients: ["bad@x.com", "good@x.com"] })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-6", status: "PENDING" });
    exportsMocks.createExportRequestForUser.mockResolvedValueOnce({ id: "exp-3", status: "COMPLETED", expiresAt: null });
    communicationsMocks.queueCommunicationForTenant
      .mockRejectedValueOnce(new Error("suppressed"))
      .mockResolvedValueOnce(undefined);

    await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(communicationsMocks.queueCommunicationForTenant).toHaveBeenCalledTimes(2);
    const bodyUpdateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('update "ReportEmailDelivery"'));
    expect(bodyUpdateCall?.[1][0].failedRecipients).toEqual(["bad@x.com"]);
  });

  it("deactivates a schedule and skips delivery when the tenant's Reports feature has since been disabled", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow()]);
    dbMocks.queryOne.mockResolvedValueOnce(userRow);
    entitlementsMocks.isFeatureEnabledForTenant.mockResolvedValueOnce(false);

    const result = await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    expect(result.processed).toEqual([]);
    expect(exportsMocks.createExportRequestForUser).not.toHaveBeenCalled();
    const deactivateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('"isActive" = false'));
    expect(deactivateCall).toBeTruthy();
  });

  // Gap checklist Module 17, item 19 ("scheduled extracts" -- automatic retry of a failed
  // report generation, mirroring webhook-outbox.ts's own backoff ladder).
  it("schedules a retry (backoff step 1) when a report generation failure looks transient", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ format: "LINK" })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-retry-1", status: "FAILED", error: "Database connection reset" });
    inbuiltReportsMocks.getRepPerformanceReportForTenant.mockRejectedValueOnce(new Error("Database connection reset"));

    const now = new Date("2026-01-08T00:00:00.000Z");
    await processDueReportSchedules(now);

    const scheduleUpdateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('update "ReportSchedule"'));
    expect(scheduleUpdateCall).toBeTruthy();
    const params = scheduleUpdateCall![1] as unknown[];
    expect(params[3]).toBe(1); // retryCount
    expect(params[4]).toBe(new Date(now.getTime() + 60_000).toISOString()); // 1-minute backoff
  });

  it("does not schedule a retry for a non-retryable failure (an export governance gate)", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow()]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-retry-2", status: "FAILED", error: "EXPORT_PENDING_APPROVAL" });
    exportsMocks.createExportRequestForUser.mockResolvedValueOnce({ id: "exp-x", status: "PENDING_APPROVAL" });

    await processDueReportSchedules(new Date("2026-01-08T00:00:00.000Z"));

    const scheduleUpdateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('update "ReportSchedule"'));
    const params = scheduleUpdateCall![1] as unknown[];
    expect(params[3]).toBe(0);
    expect(params[4]).toBeNull();
  });
});

describe("retryFailedReportSchedules", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
    entitlementsMocks.isFeatureEnabledForTenant.mockReset().mockResolvedValue(true);
    exportsMocks.createExportRequestForUser.mockReset();
    exportsMocks.processExportRequest.mockReset();
    communicationsMocks.queueCommunicationForTenant.mockReset().mockResolvedValue(undefined);
    inbuiltReportsMocks.getRepPerformanceReportForTenant.mockReset().mockResolvedValue({ rows: [] });
  });

  it("retries a schedule with pending retry state and resets retryCount on success, without touching nextRunAt", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ format: "LINK", retryCount: 1, nextRetryAt: "2026-01-08T00:01:00.000Z" })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-retry-3", status: "PENDING" });

    const result = await retryFailedReportSchedules(new Date("2026-01-08T00:02:00.000Z"));

    expect(result.retried).toEqual([{ scheduleId: "sched-1", deliveryId: "delivery-retry-3", status: "PENDING" }]);
    const updateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('update "ReportSchedule"'));
    expect(updateCall![1]).toEqual(["PENDING", 0, null, "2026-01-08T00:02:00.000Z", "sched-1"]);
    expect(String(updateCall![0])).not.toContain("nextRunAt");
  });

  it("gives up after exhausting the backoff ladder, resetting retry state until the schedule's next natural cadence", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ format: "LINK", retryCount: 5, nextRetryAt: "2026-01-08T00:01:00.000Z" })]);
    dbMocks.queryOne
      .mockResolvedValueOnce(userRow)
      .mockResolvedValueOnce({ id: "delivery-retry-4", status: "FAILED", error: "Still broken" });
    inbuiltReportsMocks.getRepPerformanceReportForTenant.mockRejectedValueOnce(new Error("Still broken"));

    await retryFailedReportSchedules(new Date("2026-01-08T00:02:00.000Z"));

    const updateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('update "ReportSchedule"'));
    expect(updateCall![1]).toEqual(["FAILED", 0, null, "2026-01-08T00:02:00.000Z", "sched-1"]);
  });

  it("resets retry state without attempting delivery when the tenant's Reports feature has since been disabled", async () => {
    dbMocks.query.mockResolvedValueOnce([scheduleRow({ retryCount: 2, nextRetryAt: "2026-01-08T00:01:00.000Z" })]);
    dbMocks.queryOne.mockResolvedValueOnce(userRow);
    entitlementsMocks.isFeatureEnabledForTenant.mockResolvedValueOnce(false);

    const result = await retryFailedReportSchedules(new Date("2026-01-08T00:02:00.000Z"));

    expect(result.retried).toEqual([]);
    const resetCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('"retryCount" = 0, "nextRetryAt" = null'));
    expect(resetCall).toBeTruthy();
  });
});

describe("getReportDeliveryDownload", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    fileStorageMocks.readPrivateFile.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("throws REPORT_DELIVERY_NOT_FOUND when the delivery id doesn't exist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(getReportDeliveryDownload("missing")).rejects.toThrow("REPORT_DELIVERY_NOT_FOUND");
  });

  it("throws REPORT_DELIVERY_HAS_NO_FILE when the delivery never generated an export", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "delivery-1",
      tenantId: "tenant-a",
      scheduleUserId: "user-1",
      exportRequestId: null,
      exportStatus: null,
      expiresAt: null,
      storageKey: null,
      originalFilename: null,
      contentType: null,
    });
    await expect(getReportDeliveryDownload("delivery-1")).rejects.toThrow("REPORT_DELIVERY_HAS_NO_FILE");
  });

  it("throws REPORT_DELIVERY_EXPIRED when the export status is EXPIRED", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "delivery-1",
      tenantId: "tenant-a",
      scheduleUserId: "user-1",
      exportRequestId: "exp-1",
      exportStatus: "EXPIRED",
      expiresAt: null,
      storageKey: "reports/exp-1.csv",
      originalFilename: "report.csv",
      contentType: "text/csv",
    });
    await expect(getReportDeliveryDownload("delivery-1")).rejects.toThrow("REPORT_DELIVERY_EXPIRED");
  });

  it("throws REPORT_DELIVERY_EXPIRED when expiresAt has already passed", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "delivery-1",
      tenantId: "tenant-a",
      scheduleUserId: "user-1",
      exportRequestId: "exp-1",
      exportStatus: "COMPLETED",
      expiresAt: "2020-01-01T00:00:00.000Z",
      storageKey: "reports/exp-1.csv",
      originalFilename: "report.csv",
      contentType: "text/csv",
    });
    await expect(getReportDeliveryDownload("delivery-1")).rejects.toThrow("REPORT_DELIVERY_EXPIRED");
  });

  it("throws REPORT_DELIVERY_NOT_READY when the export hasn't completed yet", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "delivery-1",
      tenantId: "tenant-a",
      scheduleUserId: "user-1",
      exportRequestId: "exp-1",
      exportStatus: "RUNNING",
      expiresAt: null,
      storageKey: null,
      originalFilename: null,
      contentType: null,
    });
    await expect(getReportDeliveryDownload("delivery-1")).rejects.toThrow("REPORT_DELIVERY_NOT_READY");
  });

  it("returns the file and writes an audit log attributed to the schedule's owning user", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "delivery-1",
      tenantId: "tenant-a",
      scheduleUserId: "user-1",
      exportRequestId: "exp-1",
      exportStatus: "COMPLETED",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      storageKey: "reports/exp-1.csv",
      originalFilename: "rep_performance.csv",
      contentType: "text/csv; charset=utf-8",
    });
    fileStorageMocks.readPrivateFile.mockResolvedValueOnce(Buffer.from("id,name\n1,a"));

    const file = await getReportDeliveryDownload("delivery-1");

    expect(file.filename).toBe("rep_performance.csv");
    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(file.buffer.toString()).toBe("id,name\n1,a");
    expect(fileStorageMocks.readPrivateFile).toHaveBeenCalledWith("reports/exp-1.csv");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      { id: "user-1", tenantId: "tenant-a" },
      "DOWNLOAD",
      "REPORT_EMAIL_DELIVERY",
      "delivery-1",
      null,
      { filename: "rep_performance.csv" },
      null,
    );
  });
});

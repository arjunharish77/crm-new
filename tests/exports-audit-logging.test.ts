import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const query = vi.fn();
  const queryOne = vi.fn();
  const execute = vi.fn();
  return {
    query,
    queryOne,
    execute,
    queryAsSystem: query,
    queryOneAsSystem: queryOne,
    executeAsSystem: execute,
    jsonbParam: (v: unknown) => v,
  };
});

const storageMocks = vi.hoisted(() => ({
  writePrivateFile: vi.fn(),
  readPrivateFile: vi.fn(),
  deletePrivateFile: vi.fn().mockResolvedValue(undefined),
}));

const jobQueueMocks = vi.hoisted(() => ({
  enqueueExportJob: vi.fn().mockResolvedValue(undefined),
}));

const crmMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  exportCustomReportForTenant: vi.fn(),
  exportFormSubmissionsForTenant: vi.fn(),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/db/transaction", () => ({ withTransaction: vi.fn() }));
vi.mock("@/lib/storage/file-storage", () => storageMocks);
vi.mock("@/lib/server/job-queue", () => jobQueueMocks);
vi.mock("@/lib/repositories/auth-admin-postgres", () => ({ getCurrentUserById: vi.fn() }));
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/partner-invoices", () => ({ generateCycleFinanceCsv: vi.fn() }));
vi.mock("@/lib/server/inbuilt-reports", () => ({}));

import {
  approveExportRequest,
  createExportRequestForUser,
  createExportSensitiveFieldRuleForTenant,
  createExportTemplateForTenant,
  getExportDownloadForUser,
  processExpiredExportFiles,
  rejectExportRequest,
} from "@/lib/server/exports";
import { DatabaseError } from "@/lib/db/errors";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("exports.ts audit logging", () => {
  beforeEach(() => {
    // jsonbParam is a plain passthrough function, not a vi.fn() -- excluded from this reset
    // sweep since mockReset() only applies to actual mock functions.
    Object.entries(dbMocks).forEach(([key, mock]) => { if (key !== "jsonbParam") (mock as ReturnType<typeof vi.fn>).mockReset(); });
    Object.values(storageMocks).forEach((mock) => mock.mockReset());
    storageMocks.deletePrivateFile.mockResolvedValue(undefined);
    jobQueueMocks.enqueueExportJob.mockReset().mockResolvedValue(undefined);
    crmMocks.createAuditLog.mockClear();
  });

  it("audit-logs export request creation", async () => {
    dbMocks.execute.mockResolvedValue(1);
    dbMocks.queryOne.mockResolvedValueOnce({ id: "export-1", moduleName: "LEADS", status: "QUEUED" });

    await createExportRequestForUser(user, { moduleName: "LEADS", filters: { status: "NEW" } });

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      user,
      "CREATE",
      "EXPORT_REQUEST",
      expect.any(String),
      null,
      { moduleName: "LEADS", filters: { status: "NEW" }, status: "QUEUED" },
      null,
    );
  });

  it("accepts AUDIT_LOGS as a valid export module (evidence export)", async () => {
    dbMocks.execute.mockResolvedValue(1);
    dbMocks.queryOne.mockResolvedValueOnce({ id: "export-2", moduleName: "AUDIT_LOGS", status: "QUEUED" });

    await createExportRequestForUser(user, { moduleName: "AUDIT_LOGS", filters: { flagged: true } });

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      user,
      "CREATE",
      "EXPORT_REQUEST",
      expect.any(String),
      null,
      { moduleName: "AUDIT_LOGS", filters: { flagged: true }, status: "QUEUED" },
      null,
    );
  });

  it("does not audit-log a queue failure", async () => {
    dbMocks.execute.mockResolvedValue(1);
    jobQueueMocks.enqueueExportJob.mockRejectedValueOnce(new Error("queue down"));

    await expect(createExportRequestForUser(user, { moduleName: "LEADS" })).rejects.toThrow("queue down");
    expect(crmMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("audit-logs a successful export download", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "ACTIVE" }) // assertAccountActiveForDownload
      .mockResolvedValueOnce({
        id: "export-1",
        status: "COMPLETED",
        fileObjectId: "file-1",
        storageKey: "exports/tenant-a/user-1/leads.csv",
        originalFilename: "leads.csv",
        contentType: "text/csv",
      });
    storageMocks.readPrivateFile.mockResolvedValueOnce(Buffer.from("id,name\n"));

    const result = await getExportDownloadForUser(user, "export-1");

    expect(result.filename).toBe("leads.csv");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      user,
      "DOWNLOAD",
      "EXPORT_REQUEST",
      "export-1",
      null,
      { filename: "leads.csv" },
      null,
    );
  });

  it("does not audit-log when the export isn't ready yet", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "ACTIVE" }) // assertAccountActiveForDownload
      .mockResolvedValueOnce({ id: "export-1", status: "RUNNING", fileObjectId: null, storageKey: null });

    await expect(getExportDownloadForUser(user, "export-1")).rejects.toThrow("EXPORT_NOT_READY");
    expect(crmMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects downloading an expired export even if its status hasn't been flipped yet", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "ACTIVE" }) // assertAccountActiveForDownload
      .mockResolvedValueOnce({
        id: "export-1",
        status: "COMPLETED",
        fileObjectId: "file-1",
        storageKey: "exports/tenant-a/leads.csv",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });

    await expect(getExportDownloadForUser(user, "export-1")).rejects.toThrow("EXPORT_EXPIRED");
    expect(storageMocks.readPrivateFile).not.toHaveBeenCalled();
  });

  it("rejects downloading when the requesting user's account has been deactivated since the export was created", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ status: "INACTIVE", tenantStatus: "ACTIVE" }); // assertAccountActiveForDownload

    await expect(getExportDownloadForUser(user, "export-1")).rejects.toThrow("ACCOUNT_DEACTIVATED");
    expect(crmMocks.createAuditLog).not.toHaveBeenCalled();
  });

  describe("sensitive-field approval gate", () => {
    it("queues immediately when no requested column is flagged as sensitive", async () => {
      dbMocks.query.mockResolvedValueOnce([]); // no sensitive-field rules for this module
      dbMocks.execute.mockResolvedValue(1);
      dbMocks.queryOne.mockResolvedValueOnce({ id: "export-1", status: "QUEUED" });

      await createExportRequestForUser(user, { moduleName: "LEADS", columns: ["name", "email"] });

      expect(jobQueueMocks.enqueueExportJob).toHaveBeenCalledTimes(1);
      const insertCall = dbMocks.execute.mock.calls[0];
      // Param order: id, tenantId, userId, moduleName, exportType, status, filters, columns, metadata, queuedAt.
      expect(insertCall[1][4]).toBe("CSV");
      expect(insertCall[1][5]).toBe("QUEUED");
    });

    it("gates an export behind approval when a requested column is flagged sensitive, and does not enqueue it", async () => {
      dbMocks.query.mockResolvedValueOnce([{ fieldKey: "ssn" }]);
      dbMocks.execute.mockResolvedValue(1);
      dbMocks.queryOne.mockResolvedValueOnce({ id: "export-1", status: "PENDING_APPROVAL" });

      await createExportRequestForUser(user, { moduleName: "LEADS", columns: ["name", "ssn"] });

      const insertCall = dbMocks.execute.mock.calls[0];
      expect(insertCall[1][5]).toBe("PENDING_APPROVAL");
      expect(jobQueueMocks.enqueueExportJob).not.toHaveBeenCalled();
    });
  });

  describe("approve / reject export requests", () => {
    it("approves a pending-approval export and enqueues it", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "export-1", status: "QUEUED" });
      const result = await approveExportRequest(user, "export-1");
      expect(result.status).toBe("QUEUED");
      expect(jobQueueMocks.enqueueExportJob).toHaveBeenCalledWith("export-1", "tenant-a");
    });

    it("throws when approving an export that isn't pending approval", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(approveExportRequest(user, "export-1")).rejects.toThrow("EXPORT_REQUEST_NOT_PENDING_APPROVAL");
    });

    it("rejects a pending-approval export without enqueueing it", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "export-1", status: "REJECTED" });
      const result = await rejectExportRequest(user, "export-1");
      expect(result.status).toBe("REJECTED");
      expect(jobQueueMocks.enqueueExportJob).not.toHaveBeenCalled();
    });
  });

  describe("export templates", () => {
    it("creates a template", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "template-1", name: "My leads export" });
      const template = await createExportTemplateForTenant(user, { name: "My leads export", moduleName: "LEADS", columns: ["name"] });
      expect(template.id).toBe("template-1");
    });

    it("surfaces a friendly error on a duplicate template name", async () => {
      dbMocks.queryOne.mockRejectedValueOnce(new DatabaseError("duplicate key", { code: "23505" }));
      await expect(
        createExportTemplateForTenant(user, { name: "Dup", moduleName: "LEADS" }),
      ).rejects.toThrow("DUPLICATE_EXPORT_TEMPLATE_NAME");
    });
  });

  describe("sensitive field rules", () => {
    it("creates a rule", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "rule-1", moduleName: "LEADS", fieldKey: "ssn" });
      const rule = await createExportSensitiveFieldRuleForTenant(user, { moduleName: "LEADS", fieldKey: "ssn" });
      expect(rule.id).toBe("rule-1");
    });

    it("surfaces a friendly error on a duplicate rule", async () => {
      dbMocks.queryOne.mockRejectedValueOnce(new DatabaseError("duplicate key", { code: "23505" }));
      await expect(
        createExportSensitiveFieldRuleForTenant(user, { moduleName: "LEADS", fieldKey: "ssn" }),
      ).rejects.toThrow("DUPLICATE_SENSITIVE_FIELD_RULE");
    });
  });

  describe("processExpiredExportFiles", () => {
    it("deletes the underlying file and marks the request EXPIRED for each due row", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { id: "export-1", fileObjectId: "file-1", storageKey: "exports/tenant-a/leads.csv" },
        { id: "export-2", fileObjectId: "file-2", storageKey: null },
      ]);
      dbMocks.execute.mockResolvedValue(1);

      const result = await processExpiredExportFiles(10);

      expect(result.processed).toBe(2);
      expect(storageMocks.deletePrivateFile).toHaveBeenCalledWith("exports/tenant-a/leads.csv");
      expect(storageMocks.deletePrivateFile).toHaveBeenCalledTimes(1);
      const statusUpdateCalls = dbMocks.execute.mock.calls.filter((call) => String(call[0]).includes("status = 'EXPIRED'"));
      expect(statusUpdateCalls).toHaveLength(2);
    });
  });
});

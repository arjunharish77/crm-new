import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const storageMocks = vi.hoisted(() => ({
  writePrivateFile: vi.fn().mockResolvedValue({ storageKey: "privacy-exports/tenant-a/req-1/file.json", bucket: "privacy-exports", driver: "local", byteSize: 42, checksum: "abc", contentType: "application/json" }),
  readPrivateFile: vi.fn().mockResolvedValue(Buffer.from("{}")),
  deletePrivateFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/storage/file-storage", () => storageMocks);

import {
  createPrivacyRequestForContact,
  runPrivacyExportForLead,
  runPrivacyDeleteForLead,
  getPrivacyRequestDownload,
} from "@/lib/repositories/privacy-postgres";

const user = { id: "user-1", tenantId: "tenant-a" };

function leadRow(overrides: Record<string, unknown> = {}) {
  return { id: "lead-1", tenantId: "tenant-a", name: "Jane Doe", email: "jane@x.com", phone: "5551234567", ...overrides };
}

describe("createPrivacyRequestForContact", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("throws CONTACT_EMAIL_REQUIRED when no email is given", async () => {
    await expect(createPrivacyRequestForContact(user, { type: "EXPORT" })).rejects.toThrow("CONTACT_EMAIL_REQUIRED");
  });

  it("throws NO_MATCHING_RECORD when no lead matches the email", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(createPrivacyRequestForContact(user, { contactEmail: "nobody@x.com", type: "EXPORT" })).rejects.toThrow("NO_MATCHING_RECORD");
  });

  it("resolves the matching lead by lowercased email and dispatches to export by default", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "lead-1" }); // email lookup
    dbMocks.queryOne.mockResolvedValueOnce(leadRow()); // runPrivacyExportForLead's own lead fetch
    dbMocks.queryOne.mockResolvedValueOnce({ id: "req-1", status: "PROCESSING" }); // insertPrivacyRequest

    await createPrivacyRequestForContact(user, { contactEmail: "JANE@X.COM" });

    const lookupCall = dbMocks.queryOne.mock.calls[0];
    expect(lookupCall[1]).toEqual(["tenant-a", "jane@x.com"]);
  });
});

describe("runPrivacyExportForLead", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    storageMocks.writePrivateFile.mockClear();
  });

  it("throws LEAD_NOT_FOUND when the lead doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(runPrivacyExportForLead(user, "missing")).rejects.toThrow("LEAD_NOT_FOUND");
  });

  it("bundles every related module's rows into one JSON file and marks the request COMPLETED", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(leadRow()) // lead fetch
      .mockResolvedValueOnce({ id: "req-1", status: "PROCESSING" }); // insertPrivacyRequest
    dbMocks.query.mockImplementation((sql: string) => {
      if (sql.includes('from "Opportunity"')) return Promise.resolve([{ id: "opp-1" }]);
      if (sql.includes('from "Activity"')) return Promise.resolve([{ id: "activity-1" }]);
      if (sql.includes('from "CommunicationSuppression"')) return Promise.resolve([{ id: "supp-1" }]);
      return Promise.resolve([]);
    });

    const result = await runPrivacyExportForLead(user, "lead-1");

    expect(result.status).toBe("COMPLETED");
    expect(storageMocks.writePrivateFile).toHaveBeenCalledTimes(1);
    const [, fileBuffer] = storageMocks.writePrivateFile.mock.calls[0];
    const bundle = JSON.parse(fileBuffer.toString());
    expect(bundle.lead.id).toBe("lead-1");
    expect(bundle.opportunities).toEqual([{ id: "opp-1" }]);
    expect(bundle.communicationSuppressions).toEqual([{ id: "supp-1" }]);

    const fileObjectInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "FileObject"'));
    expect(fileObjectInsert).toBeTruthy();
    expect(String(fileObjectInsert![0])).toContain("'PRIVACY_REQUEST'");

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "EXPORT", "PRIVACY_REQUEST", "req-1", null, expect.any(Object), expect.objectContaining({ entityType: "LEAD", entityId: "lead-1" }));
  });

  it("marks the request FAILED and rethrows when bundling throws", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(leadRow())
      .mockResolvedValueOnce({ id: "req-1", status: "PROCESSING" });
    dbMocks.query.mockImplementation((sql: string) => {
      if (sql.includes('from "Opportunity"')) return Promise.reject(new Error("db exploded"));
      return Promise.resolve([]);
    });

    await expect(runPrivacyExportForLead(user, "lead-1")).rejects.toThrow("db exploded");

    const failCall = dbMocks.execute.mock.calls.find((c) => String(c[1]).includes("FAILED"));
    expect(failCall).toBeTruthy();
  });
});

describe("runPrivacyDeleteForLead", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    storageMocks.deletePrivateFile.mockClear();
  });

  it("throws LEAD_NOT_FOUND when the lead doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(runPrivacyDeleteForLead(user, "missing")).rejects.toThrow("LEAD_NOT_FOUND");
  });

  it("blocks a privacy delete while impersonating, before even looking up the lead", async () => {
    const impersonatingUser = { ...user, isImpersonating: true };
    await expect(runPrivacyDeleteForLead(impersonatingUser, "lead-1")).rejects.toThrow("IMPERSONATION_BLOCKED:privacy_delete");
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
  });

  it("cascades deletes for a lead with no opportunities and fully deletes the lead itself", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(leadRow())
      .mockResolvedValueOnce({ id: "req-1", status: "PROCESSING" });
    dbMocks.query.mockResolvedValue([]); // no opportunities, no file objects

    const result = await runPrivacyDeleteForLead(user, "lead-1");

    expect(result.leadDeleted).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(result.blockedReason).toBeNull();
    const leadDeleteCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('delete from "Lead"'));
    expect(leadDeleteCall).toBeTruthy();

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      user,
      "DELETE",
      "PRIVACY_REQUEST",
      "req-1",
      null,
      null,
      expect.objectContaining({ entityType: "LEAD", entityId: "lead-1", leadDeleted: true }),
    );
  });

  it("deletes the underlying stored file for every attached FileObject before removing the rows", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(leadRow())
      .mockResolvedValueOnce({ id: "req-1", status: "PROCESSING" });
    dbMocks.query.mockImplementation((sql: string) => {
      if (sql.includes('from "FileObject"')) return Promise.resolve([{ id: "file-1", storageKey: "privacy-exports/tenant-a/file-1.json" }]);
      return Promise.resolve([]);
    });

    await runPrivacyDeleteForLead(user, "lead-1");

    expect(storageMocks.deletePrivateFile).toHaveBeenCalledWith("privacy-exports/tenant-a/file-1.json");
  });

  it("reports PARTIAL with a clear reason when an Opportunity delete is blocked, and keeps the Lead", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(leadRow())
      .mockResolvedValueOnce({ id: "req-1", status: "PROCESSING" });
    dbMocks.query.mockImplementation((sql: string) => {
      if (sql.includes('select id from "Opportunity"')) return Promise.resolve([{ id: "opp-1" }]);
      return Promise.resolve([]);
    });
    dbMocks.execute.mockImplementation((sql: string) => {
      if (sql.includes('delete from "Opportunity"')) return Promise.reject(new Error('update or delete on table "Opportunity" violates foreign key constraint'));
      return Promise.resolve(0);
    });

    const result = await runPrivacyDeleteForLead(user, "lead-1");

    expect(result.status).toBe("PARTIAL");
    expect(result.leadDeleted).toBe(false);
    expect(result.blockedReason).toContain("opp-1");
    const leadDeleteAttempted = dbMocks.execute.mock.calls.some((c) => String(c[0]).includes('delete from "Lead"'));
    expect(leadDeleteAttempted).toBe(false); // never even attempted since a child Opportunity survived
  });
});

describe("getPrivacyRequestDownload", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    storageMocks.readPrivateFile.mockReset().mockResolvedValue(Buffer.from("{}"));
  });

  it("throws PRIVACY_REQUEST_NOT_FOUND when the request doesn't exist", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "ACTIVE" }) // assertAccountActiveForDownload
      .mockResolvedValueOnce(null);
    await expect(getPrivacyRequestDownload(user, "req-1")).rejects.toThrow("PRIVACY_REQUEST_NOT_FOUND");
  });

  it("rejects downloading when the requesting user's account has been deactivated", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ status: "INACTIVE", tenantStatus: "ACTIVE" }); // assertAccountActiveForDownload
    await expect(getPrivacyRequestDownload(user, "req-1")).rejects.toThrow("ACCOUNT_DEACTIVATED");
  });

  it("throws PRIVACY_REQUEST_HAS_NO_FILE when the request never produced a file", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "ACTIVE" }) // assertAccountActiveForDownload
      .mockResolvedValueOnce({ id: "req-1", resultFileObjectId: null });
    await expect(getPrivacyRequestDownload(user, "req-1")).rejects.toThrow("PRIVACY_REQUEST_HAS_NO_FILE");
  });

  it("returns the file buffer and writes a DOWNLOAD audit entry", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "ACTIVE" }) // assertAccountActiveForDownload
      .mockResolvedValueOnce({ id: "req-1", resultFileObjectId: "file-1" })
      .mockResolvedValueOnce({ storageKey: "privacy-exports/tenant-a/file-1.json", originalFilename: "export.json", contentType: "application/json" });

    const file = await getPrivacyRequestDownload(user, "req-1");

    expect(file.filename).toBe("export.json");
    expect(storageMocks.readPrivateFile).toHaveBeenCalledWith("privacy-exports/tenant-a/file-1.json");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "DOWNLOAD", "PRIVACY_REQUEST", "req-1", null, { filename: "export.json" }, null);
  });
});

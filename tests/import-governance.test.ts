import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const leadsRepoMocks = vi.hoisted(() => ({ createLeadForTenant: vi.fn(), createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const authAdminMocks = vi.hoisted(() => ({ getCurrentUserById: vi.fn() }));
const jobQueueMocks = vi.hoisted(() => ({ enqueueImportJob: vi.fn().mockResolvedValue(undefined) }));
const notificationMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);
vi.mock("@/lib/repositories/auth-admin-postgres", () => authAdminMocks);
vi.mock("@/lib/server/job-queue", () => jobQueueMocks);
vi.mock("@/lib/server/notifications", () => notificationMocks);

import {
  approveImportJob,
  cancelImportJob,
  createImportTemplateForTenant,
  previewImportForTenant,
  processImportJob,
  queueImportForTenant,
  rejectImportJob,
} from "@/lib/server/crm";
import { DatabaseError } from "@/lib/db/errors";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("import governance", () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mock) => mock.mockReset());
    leadsRepoMocks.createLeadForTenant.mockReset();
    leadsRepoMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    authAdminMocks.getCurrentUserById.mockReset();
    jobQueueMocks.enqueueImportJob.mockReset().mockResolvedValue(undefined);
    notificationMocks.createUserNotification.mockReset().mockResolvedValue(undefined);
  });

  describe("queueImportForTenant", () => {
    it("queues a non-destructive import immediately and enqueues the worker job", async () => {
      dbMocks.execute.mockResolvedValue(1);
      dbMocks.queryOne.mockResolvedValueOnce({ id: "job-1", status: "QUEUED" });

      const job = await queueImportForTenant(user, { module: "LEAD", duplicateMode: "SKIP", rows: [{ name: "A" }] });

      expect(job?.status).toBe("QUEUED");
      expect(dbMocks.execute.mock.calls[0][0]).toContain('insert into "ImportJob"');
      expect(dbMocks.execute.mock.calls[0][1][4]).toBe("QUEUED");
      expect(jobQueueMocks.enqueueImportJob).toHaveBeenCalledTimes(1);
    });

    it("gates a destructive (UPDATE) import behind approval and does not enqueue it", async () => {
      dbMocks.execute.mockResolvedValue(1);
      dbMocks.queryOne.mockResolvedValueOnce({ id: "job-2", status: "PENDING_APPROVAL" });

      const job = await queueImportForTenant(user, { module: "LEAD", duplicateMode: "UPDATE", rows: [{ email: "a@example.com" }] });

      expect(job?.status).toBe("PENDING_APPROVAL");
      expect(dbMocks.execute.mock.calls[0][1][4]).toBe("PENDING_APPROVAL");
      expect(jobQueueMocks.enqueueImportJob).not.toHaveBeenCalled();
    });
  });

  describe("previewImportForTenant", () => {
    it("classifies rows as create/update/skip without writing anything", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string, params: unknown[]) => {
        if (String(sql).includes('from "Lead"') && params[0] === "existing@example.com") return { id: "lead-existing" };
        return null;
      });

      const preview = await previewImportForTenant(user, {
        module: "LEAD",
        duplicateMode: "SKIP",
        mappings: [{ source: "email", target: "email" }],
        rows: [{ email: "new@example.com" }, { email: "existing@example.com" }],
      });

      expect(preview).toMatchObject({ total: 2, wouldCreate: 1, wouldSkip: 1, wouldUpdate: 0, wouldFail: 0, isDestructive: false });
      expect(leadsRepoMocks.createLeadForTenant).not.toHaveBeenCalled();
      expect(dbMocks.execute).not.toHaveBeenCalled();
    });

    it("flags itself as destructive when duplicateMode=UPDATE actually matches existing records", async () => {
      dbMocks.queryOne.mockResolvedValue({ id: "lead-existing" });

      const preview = await previewImportForTenant(user, {
        module: "LEAD",
        duplicateMode: "UPDATE",
        mappings: [{ source: "email", target: "email" }],
        rows: [{ email: "existing@example.com" }],
      });

      expect(preview.isDestructive).toBe(true);
      expect(preview.wouldUpdate).toBe(1);
    });
  });

  describe("processImportJob", () => {
    it("returns null when the job is not in QUEUED state (already claimed)", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      const result = await processImportJob("job-1");
      expect(result).toBeNull();
    });

    it("processes queued rows, persists final stats, and notifies the requesting user", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("set status = 'PROCESSING'")) {
          return {
            id: "job-1",
            tenantId: "tenant-a",
            userId: "user-1",
            module: "LEAD",
            mapping: { fields: [{ source: "email", target: "email" }], duplicateMode: "SKIP" },
            rows: [{ email: "new@example.com" }],
          };
        }
        if (text.includes('from "Lead"')) return null; // no duplicate
        if (text.includes('"cancelRequested" from "ImportJob"')) return { cancelRequested: false };
        if (text.includes('set status = $1, stats = $2')) {
          return { id: "job-1", module: "LEAD", status: "COMPLETED", stats: { created: 1 } };
        }
        return null;
      });
      authAdminMocks.getCurrentUserById.mockResolvedValueOnce({ id: "user-1", tenantId: "tenant-a" });
      leadsRepoMocks.createLeadForTenant.mockResolvedValueOnce({ id: "lead-new" });

      const result = await processImportJob("job-1");

      expect(result?.status).toBe("COMPLETED");
      expect(leadsRepoMocks.createLeadForTenant).toHaveBeenCalledTimes(1);
      expect(notificationMocks.createUserNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-a", userId: "user-1", title: "Import completed" }),
      );
    });
  });

  describe("cancelImportJob", () => {
    it("immediately cancels a job still QUEUED", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "job-1", status: "CANCELLED" });
      const job = await cancelImportJob(user, "job-1");
      expect(job.status).toBe("CANCELLED");
    });

    it("sets cancelRequested on a job that's already PROCESSING instead of cancelling outright", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce(null) // not QUEUED
        .mockResolvedValueOnce({ id: "job-1", status: "PROCESSING" });
      const job = await cancelImportJob(user, "job-1");
      expect(job.status).toBe("PROCESSING");
    });

    it("throws when the job can't be cancelled in its current state", async () => {
      dbMocks.queryOne.mockResolvedValue(null);
      await expect(cancelImportJob(user, "job-1")).rejects.toThrow("IMPORT_JOB_NOT_CANCELLABLE");
    });
  });

  describe("approve / reject", () => {
    it("approves a pending-approval job and enqueues it", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "job-1", status: "QUEUED" });
      const job = await approveImportJob(user, "job-1");
      expect(job.status).toBe("QUEUED");
      expect(jobQueueMocks.enqueueImportJob).toHaveBeenCalledWith("job-1");
    });

    it("rejects a pending-approval job without enqueueing it", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "job-1", status: "REJECTED" });
      const job = await rejectImportJob(user, "job-1");
      expect(job.status).toBe("REJECTED");
      expect(jobQueueMocks.enqueueImportJob).not.toHaveBeenCalled();
    });

    it("throws when approving a job that isn't pending approval", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(approveImportJob(user, "job-1")).rejects.toThrow("IMPORT_JOB_NOT_PENDING_APPROVAL");
    });
  });

  describe("createImportTemplateForTenant", () => {
    it("creates a template", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "template-1", name: "My mapping" });
      const template = await createImportTemplateForTenant(user, { name: "My mapping", module: "LEAD", mappings: [], duplicateMode: "SKIP" });
      expect(template.id).toBe("template-1");
    });

    it("surfaces a friendly error on a duplicate template name", async () => {
      dbMocks.queryOne.mockRejectedValueOnce(new DatabaseError("duplicate key", { code: "23505" }));
      await expect(
        createImportTemplateForTenant(user, { name: "Dup", module: "LEAD", mappings: [], duplicateMode: "SKIP" }),
      ).rejects.toThrow("DUPLICATE_IMPORT_TEMPLATE_NAME");
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const notificationsMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/notifications", () => notificationsMocks);

import {
  listReportRefreshStatesForTenant,
  updateReportRefreshPolicyForTenant,
  processDueReportRollupRefreshes,
  processPendingReportRefreshJobs,
  refreshReportRollupForTenant,
  invalidateReportRollupsForTenant,
} from "@/lib/repositories/report-rollups-postgres";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("report rollup freshness controls", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
    notificationsMocks.createUserNotification.mockReset().mockResolvedValue(undefined);
  });

  describe("listReportRefreshStatesForTenant", () => {
    it("throws without a tenant", async () => {
      await expect(listReportRefreshStatesForTenant({ id: "u1", tenantId: null })).rejects.toThrow("TENANT_CONTEXT_REQUIRED");
    });

    it("returns every refresh state for the tenant", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "state-1", reportKey: "rep_performance", status: "FRESH" }]);
      const states = await listReportRefreshStatesForTenant(user);
      expect(states).toHaveLength(1);
      expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-a"]);
    });
  });

  describe("updateReportRefreshPolicyForTenant", () => {
    it("throws REPORT_KEY_REQUIRED when reportKey is missing", async () => {
      await expect(
        updateReportRefreshPolicyForTenant(user, { reportKey: "", refreshIntervalMinutes: 30 } as any),
      ).rejects.toThrow("REPORT_KEY_REQUIRED");
    });

    it("throws INVALID_REFRESH_INTERVAL for a non-positive interval", async () => {
      await expect(
        updateReportRefreshPolicyForTenant(user, { reportKey: "rep_performance", refreshIntervalMinutes: 0 }),
      ).rejects.toThrow("INVALID_REFRESH_INTERVAL");
    });

    it("updates the existing state's refreshIntervalMinutes", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "state-1", refreshIntervalMinutes: 15 }) // existence check inside upsertRefreshState
        .mockResolvedValueOnce({ id: "state-1", refreshIntervalMinutes: 45 }); // the update itself

      const result = await updateReportRefreshPolicyForTenant(user, { reportKey: "rep_performance", refreshIntervalMinutes: 45 });

      expect((result as any).refreshIntervalMinutes).toBe(45);
      const updateCall = dbMocks.queryOne.mock.calls[1];
      expect(String(updateCall[0])).toContain('update "ReportRefreshState"');
      expect(updateCall[1]).toContain(45);
    });

    it("creates a new state row when none exists yet", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce(null) // no existing state
        .mockResolvedValueOnce({ id: "state-new", refreshIntervalMinutes: 60 });

      await updateReportRefreshPolicyForTenant(user, { reportKey: "rep_performance", refreshIntervalMinutes: 60 });

      const insertCall = dbMocks.queryOne.mock.calls[1];
      expect(String(insertCall[0])).toContain('insert into "ReportRefreshState"');
    });
  });

  describe("processDueReportRollupRefreshes", () => {
    it("enqueues a SCHEDULED job for every due state", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { tenantId: "tenant-a", reportKey: "rep_performance", scopeType: "ORG", scopeId: null },
        { tenantId: "tenant-b", reportKey: "sla_response_breaches", scopeType: "ORG", scopeId: null },
      ]);
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "job-1" })
        .mockResolvedValueOnce({ id: "job-2" });

      const result = await processDueReportRollupRefreshes(50);

      expect(result.enqueued).toEqual([
        { tenantId: "tenant-a", reportKey: "rep_performance", scopeType: "ORG", scopeId: null, jobId: "job-1" },
        { tenantId: "tenant-b", reportKey: "sla_response_breaches", scopeType: "ORG", scopeId: null, jobId: "job-2" },
      ]);
      expect(String(dbMocks.queryOne.mock.calls[0][0])).toContain("'SCHEDULED'");
    });

    it("returns an empty list when nothing is due", async () => {
      dbMocks.query.mockResolvedValueOnce([]);
      const result = await processDueReportRollupRefreshes(50);
      expect(result.enqueued).toEqual([]);
      expect(dbMocks.queryOne).not.toHaveBeenCalled();
    });
  });

  describe("failed-refresh notifications", () => {
    it("notifies the job's requester when a MANUAL job fails", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { id: "job-1", tenantId: "tenant-a", reportKey: "unknown_key", scopeType: "ORG", scopeId: null, requestedBy: "user-9", reason: "MANUAL" },
      ]);
      // refreshReportRollupForTenant's internal calls: upsertRefreshState (REFRESHING) -> existence check + update,
      // then renderRollupReport throws UNKNOWN_REPORT_KEY (a real, deterministic key the function
      // doesn't recognize -- a known key like "rep_performance" would fall through to the real,
      // unmocked inbuilt-reports.ts and hit live DB calls this test doesn't set up), then
      // upsertRefreshState (ERROR) -> existence check + update.
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "state-1" }) // existence check for REFRESHING patch
        .mockResolvedValueOnce({ id: "state-1" }) // the REFRESHING update itself
        .mockResolvedValueOnce({ id: "state-1" }) // existence check for ERROR patch
        .mockResolvedValueOnce({ id: "state-1", status: "ERROR" }); // the ERROR update itself

      await processPendingReportRefreshJobs(10);

      expect(notificationsMocks.createUserNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-a", userId: "user-9", title: "Report rollup refresh failed" }),
      );
    });

    it("falls back to the tenant's earliest user when a SCHEDULED job (no requester) fails", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { id: "job-2", tenantId: "tenant-a", reportKey: "unknown_key", scopeType: "ORG", scopeId: null, requestedBy: null, reason: "SCHEDULED" },
      ]);
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "state-1" }) // existence check for REFRESHING patch
        .mockResolvedValueOnce({ id: "state-1" }) // REFRESHING update
        .mockResolvedValueOnce({ id: "state-1" }) // existence check for ERROR patch
        .mockResolvedValueOnce({ id: "state-1", status: "ERROR" }) // ERROR update
        .mockResolvedValueOnce({ id: "owner-1" }); // fallback owner lookup

      await processPendingReportRefreshJobs(10);

      expect(notificationsMocks.createUserNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-a", userId: "owner-1" }),
      );
    });

    it("skips notifying when no requester and no tenant user can be found", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { id: "job-3", tenantId: "tenant-a", reportKey: "unknown_key", scopeType: "ORG", scopeId: null, requestedBy: null, reason: "SCHEDULED" },
      ]);
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "state-1" })
        .mockResolvedValueOnce({ id: "state-1" })
        .mockResolvedValueOnce({ id: "state-1" })
        .mockResolvedValueOnce({ id: "state-1", status: "ERROR" })
        .mockResolvedValueOnce(null); // no user found for the tenant at all

      await processPendingReportRefreshJobs(10);

      expect(notificationsMocks.createUserNotification).not.toHaveBeenCalled();
    });
  });

  describe("refreshReportRollupForTenant", () => {
    it("throws UNKNOWN_REPORT_KEY for a reportKey renderRollupReport doesn't recognize, and flips state to ERROR", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "state-1" })
        .mockResolvedValueOnce({ id: "state-1" }) // REFRESHING update
        .mockResolvedValueOnce({ id: "state-1" }) // existence check for ERROR patch
        .mockResolvedValueOnce({ id: "state-1", status: "ERROR" }); // ERROR update

      await expect(refreshReportRollupForTenant(user, { reportKey: "not_a_real_key" })).rejects.toThrow("UNKNOWN_REPORT_KEY");
      const errorUpdateCall = dbMocks.queryOne.mock.calls[3];
      expect(errorUpdateCall[1]).toContain("ERROR");
    });
  });

  // Gap checklist Module 17, item 24 ("analytics performance layer" -- cache invalidation as an
  // explicit concept, previously timer-only).
  describe("invalidateReportRollupsForTenant", () => {
    it("marks every non-REFRESHING rollup state STALE for the tenant", async () => {
      await invalidateReportRollupsForTenant("tenant-a");
      expect(dbMocks.execute).toHaveBeenCalledTimes(1);
      const [sql, params] = dbMocks.execute.mock.calls[0];
      expect(sql).toContain("status = 'STALE'");
      expect(sql).toContain('status <> \'REFRESHING\'');
      expect(params[1]).toBe("tenant-a");
    });

    it("does nothing for a null/undefined tenant, without ever touching the database", async () => {
      await invalidateReportRollupsForTenant(null);
      await invalidateReportRollupsForTenant(undefined);
      expect(dbMocks.execute).not.toHaveBeenCalled();
    });
  });
});

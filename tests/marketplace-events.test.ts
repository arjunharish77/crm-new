import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const notificationMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/notifications", () => notificationMocks);

import {
  enqueueAppEvent,
  processAppEventDeliveries,
  listAppDeliveriesForTenant,
  getAppHealthForTenant,
  getAppUsageForTenant,
  getCrossTenantAppHealthOverview,
  getSuspectedProviderOutages,
} from "@/lib/server/marketplace-events";
import { encryptSecretAtRest } from "@/lib/server/secret-encryption";

const TENANT_ID = "tenant-a";

describe("marketplace app event bus", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    notificationMocks.createUserNotification.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  describe("enqueueAppEvent", () => {
    it("does nothing without a tenantId", async () => {
      await enqueueAppEvent(null, "LEAD_CREATED", {});
      expect(dbMocks.query).not.toHaveBeenCalled();
    });

    it("does nothing when no app is subscribed and installed for this event", async () => {
      dbMocks.query.mockResolvedValueOnce([]);
      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });
      expect(dbMocks.execute).not.toHaveBeenCalled();
    });

    it("inserts one delivery per subscribed, installed app, with a per-record idempotency key", async () => {
      dbMocks.query.mockResolvedValueOnce([{ appId: "app-1" }, { appId: "app-2" }]);

      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });

      expect(dbMocks.execute).toHaveBeenCalledTimes(2);
      expect(dbMocks.execute.mock.calls[0][0]).toContain('insert into "TenantAppDelivery"');
      expect(dbMocks.execute.mock.calls[0][1]).toContain("LEAD_CREATED:lead-1");
      expect(dbMocks.execute.mock.calls[0][1][2]).toBe("app-1");
      expect(dbMocks.execute.mock.calls[1][1][2]).toBe("app-2");
    });

    it("only queries apps that are active, subscribed, and INSTALLED (not suspended/pending)", async () => {
      dbMocks.query.mockResolvedValueOnce([]);
      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });
      const sql = String(dbMocks.query.mock.calls[0][0]);
      expect(sql).toContain(`i.status = 'INSTALLED'`);
      expect(sql).toContain(`a."isActive" = true`);
      expect(sql).toContain(`s."isActive" = true`);
    });

    // Regression test for a real cross-tenant fan-out bug: the join to TenantAppInstall must
    // require the SAME tenant as the subscription row, not just the same app. Without
    // `i."tenantId" = s."tenantId"`, tenant A's own live INSTALLED row could incorrectly
    // satisfy tenant B's subscription join for the same app, firing an event for a tenant
    // whose own install isn't even approved yet.
    it("joins the install to the subscription on tenantId as well as appId", async () => {
      dbMocks.query.mockResolvedValueOnce([]);
      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });
      const sql = String(dbMocks.query.mock.calls[0][0]);
      expect(sql).toContain(`i."tenantId" = s."tenantId"`);
    });
  });

  describe("processAppEventDeliveries", () => {
    function mockClaimedRow(overrides: Partial<Record<string, unknown>> = {}) {
      dbMocks.query.mockResolvedValueOnce([{ id: "delivery-1" }]);
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "delivery-1",
        tenantId: TENANT_ID,
        appId: "app-1",
        eventType: "LEAD_CREATED",
        payload: { id: "lead-1" },
        attempts: 0,
        ...overrides,
      });
    }

    it("marks a delivery DELIVERED on a successful response", async () => {
      mockClaimedRow();
      dbMocks.queryOne.mockResolvedValueOnce({ webhookUrl: "https://example.com/hook", name: "Test App" });
      dbMocks.queryOne.mockResolvedValueOnce({ signingSecret: encryptSecretAtRest("sign-secret") });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" }));

      const result = await processAppEventDeliveries(5);

      expect(result.processed).toBe(1);
      const updateCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("status = 'DELIVERED'"));
      expect(updateCall).toBeTruthy();
    });

    it("signs every delivery with the app's own signingSecret", async () => {
      mockClaimedRow();
      dbMocks.queryOne.mockResolvedValueOnce({ webhookUrl: "https://example.com/hook", name: "Test App" });
      dbMocks.queryOne.mockResolvedValueOnce({ signingSecret: encryptSecretAtRest("sign-secret") });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" });
      vi.stubGlobal("fetch", fetchMock);

      await processAppEventDeliveries(5);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["x-app-signature"]).toBeTruthy();
      expect(options.headers["x-app-timestamp"]).toBeTruthy();
    });

    it("cancels a delivery for an app whose webhookUrl was cleared before it ran", async () => {
      mockClaimedRow();
      dbMocks.queryOne.mockResolvedValueOnce({ webhookUrl: null, name: "Test App" });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await processAppEventDeliveries(5);

      expect(fetchMock).not.toHaveBeenCalled();
      const updateCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("status = 'CANCELLED'"));
      expect(updateCall).toBeTruthy();
    });

    it("schedules a retry with backoff when delivery fails and attempts remain", async () => {
      mockClaimedRow({ attempts: 1 });
      dbMocks.queryOne.mockResolvedValueOnce({ webhookUrl: "https://example.com/hook", name: "Test App" });
      dbMocks.queryOne.mockResolvedValueOnce({ signingSecret: null });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" }));

      await processAppEventDeliveries(5);

      const updateCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("status = 'PENDING'"));
      expect(updateCall).toBeTruthy();
      expect(updateCall![1][0]).toBe(2); // attempts incremented
      expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
    });

    it("marks the delivery terminally FAILED (dead-lettered) and notifies once retries are exhausted", async () => {
      mockClaimedRow({ attempts: 4 }); // next attempt would be #5, MAX_ATTEMPTS
      dbMocks.queryOne.mockResolvedValueOnce({ webhookUrl: "https://example.com/hook", name: "Test App" });
      dbMocks.queryOne.mockResolvedValueOnce({ signingSecret: null });
      dbMocks.queryOne.mockResolvedValueOnce(null); // incrementAppUsage's existing-row lookup (none yet)
      dbMocks.queryOne.mockResolvedValueOnce(null); // upsertAppHealth's existing-row lookup (none yet)
      dbMocks.queryOne.mockResolvedValueOnce({ id: "owner-1" }); // tenant owner lookup for the notification
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      await processAppEventDeliveries(5);

      const updateCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("status = 'FAILED'"));
      expect(updateCall).toBeTruthy();
      expect(notificationMocks.createUserNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, userId: "owner-1", title: "App delivery failing" }),
      );
    });

    it("does not process a row that another worker tick already claimed", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "delivery-1" }]);
      dbMocks.queryOne.mockResolvedValueOnce(null); // atomic claim failed
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await processAppEventDeliveries(5);

      expect(result.processed).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("listAppDeliveriesForTenant", () => {
    it("returns an empty array without a tenantId", async () => {
      expect(await listAppDeliveriesForTenant({ id: "u1", tenantId: null }, "app-1")).toEqual([]);
      expect(dbMocks.query).not.toHaveBeenCalled();
    });

    it("scopes the query to the tenant and app", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "delivery-1" }]);
      const rows = await listAppDeliveriesForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");
      expect(rows).toHaveLength(1);
      expect(dbMocks.query.mock.calls[0][1]).toEqual([TENANT_ID, "app-1", 50]);
    });
  });

  describe("per-app daily delivery limit (throttling)", () => {
    it("inserts a visible CANCELLED delivery with a clear reason once the app's daily limit is reached", async () => {
      dbMocks.query.mockResolvedValueOnce([{ appId: "app-1", dailyDeliveryLimit: 5 }]);
      // dailyDeliveryLimit is a global-per-app ceiling (set by the app owner), so usage is
      // summed across every installing tenant, not scoped to one -- see todayUsageCount.
      dbMocks.queryOne.mockResolvedValueOnce({ total: "5" }); // today's usage, summed across tenants, already at the limit

      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });

      expect(dbMocks.execute).toHaveBeenCalledTimes(1);
      const call = dbMocks.execute.mock.calls[0];
      expect(String(call[0])).toContain("'CANCELLED'");
      expect(call[1]).toContain("Daily delivery limit of 5 reached");
    });

    it("still enqueues a normal PENDING delivery while under the limit", async () => {
      dbMocks.query.mockResolvedValueOnce([{ appId: "app-1", dailyDeliveryLimit: 5 }]);
      dbMocks.queryOne.mockResolvedValueOnce({ total: "2" });

      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });

      const call = dbMocks.execute.mock.calls[0];
      expect(String(call[0])).toContain("'PENDING'");
    });

    it("sums usage across every installing tenant when checking the global limit, not just the triggering tenant", async () => {
      dbMocks.query.mockResolvedValueOnce([{ appId: "app-1", dailyDeliveryLimit: 5 }]);
      dbMocks.queryOne.mockResolvedValueOnce({ total: "3" }); // e.g. 1 from tenant-a + 2 from tenant-b

      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });

      const usageQuery = dbMocks.queryOne.mock.calls[0];
      expect(String(usageQuery[0])).toContain("sum(");
      expect(String(usageQuery[0])).not.toContain('"tenantId" =');
    });

    it("skips the usage check entirely when the app has no configured limit", async () => {
      dbMocks.query.mockResolvedValueOnce([{ appId: "app-1", dailyDeliveryLimit: null }]);

      await enqueueAppEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });

      expect(dbMocks.queryOne).not.toHaveBeenCalled();
      const call = dbMocks.execute.mock.calls[0];
      expect(String(call[0])).toContain("'PENDING'");
    });
  });

  describe("getAppHealthForTenant", () => {
    it("returns null without a tenantId", async () => {
      expect(await getAppHealthForTenant({ id: "u1", tenantId: null }, "app-1")).toBeNull();
    });

    it("defaults to UNKNOWN with no stale-credential warning when nothing has ever run", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ count: "0" }).mockResolvedValueOnce(null);

      const health = await getAppHealthForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");

      expect(health?.status).toBe("UNKNOWN");
      expect(health?.queueBacklog).toBe(0);
      expect(health?.staleCredential).toBe(false);
    });

    it("flags a stale credential once the secret is more than 90 days old", async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      dbMocks.queryOne
        .mockResolvedValueOnce({ status: "OK", lastCheckedAt: oldDate, lastSuccessAt: oldDate, lastError: null })
        .mockResolvedValueOnce({ count: "2" })
        .mockResolvedValueOnce({ lastRotatedAt: null, createdAt: oldDate });

      const health = await getAppHealthForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");

      expect(health?.staleCredential).toBe(true);
      expect(health?.queueBacklog).toBe(2);
    });

    it("does not flag a recently-rotated secret as stale", async () => {
      const recentDate = new Date().toISOString();
      dbMocks.queryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ lastRotatedAt: recentDate, createdAt: "2020-01-01T00:00:00.000Z" });

      const health = await getAppHealthForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");

      expect(health?.staleCredential).toBe(false);
    });

    // Gap checklist Module 16's connector health monitoring, "provider outage marker" sub-item.
    it("flags a possible provider outage when this app's own status is ERROR and another app shares its webhook hostname", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ status: "ERROR", lastCheckedAt: "t", lastSuccessAt: null, lastError: "boom" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ lastRotatedAt: "2026-01-01T00:00:00.000Z", createdAt: "2020-01-01T00:00:00.000Z" })
        .mockResolvedValueOnce({ webhookUrl: "https://shared-provider.example.com/hook" });
      dbMocks.query.mockResolvedValueOnce([
        { appId: "app-1", webhookUrl: "https://shared-provider.example.com/hook", status: "ERROR" },
        { appId: "app-2", webhookUrl: "https://shared-provider.example.com/other-path", status: "ERROR" },
      ]);

      const health = await getAppHealthForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");

      expect(health?.possibleProviderOutage).toBe(true);
      expect(health?.affectedAppCount).toBe(2);
    });

    it("does not flag an outage when this app is the only one failing on its hostname", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ status: "ERROR", lastCheckedAt: "t", lastSuccessAt: null, lastError: "boom" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ webhookUrl: "https://only-this-app.example.com/hook" });
      dbMocks.query.mockResolvedValueOnce([{ appId: "app-1", webhookUrl: "https://only-this-app.example.com/hook", status: "ERROR" }]);

      const health = await getAppHealthForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");

      expect(health?.possibleProviderOutage).toBe(false);
      expect(health?.affectedAppCount).toBe(0);
    });

    it("does not even check for an outage when this app's own status is OK", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ status: "OK", lastCheckedAt: "t", lastSuccessAt: "t", lastError: null })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ webhookUrl: "https://shared-provider.example.com/hook" });

      const health = await getAppHealthForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");

      expect(health?.possibleProviderOutage).toBe(false);
      expect(dbMocks.query).not.toHaveBeenCalled();
    });
  });

  describe("getSuspectedProviderOutages", () => {
    it("groups apps by webhook hostname and only reports hostnames with 2+ distinct apps failing", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { appId: "app-1", webhookUrl: "https://provider-a.example.com/hook", status: "ERROR" },
        { appId: "app-2", webhookUrl: "https://provider-a.example.com/other", status: "DEGRADED" },
        { appId: "app-3", webhookUrl: "https://provider-b.example.com/hook", status: "ERROR" },
      ]);

      const outages = await getSuspectedProviderOutages();

      expect(outages).toEqual([{ hostname: "provider-a.example.com", affectedAppCount: 2 }]);
    });

    it("ignores apps with no webhookUrl or a malformed one", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { appId: "app-1", webhookUrl: null, status: "ERROR" },
        { appId: "app-2", webhookUrl: "not-a-url", status: "ERROR" },
      ]);

      const outages = await getSuspectedProviderOutages();
      expect(outages).toEqual([]);
    });

    it("returns an empty list when nothing is failing", async () => {
      dbMocks.query.mockResolvedValueOnce([]);
      expect(await getSuspectedProviderOutages()).toEqual([]);
    });
  });

  describe("getAppUsageForTenant", () => {
    it("returns an empty array without a tenantId", async () => {
      expect(await getAppUsageForTenant({ id: "u1", tenantId: null }, "app-1")).toEqual([]);
      expect(dbMocks.query).not.toHaveBeenCalled();
    });

    it("scopes the query to the tenant and app", async () => {
      dbMocks.query.mockResolvedValueOnce([{ date: "2026-01-01", webhookDeliveryCount: 3, errorCount: 0, requestCount: 0 }]);
      const rows = await getAppUsageForTenant({ id: "u1", tenantId: TENANT_ID }, "app-1");
      expect(rows).toHaveLength(1);
      expect(dbMocks.query.mock.calls[0][1]).toEqual([TENANT_ID, "app-1", 14]);
    });
  });

  describe("getCrossTenantAppHealthOverview", () => {
    it("returns a zeroed count for every status even when some have no rows at all", async () => {
      dbMocks.query.mockReset().mockResolvedValueOnce([{ status: "OK", count: "5" }]);
      const overview = await getCrossTenantAppHealthOverview();
      expect(overview).toEqual({ OK: 5, DEGRADED: 0, ERROR: 0, UNKNOWN: 0 });
    });

    it("never queries or returns anything scoped to a specific tenant or app", async () => {
      dbMocks.query.mockReset().mockResolvedValueOnce([]);
      await getCrossTenantAppHealthOverview();
      expect(dbMocks.query.mock.calls[0][1]).toEqual([]);
    });
  });
});

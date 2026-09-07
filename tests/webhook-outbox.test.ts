import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const notificationMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/notifications", () => notificationMocks);

import {
  enqueueWebhookEvent,
  listWebhookDeliveriesForSubscription,
  processWebhookOutbox,
  sendTestWebhookDelivery,
} from "@/lib/server/webhook-outbox";

const TENANT_ID = "tenant-a";

describe("outbound webhook governance", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    notificationMocks.createUserNotification.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  describe("enqueueWebhookEvent", () => {
    it("inserts one WebhookOutbox row per active subscription listening for the event", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "sub-1" }, { id: "sub-2" }]);

      await enqueueWebhookEvent(TENANT_ID, "LEAD_CREATED", { id: "lead-1" });

      expect(dbMocks.execute).toHaveBeenCalledTimes(2);
      expect(dbMocks.execute.mock.calls[0][0]).toContain('insert into "WebhookOutbox"');
      expect(dbMocks.execute.mock.calls[0][1][2]).toBe("sub-1");
      expect(dbMocks.execute.mock.calls[1][1][2]).toBe("sub-2");
    });

    it("does nothing when no active subscription is listening for the event", async () => {
      dbMocks.query.mockResolvedValueOnce([]);
      await enqueueWebhookEvent(TENANT_ID, "LEAD_CREATED", {});
      expect(dbMocks.execute).not.toHaveBeenCalled();
    });

    it("does nothing when tenantId is null", async () => {
      await enqueueWebhookEvent(null, "LEAD_CREATED", {});
      expect(dbMocks.query).not.toHaveBeenCalled();
    });
  });

  describe("processWebhookOutbox", () => {
    function mockClaimedRow(overrides: Partial<Record<string, unknown>> = {}) {
      dbMocks.query.mockResolvedValueOnce([{ id: "outbox-1" }]);
      dbMocks.queryOne.mockImplementationOnce(async () => ({
        id: "outbox-1",
        tenantId: TENANT_ID,
        subscriptionId: "sub-1",
        eventType: "LEAD_CREATED",
        eventVersion: 1,
        payload: { id: "lead-1" },
        retryCount: 0,
        ...overrides,
      }));
    }

    it("marks a delivery DELIVERED on a successful response", async () => {
      mockClaimedRow();
      dbMocks.queryOne.mockResolvedValueOnce({ id: "sub-1", url: "https://example.com/hook", secret: "s3cret", isActive: true });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" }));

      const result = await processWebhookOutbox(5);

      expect(result.processed).toBe(1);
      const updateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes("status = 'DELIVERED'"));
      expect(updateCall).toBeTruthy();
    });

    it("signs the request with HMAC when the subscription has a secret", async () => {
      mockClaimedRow();
      dbMocks.queryOne.mockResolvedValueOnce({ id: "sub-1", url: "https://example.com/hook", secret: "s3cret", isActive: true });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" });
      vi.stubGlobal("fetch", fetchMock);

      await processWebhookOutbox(5);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["x-webhook-signature"]).toBeTruthy();
      expect(options.headers["x-webhook-timestamp"]).toBeTruthy();
    });

    it("schedules a retry with backoff when delivery fails and attempts remain", async () => {
      mockClaimedRow({ retryCount: 1 });
      dbMocks.queryOne.mockResolvedValueOnce({ id: "sub-1", url: "https://example.com/hook", secret: null, isActive: true });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" }));

      await processWebhookOutbox(5);

      const updateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes("status = 'PENDING'"));
      expect(updateCall).toBeTruthy();
      expect(updateCall![1][0]).toBe(2); // retryCount incremented
      expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
    });

    it("marks the delivery terminally FAILED and notifies once retries are exhausted", async () => {
      mockClaimedRow({ retryCount: 4 }); // next attempt would be #5, the MAX_ATTEMPTS
      dbMocks.queryOne.mockResolvedValueOnce({ id: "sub-1", url: "https://example.com/hook", secret: null, isActive: true });
      dbMocks.queryOne.mockResolvedValueOnce({ id: "owner-1" }); // tenant owner lookup for the notification
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      await processWebhookOutbox(5);

      const updateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes("status = 'FAILED'"));
      expect(updateCall).toBeTruthy();
      expect(notificationMocks.createUserNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, userId: "owner-1", title: "Webhook delivery failing" }),
      );
    });

    it("cancels a delivery whose subscription was paused or deleted before it ran", async () => {
      mockClaimedRow();
      dbMocks.queryOne.mockResolvedValueOnce({ id: "sub-1", url: "https://example.com/hook", secret: null, isActive: false });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await processWebhookOutbox(5);

      expect(fetchMock).not.toHaveBeenCalled();
      const updateCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes("status = 'CANCELLED'"));
      expect(updateCall).toBeTruthy();
    });

    it("does not process a row that another worker tick already claimed", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "outbox-1" }]);
      dbMocks.queryOne.mockResolvedValueOnce(null); // atomic claim failed
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await processWebhookOutbox(5);

      expect(result.processed).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("listWebhookDeliveriesForSubscription", () => {
    it("scopes the query to the subscription and the requesting tenant", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "outbox-1", status: "DELIVERED" }]);
      const deliveries = await listWebhookDeliveriesForSubscription({ id: "user-1", tenantId: TENANT_ID }, "sub-1", 10);
      expect(deliveries).toHaveLength(1);
      expect(dbMocks.query.mock.calls[0][1]).toEqual(["sub-1", TENANT_ID, 10]);
    });
  });

  describe("sendTestWebhookDelivery", () => {
    it("throws when the subscription doesn't belong to this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(sendTestWebhookDelivery({ id: "user-1", tenantId: TENANT_ID }, "sub-1")).rejects.toThrow(
        "WEBHOOK_SUBSCRIPTION_NOT_FOUND",
      );
    });

    it("sends a real signed request and returns the live response without writing to WebhookOutbox", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "sub-1", url: "https://example.com/hook", secret: "s3cret", events: ["LEAD_CREATED"] });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "received" }));

      const result = await sendTestWebhookDelivery({ id: "user-1", tenantId: TENANT_ID }, "sub-1");

      expect(result.httpStatus).toBe(200);
      expect(result.error).toBeNull();
      expect(result.request.headers["x-webhook-signature"]).toBeTruthy();
      expect(dbMocks.execute).not.toHaveBeenCalled();
    });
  });
});

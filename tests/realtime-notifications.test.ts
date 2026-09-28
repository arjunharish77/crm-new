import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// F10 fix (WP05): previously the SSE route opened one dedicated LISTEN connection per browser
// stream; this module keeps exactly one shared connection per process regardless of subscriber
// count. connectMock lets each test see exactly how many times a real connection was opened.
const connectMock = vi.fn();
vi.mock("@/lib/db/pool", () => ({
  getRealtimePool: () => ({ connect: connectMock }),
}));

function makeFakeClient() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { query: vi.fn(async () => undefined) });
}

beforeEach(() => {
  vi.resetModules();
  connectMock.mockReset();
});

describe("subscribeToNotifications", () => {
  it("opens exactly one real connection no matter how many subscribers register", async () => {
    const client = makeFakeClient();
    connectMock.mockResolvedValue(client);
    const { subscribeToNotifications } = await import("@/lib/server/realtime-notifications");

    await subscribeToNotifications({ userId: "user-1", tenantId: "tenant-1", send: vi.fn() });
    await subscribeToNotifications({ userId: "user-2", tenantId: "tenant-1", send: vi.fn() });
    await subscribeToNotifications({ userId: "user-3", tenantId: "tenant-2", send: vi.fn() });

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith("listen crm_notifications");
  });

  it("fans a notification out only to the matching userId + tenantId subscriber", async () => {
    const client = makeFakeClient();
    connectMock.mockResolvedValue(client);
    const { subscribeToNotifications } = await import("@/lib/server/realtime-notifications");

    const sendA = vi.fn();
    const sendB = vi.fn();
    await subscribeToNotifications({ userId: "user-1", tenantId: "tenant-1", send: sendA });
    await subscribeToNotifications({ userId: "user-2", tenantId: "tenant-1", send: sendB });

    client.emit("notification", {
      channel: "crm_notifications",
      payload: JSON.stringify({ id: "n1", userId: "user-1", tenantId: "tenant-1", title: "Hi", message: "Hello", data: {}, createdAt: "2026-01-01" }),
    });

    expect(sendA).toHaveBeenCalledWith(expect.objectContaining({ id: "n1", title: "Hi" }));
    expect(sendB).not.toHaveBeenCalled();
  });

  it("does not fan out to a subscriber in a different tenant even with the same userId", async () => {
    const client = makeFakeClient();
    connectMock.mockResolvedValue(client);
    const { subscribeToNotifications } = await import("@/lib/server/realtime-notifications");

    const send = vi.fn();
    await subscribeToNotifications({ userId: "user-1", tenantId: "tenant-2", send });

    client.emit("notification", {
      channel: "crm_notifications",
      payload: JSON.stringify({ id: "n1", userId: "user-1", tenantId: "tenant-1", title: "Hi", message: "Hello", data: {}, createdAt: "2026-01-01" }),
    });

    expect(send).not.toHaveBeenCalled();
  });

  it("ignores malformed notification payloads instead of throwing", async () => {
    const client = makeFakeClient();
    connectMock.mockResolvedValue(client);
    const { subscribeToNotifications } = await import("@/lib/server/realtime-notifications");
    const send = vi.fn();
    await subscribeToNotifications({ userId: "user-1", tenantId: "tenant-1", send });

    expect(() => client.emit("notification", { channel: "crm_notifications", payload: "{not json" })).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("unsubscribe stops further fan-out to that subscriber without affecting others", async () => {
    const client = makeFakeClient();
    connectMock.mockResolvedValue(client);
    const { subscribeToNotifications } = await import("@/lib/server/realtime-notifications");

    const sendA = vi.fn();
    const sendB = vi.fn();
    const unsubscribeA = await subscribeToNotifications({ userId: "user-1", tenantId: "tenant-1", send: sendA });
    await subscribeToNotifications({ userId: "user-1", tenantId: "tenant-1", send: sendB });
    unsubscribeA();

    client.emit("notification", {
      channel: "crm_notifications",
      payload: JSON.stringify({ id: "n1", userId: "user-1", tenantId: "tenant-1", title: "Hi", message: "Hello", data: {}, createdAt: "2026-01-01" }),
    });

    expect(sendA).not.toHaveBeenCalled();
    expect(sendB).toHaveBeenCalled();
  });

  it("reconnects (opens a new real connection) after the shared client errors out", async () => {
    const firstClient = makeFakeClient();
    const secondClient = makeFakeClient();
    connectMock.mockResolvedValueOnce(firstClient).mockResolvedValueOnce(secondClient);
    const { subscribeToNotifications } = await import("@/lib/server/realtime-notifications");

    await subscribeToNotifications({ userId: "user-1", tenantId: "tenant-1", send: vi.fn() });
    firstClient.emit("error", new Error("connection reset"));

    await subscribeToNotifications({ userId: "user-2", tenantId: "tenant-1", send: vi.fn() });

    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it("propagates a connection failure to the caller (so the SSE route can show its own fallback)", async () => {
    connectMock.mockRejectedValueOnce(new Error("db unavailable"));
    const { subscribeToNotifications } = await import("@/lib/server/realtime-notifications");

    await expect(subscribeToNotifications({ userId: "user-1", tenantId: "tenant-1", send: vi.fn() })).rejects.toThrow("db unavailable");
  });
});

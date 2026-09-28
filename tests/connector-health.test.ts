import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ queryOne: vi.fn() }));
const jobQueueMocks = vi.hoisted(() => ({ getQueueByClass: vi.fn() }));
const crmMocks = vi.hoisted(() => ({
  listWebhooksForTenant: vi.fn(),
  getTelephonySettingsForTenant: vi.fn(),
}));
const communicationsMocks = vi.hoisted(() => ({ listCommunicationProvidersForTenant: vi.fn() }));
const storageMocks = vi.hoisted(() => ({
  getFileStorageDriver: vi.fn(),
  storageRoot: vi.fn(() => "/tmp/connector-health-test-storage"),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/job-queue", () => jobQueueMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/communications", () => communicationsMocks);
vi.mock("@/lib/storage/file-storage", () => storageMocks);

import { getConnectorHealthForTenant } from "@/lib/server/connector-health";

const user = { id: "user-1", tenantId: "tenant-a" };
const originalEnv = { ...process.env };

function byKey(checks: any[], key: string) {
  return checks.find((check) => check.key === key);
}

// WP10 (F18): four independent queue classes now (realtime/operational/heavy/ml) instead of the
// original two (realtime/background) -- getQueueByClass(queueClass) is the one function
// connector-health.ts now calls for every queue's health check, so these tests provide a default
// "empty, healthy" queue for every class and override individual classes per test.
function emptyQueueCounts() {
  return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
}

function makeQueue(counts = emptyQueueCounts()) {
  return {
    client: Promise.resolve({ ping: vi.fn().mockResolvedValue("PONG") }),
    getJobCounts: vi.fn().mockResolvedValue(counts),
  };
}

describe("getConnectorHealthForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    jobQueueMocks.getQueueByClass.mockReset().mockImplementation(() => makeQueue());
    crmMocks.listWebhooksForTenant.mockReset();
    crmMocks.getTelephonySettingsForTenant.mockReset();
    communicationsMocks.listCommunicationProvidersForTenant.mockReset();
    storageMocks.getFileStorageDriver.mockReset().mockReturnValue("s3");
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
    delete process.env.ML_SERVICE_URL;

    dbMocks.queryOne.mockResolvedValue({ ok: 1 });
    crmMocks.listWebhooksForTenant.mockResolvedValue([]);
    crmMocks.getTelephonySettingsForTenant.mockResolvedValue({ config: {}, isActive: false });
    communicationsMocks.listCommunicationProvidersForTenant.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports database ok when the ping succeeds", async () => {
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "database")).toMatchObject({ status: "ok" });
  });

  it("reports database error when the ping throws", async () => {
    dbMocks.queryOne.mockRejectedValueOnce(new Error("connection refused"));
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "database")).toMatchObject({ status: "error", detail: "connection refused" });
  });

  it("reports redis and all four worker queues as not_configured when REDIS_URL is unset", async () => {
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "redis")).toMatchObject({ status: "not_configured" });
    expect(byKey(checks, "worker_queue_realtime")).toMatchObject({ status: "not_configured" });
    expect(byKey(checks, "worker_queue_operational")).toMatchObject({ status: "not_configured" });
    expect(byKey(checks, "worker_queue_heavy")).toMatchObject({ status: "not_configured" });
    expect(byKey(checks, "worker_queue_ml")).toMatchObject({ status: "not_configured" });
    expect(jobQueueMocks.getQueueByClass).not.toHaveBeenCalled();
  });

  it("reports the operational worker queue as degraded when there are failed jobs", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    jobQueueMocks.getQueueByClass.mockImplementation((queueClass: string) =>
      queueClass === "operational" ? makeQueue({ waiting: 2, active: 1, completed: 100, failed: 3, delayed: 0 }) : makeQueue(),
    );

    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "redis")).toMatchObject({ status: "ok" });
    expect(byKey(checks, "worker_queue_operational")).toMatchObject({ status: "degraded" });
  });

  // WP10 (F18): all four queue classes are independently reported -- a backlog of failed heavy
  // jobs (imports/exports/reports) must not make the dispatch-critical realtime queue (or the
  // operational/ml queues) LOOK unhealthy, since they're genuinely separate queues/workers with no
  // shared fate.
  it("reports every worker queue class independently -- a failure on one does not degrade the others", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    jobQueueMocks.getQueueByClass.mockImplementation((queueClass: string) =>
      queueClass === "heavy" ? makeQueue({ waiting: 50, active: 2, completed: 100, failed: 5, delayed: 0 }) : makeQueue(),
    );

    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "worker_queue_heavy")).toMatchObject({ status: "degraded" });
    expect(byKey(checks, "worker_queue_realtime")).toMatchObject({ status: "ok" });
    expect(byKey(checks, "worker_queue_operational")).toMatchObject({ status: "ok" });
    expect(byKey(checks, "worker_queue_ml")).toMatchObject({ status: "ok" });
  });

  it("reports redis and every worker queue as error when the connection throws", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    jobQueueMocks.getQueueByClass.mockImplementation(() => {
      throw new Error("ECONNREFUSED");
    });

    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "redis")).toMatchObject({ status: "error" });
    expect(byKey(checks, "worker_queue_realtime")).toMatchObject({ status: "error" });
    expect(byKey(checks, "worker_queue_operational")).toMatchObject({ status: "error" });
    expect(byKey(checks, "worker_queue_heavy")).toMatchObject({ status: "error" });
    expect(byKey(checks, "worker_queue_ml")).toMatchObject({ status: "error" });
  });

  it("reports ml_service as not_configured when ML_SERVICE_URL is unset", async () => {
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "ml_service")).toMatchObject({ status: "not_configured" });
  });

  it("reports ml_service as ok when its /health endpoint responds", async () => {
    process.env.ML_SERVICE_URL = "http://localhost:9000";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "ml_service")).toMatchObject({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:9000/health", expect.anything());
    vi.unstubAllGlobals();
  });

  it("reports s3 storage as ok without a live probe", async () => {
    storageMocks.getFileStorageDriver.mockReturnValue("s3");
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "storage")).toMatchObject({ status: "ok", detail: expect.stringContaining("s3") });
  });

  it("reports a communication channel as not_configured with no provider row", async () => {
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "channel_email")).toMatchObject({ status: "not_configured" });
  });

  it("reports a communication channel as degraded when configured but inactive", async () => {
    communicationsMocks.listCommunicationProvidersForTenant.mockResolvedValue([
      { channel: "EMAIL", providerType: "SMTP", name: "Primary", isActive: false },
    ]);
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "channel_email")).toMatchObject({ status: "degraded" });
  });

  it("reports a communication channel as ok when an active provider exists", async () => {
    communicationsMocks.listCommunicationProvidersForTenant.mockResolvedValue([
      { channel: "WHATSAPP", providerType: "TWILIO", name: "Primary", isActive: true },
    ]);
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "channel_whatsapp")).toMatchObject({ status: "ok" });
  });

  it("reports webhooks as not_configured with zero subscriptions", async () => {
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "webhooks")).toMatchObject({ status: "not_configured" });
  });

  it("reports webhooks as ok when at least one is active", async () => {
    crmMocks.listWebhooksForTenant.mockResolvedValue([{ id: "wh-1", isActive: true }, { id: "wh-2", isActive: false }]);
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "webhooks")).toMatchObject({ status: "ok", detail: "1 of 2 subscription(s) active" });
  });

  it("reports telephony as ok only when configured and active", async () => {
    crmMocks.getTelephonySettingsForTenant.mockResolvedValue({ config: { provider: "twilio" }, isActive: true });
    const checks = await getConnectorHealthForTenant(user);
    expect(byKey(checks, "telephony")).toMatchObject({ status: "ok" });
  });
});

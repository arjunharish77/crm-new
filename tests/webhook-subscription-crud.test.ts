import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const leadsRepoMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);

import { createWebhookForTenant, updateWebhookForTenant } from "@/lib/server/crm";

// Webhook/integration logic under test; the DATA_PLATFORM module gate itself is covered by
// tests/data-platform-module-gate.test.ts.
vi.mock("@/lib/server/module-entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/module-entitlements")>()),
  assertTenantModule: vi.fn(async () => undefined),
  assertModuleEnabled: vi.fn(async () => undefined),
  isModuleEnabledForTenant: vi.fn(async () => true),
}));


const user = { id: "user-1", tenantId: "tenant-a" };

describe("updateWebhookForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    leadsRepoMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("toggles isActive (pause/resume) while preserving the existing url/events/secret/rateLimitPerMinute", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "wh-1", url: "https://example.com", events: ["LEAD_CREATED"], isActive: true, secret: "s3cret", rateLimitPerMinute: 60 })
      .mockResolvedValueOnce({ id: "wh-1", name: "example.com", url: "https://example.com", events: ["LEAD_CREATED"], isActive: false, secret: "s3cret", rateLimitPerMinute: 60 });

    const updated = await updateWebhookForTenant(user, "wh-1", { isActive: false });

    expect(updated.isActive).toBe(false);
    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1]).toEqual(["https://example.com", JSON.stringify(["LEAD_CREATED"]), false, "s3cret", 60, expect.any(String), "wh-1", "tenant-a"]);
  });

  it("replaces the event subscription list when new events are provided", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "wh-1", url: "https://example.com", events: ["LEAD_CREATED"], isActive: true, secret: null })
      .mockResolvedValueOnce({ id: "wh-1", events: ["OPPORTUNITY_CREATED", "STAGE_CHANGED"] });

    await updateWebhookForTenant(user, "wh-1", { events: ["OPPORTUNITY_CREATED", "STAGE_CHANGED"] });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][1]).toBe(JSON.stringify(["OPPORTUNITY_CREATED", "STAGE_CHANGED"]));
  });

  it("throws when the webhook doesn't belong to this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(updateWebhookForTenant(user, "wh-1", { isActive: false })).rejects.toThrow("WEBHOOK_NOT_FOUND");
  });

  // F07 fix (WP06): a webhook subscription's URL is fetched by the server, unauthenticated by
  // the destination -- the audit's own worst-case citation for this finding.
  it("rejects updating the URL to a private/internal address, without touching the row", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "wh-1", url: "https://example.com", events: ["LEAD_CREATED"], isActive: true, secret: null });
    await expect(updateWebhookForTenant(user, "wh-1", { url: "http://127.0.0.1:8080/internal" })).rejects.toThrow();
    // Only the initial lookup ran -- no update statement was issued.
    expect(dbMocks.queryOne).toHaveBeenCalledTimes(1);
  });

  it("does not revalidate the URL when a webhook update doesn't touch it", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "wh-1", url: "http://127.0.0.1/already-saved-before-this-fix", events: ["LEAD_CREATED"], isActive: true, secret: null })
      .mockResolvedValueOnce({ id: "wh-1", isActive: false });
    await expect(updateWebhookForTenant(user, "wh-1", { isActive: false })).resolves.toBeDefined();
  });
});

describe("createWebhookForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    leadsRepoMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a private/internal destination at creation time", async () => {
    await expect(createWebhookForTenant(user, { name: "Internal probe", url: "http://169.254.169.254/latest/meta-data/" })).rejects.toThrow();
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) scheme", async () => {
    await expect(createWebhookForTenant(user, { name: "File scheme", url: "file:///etc/passwd" })).rejects.toThrow();
  });

  it("creates normally for a public https destination", async () => {
    // A literal public IP (rather than a hostname) so this test doesn't depend on real DNS
    // resolution succeeding in whatever environment it runs in -- hostname-based resolution is
    // covered by outbound-request-guard.test.ts's own mocked-DNS tests.
    dbMocks.queryOne.mockResolvedValueOnce({ id: "wh-2", name: "Partner", url: "https://8.8.8.8/hook", events: ["LEAD_CREATED"], isActive: true });
    const created = await createWebhookForTenant(user, { name: "Partner", url: "https://8.8.8.8/hook" });
    expect(created.id).toBe("wh-2");
  });
});

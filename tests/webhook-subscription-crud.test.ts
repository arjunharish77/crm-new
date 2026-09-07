import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const leadsRepoMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);

import { updateWebhookForTenant } from "@/lib/server/crm";

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
});

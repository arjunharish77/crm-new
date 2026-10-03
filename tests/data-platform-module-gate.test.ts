import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real module-entitlements + real webhook/inbound code; only the database, the network and the
// signature check are faked. DATA_PLATFORM covers outbound webhooks, inbound lead capture,
// external pushes and the dedupe/merge center (2026-09-29 scope decision).
const db = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[], status: "DISABLED" as string | null }));

vi.mock("@/lib/db/query", () => {
  const rows = (sql: string, params: unknown[]) => {
    db.statements.push({ sql, params });
    if (sql.includes('from "TenantModuleEntitlement"')) return db.status ? [{ status: db.status }] : [];
    if (sql.includes('from "WebhookSubscription"') && sql.includes("events @>")) return [{ id: "sub-1" }];
    if (sql.includes('from "WebhookSubscription"')) return [{ id: "sub-1", isActive: true, url: "https://hooks.example.com/x", secret: "s" }];
    return [];
  };
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => rows(sql, params)),
    queryOne: vi.fn(async (sql: string, params: unknown[] = []) => rows(sql, params)[0] ?? null),
    queryAsSystem: vi.fn(async (sql: string, params: unknown[] = []) => rows(sql, params)),
    queryOneAsSystem: vi.fn(async (sql: string, params: unknown[] = []) => rows(sql, params)[0] ?? null),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => { rows(sql, params); return { rowCount: 1 }; }),
    jsonbParam: (value: unknown) => JSON.stringify(value ?? null),
  };
});

vi.mock("@/lib/server/inbound-webhooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/inbound-webhooks")>()),
  verifyInboundWebhookRequest: vi.fn(async () => ({ ok: true })),
}));

const writes = () => db.statements.filter(({ sql }) => /^\s*(insert|update|delete)/i.test(sql));

beforeEach(() => {
  db.statements = [];
  db.status = "DISABLED";
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
});

describe("Data Platform module gate", () => {
  it("guards every user-facing Data Platform function (source contract)", () => {
    const gated: Record<string, string[]> = {
      "src/lib/server/dedupe.ts": ["listDedupeMatchRulesForTenant", "updateDedupeMatchRuleForTenant", "runDedupeScanForTenant", "listDedupeMatchesForTenant", "dismissDedupeMatchForTenant", "mergeRecordsForTenant", "unmergeForTenant", "listMergeAuditsForTenant"],
      "src/lib/server/inbound-webhooks.ts": ["getInboundWebhookSettingsForTenant", "rotateInboundWebhookSecret", "listInboundWebhookEventsForTenant", "retryInboundWebhookEvent", "sendTestInboundWebhookPayload", "captureInboundLead"],
      "src/lib/server/webhook-outbox.ts": ["listWebhookDeliveriesForSubscription", "sendTestWebhookDelivery"],
      "src/lib/repositories/external-integrations-postgres.ts": ["listExternalIntegrationsForTenant", "getExternalIntegrationForTenant", "createExternalIntegrationForTenant", "updateExternalIntegrationForTenant", "deleteExternalIntegrationForTenant", "previewExternalIntegrationPush", "pushExternalIntegration", "listExternalPushAttemptsForRecord"],
      "src/lib/server/crm.ts": ["listWebhooksForTenant", "createWebhookForTenant", "updateWebhookForTenant", "deleteWebhookForTenant"],
    };
    const ungated: string[] = [];
    for (const [file, names] of Object.entries(gated)) {
      const source = fs.readFileSync(file, "latin1");
      for (const name of names) {
        const at = source.indexOf(`export async function ${name}(`);
        if (at < 0 || !/"DATA_PLATFORM"\)/.test(source.slice(at, at + 500))) ungated.push(`${file}:${name}`);
      }
    }
    // Every exported function in the dedupe / external-integration modules must be listed above.
    for (const file of ["src/lib/server/dedupe.ts", "src/lib/repositories/external-integrations-postgres.ts"]) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/export async function (\w+)\(/g)) {
        if (!gated[file].includes(match[1])) ungated.push(`${file}:${match[1]} (not reviewed)`);
      }
    }
    expect(ungated).toEqual([]);
  });

  it("queues no outbound webhook for a disabled tenant, without failing the record write", async () => {
    const { enqueueWebhookEvent } = await import("@/lib/server/webhook-outbox");
    await expect(enqueueWebhookEvent("t1", "lead.created" as any, { id: "l1" })).resolves.toBeUndefined();
    expect(writes()).toEqual([]);
    db.status = null; // no entitlement row = enabled
    await enqueueWebhookEvent("t1", "lead.created" as any, { id: "l1" });
    expect(writes().some(({ sql }) => sql.includes('insert into "WebhookOutbox"'))).toBe(true);
  });

  it("cancels (does not send) a delivery queued before the module was disabled", async () => {
    const { queryAsSystem, queryOneAsSystem } = await import("@/lib/db/query");
    vi.mocked(queryAsSystem).mockResolvedValueOnce([{ id: "out-1" }] as any);
    vi.mocked(queryOneAsSystem).mockResolvedValueOnce({ id: "out-1", tenantId: "t1", subscriptionId: "sub-1", eventType: "lead.created", eventVersion: 1, payload: {}, retryCount: 0 } as any);
    const { processWebhookOutbox } = await import("@/lib/server/webhook-outbox");
    await processWebhookOutbox(5);
    expect(fetch).not.toHaveBeenCalled();
    expect(writes().some(({ sql, params }) => sql.includes("status = 'CANCELLED'") && params.includes("out-1"))).toBe(true);
  });

  it("refuses inbound lead capture with 403 and writes nothing", async () => {
    const { POST } = await import("@/app/api/integrations/inbound/leads/[tenantId]/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/inbound/leads/t1", { method: "POST", body: JSON.stringify({ name: "Web lead", email: "web@example.com" }) }),
      { params: Promise.resolve({ tenantId: "t1" }) } as any,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe("Data Platform is not enabled for this workspace");
    expect(writes()).toEqual([]);
  });
});

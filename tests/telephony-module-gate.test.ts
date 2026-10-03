import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real module-entitlements + real telephony webhook code; only the database and the signature
// check are faked. A DISABLED TELEPHONY entitlement must stop the call before any write.
const db = vi.hoisted(() => ({ writes: [] as string[], status: "DISABLED" as string | null }));

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async (sql: string) => {
    if (sql.includes('from "TenantModuleEntitlement"')) return db.status ? { status: db.status } : null;
    return null;
  }),
  execute: vi.fn(async (sql: string) => {
    db.writes.push(sql);
    return { rowCount: 1 };
  }),
  jsonbParam: (value: unknown) => JSON.stringify(value ?? null),
}));

vi.mock("@/lib/server/telephony-webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/telephony-webhook")>()),
  verifyTelephonyWebhookRequest: vi.fn(async () => ({ ok: true })),
}));

beforeEach(() => {
  db.writes = [];
  db.status = "DISABLED";
});

describe("Telephony module gate", () => {
  it("guards every user-facing telephony function (source contract)", () => {
    // Deliberately not gated: pure scoring input, data-retention cleanup, and internal helpers
    // only reachable through a gated entry point (webhook ingestion / click-to-call).
    const notGated = new Set(["computeTelephonySignals", "expireCallRecordings", "queueTelephonyCall", "removeCallFromQueue", "checkTelephonyComplianceForCall", "verifyTelephonyWebhookRequest"]);
    const files = ["agent-availability", "call-campaigns", "call-center", "call-queues", "call-recordings", "call-scripts", "dispositions", "inbound-caller-context", "telephony-webhook", "telephony-signals"];
    const ungated: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(`src/lib/server/${file}.ts`, "utf8");
      for (const match of source.matchAll(/export (?:async )?function (\w+)\(/g)) {
        const name = match[1];
        if (notGated.has(name)) continue;
        const body = source.slice(match.index, match.index + 1200);
        if (!/await (assertTenantModule\([^)]*"TELEPHONY"\)|assertModuleEnabled\([^)]*"TELEPHONY"\))/.test(body)) ungated.push(`${file}.${name}`);
      }
    }
    const crm = fs.readFileSync("src/lib/server/crm.ts", "latin1");
    for (const name of ["getTelephonySettingsForTenant", "saveTelephonySettingsForTenant", "listTelephonyCallLogsForTenant", "createTelephonyCallLogForTenant", "buildClickToCallPayloadForTenant", "getAgentPopupContextForTenant"]) {
      const at = crm.indexOf(`export async function ${name}(`);
      if (at < 0 || !crm.slice(at, at + 400).includes('assertTenantModule(user, "TELEPHONY")')) ungated.push(`crm.${name}`);
    }
    expect(ungated).toEqual([]);
  });

  it("maps a disabled module to a 403 that names it", async () => {
    const { serverError } = await import("@/lib/server/http");
    const response = serverError("fallback", new Error("MODULE_DISABLED:TELEPHONY"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "MODULE_DISABLED", module: "TELEPHONY", message: "Telephony is not enabled for this workspace" });
  });

  it("refuses a disabled tenant's gated call before touching data", async () => {
    const { listCallScriptsForTenant } = await import("@/lib/server/call-scripts");
    await expect(listCallScriptsForTenant({ id: "u1", tenantId: "t1" } as any)).rejects.toThrow("MODULE_DISABLED:TELEPHONY");
    db.status = "SUSPENDED";
    await expect(listCallScriptsForTenant({ id: "u1", tenantId: "t1" } as any)).rejects.toThrow("MODULE_DISABLED:TELEPHONY");
    // Platform admins keep access, matching every other module gate.
    db.status = "DISABLED";
    await expect(listCallScriptsForTenant({ id: "u1", tenantId: "t1", isPlatformAdmin: true } as any)).resolves.toBeDefined();
  });

  it("rejects provider webhook events with 403 and records nothing while Telephony is off", async () => {
    const { POST } = await import("@/app/api/integrations/telephony/webhook/route");
    const response = await POST(new Request("http://localhost/api/integrations/telephony/webhook", {
      method: "POST",
      body: JSON.stringify({ tenantId: "t1", callId: "c1", direction: "INBOUND", fromNumber: "+919876543210", status: "ringing" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("MODULE_DISABLED");
    expect(db.writes).toEqual([]);
  });
});

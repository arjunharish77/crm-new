import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const db = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), queryOneAsSystem: vi.fn(), executeAsSystem: vi.fn() }));
const telephony = vi.hoisted(() => ({ recordTelephonyCallEvent: vi.fn(), fireRecordingAvailableAutomation: vi.fn() }));
const afterQueue = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (task: () => unknown) => afterQueue.push(task) }));
vi.mock("@/lib/db/query", () => db);
vi.mock("@/lib/server/module-entitlements", () => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/server/secret-encryption", () => ({ decryptSecretAtRest: vi.fn(() => "token") }));
vi.mock("@/lib/server/telephony-webhook", () => telephony);
vi.mock("@/lib/storage/file-storage", () => ({ writePrivateFileStream: vi.fn(), deletePrivateFile: vi.fn() }));

import { POST } from "@/app/api/integrations/telephony/plivo/[tenantId]/[action]/route";
import { plivoV3SignedString } from "@/lib/server/plivo";

const TENANT = "tenant-1";
let config: Record<string, unknown>;
let callLog: Record<string, unknown> | null;
let nonceUsed: boolean;
let nonceCounter = 0;

function signedRequest(action: string, query: Record<string, string>, form: Record<string, string>, options: { token?: string; tenant?: string; headers?: Record<string, string> } = {}) {
  const url = new URL(`https://crm.example.com/api/integrations/telephony/plivo/${options.tenant ?? TENANT}/${action}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const body = new URLSearchParams(form);
  const nonce = `nonce-${++nonceCounter}`;
  const signature = createHmac("sha256", options.token ?? "token").update(plivoV3SignedString(url.toString(), body, nonce)).digest("base64");
  // The app sees its internal address behind the proxy; the signature is over the public one.
  const internal = url.toString().replace("https://crm.example.com", "http://127.0.0.1:3000");
  const request = new Request(internal, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-plivo-signature-v3": signature, "x-plivo-signature-v3-nonce": nonce, ...options.headers },
    body: body.toString(),
  });
  return POST(request, { params: Promise.resolve({ tenantId: options.tenant ?? TENANT, action }) });
}

async function runAfterTasks() {
  while (afterQueue.length) await afterQueue.shift()!();
}

describe("Plivo callback route", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://crm.example.com";
    afterQueue.length = 0;
    nonceUsed = false;
    config = { provider: "plivo", plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "enc", outboundCallerId: "+911111111111", inboundNumber: "+911111111111", defaultAgentNumber: "+918888888888", plivoRingTimeoutSeconds: 30 };
    callLog = { id: "log-1", status: "dialing", direction: "OUTBOUND", fromNumber: "+911111111111", toNumber: "+913333333333", leadId: "lead-1", opportunityId: null, agentId: "user-1", metadata: {} };
    db.query.mockReset().mockResolvedValue([]);
    db.queryOne.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes(`from "IntegrationSetting"`)) return { isActive: true, config };
      if (sql.includes(`from "TelephonyCallLog"`)) return callLog;
      return null;
    });
    db.queryOneAsSystem.mockReset().mockImplementation(async () => (nonceUsed ? { used: 1 } : null));
    db.executeAsSystem.mockReset().mockResolvedValue(1);
    telephony.recordTelephonyCallEvent.mockReset().mockResolvedValue({ id: "log-1" });
  });

  it("refuses unknown actions, malformed workspaces, bad signatures and a switched-off connector alike", async () => {
    expect((await signedRequest("other", {}, {})).status).toBe(404);
    const malformed = await signedRequest("event", { source: "hangup" }, {}, { tenant: "bad tenant!" });
    const badSignature = await signedRequest("event", { source: "hangup" }, { CallUUID: "c" }, { token: "wrong" });
    config = { ...config, provider: "exotel" };
    const disabled = await signedRequest("event", { source: "hangup" }, { CallUUID: "c" });
    for (const response of [malformed, badSignature, disabled]) {
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("Forbidden");
    }
    expect(telephony.recordTelephonyCallEvent).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before reading it", async () => {
    const response = await signedRequest("event", { source: "hangup" }, {}, { headers: { "content-length": "999999" } });
    expect(response.status).toBe(413);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("outbound answer: dials the customer on the call log, answers before logging, then logs and keeps the nonce", async () => {
    const response = await signedRequest("answer", { callId: "crm-1", flow: "outbound" }, { CallUUID: "a-leg", Direction: "outbound", From: "911111111111", To: "918888888888" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    const xml = await response.text();
    expect(xml).toContain("<Number>+913333333333</Number>");
    expect(xml).toContain('callerId="+911111111111"');
    expect(xml).toContain("dial-status?callId=crm-1");
    expect(telephony.recordTelephonyCallEvent).not.toHaveBeenCalled();
    await runAfterTasks();
    expect(telephony.recordTelephonyCallEvent).toHaveBeenCalledWith(TENANT, expect.objectContaining({ callId: "crm-1", status: "ringing" }), { id: "user-1", tenantId: TENANT });
    expect(db.executeAsSystem).toHaveBeenCalledWith(expect.stringContaining(`insert into "TelephonyWebhookNonce"`), [expect.any(String), TENANT, expect.stringMatching(/^nonce-/)]);
  });

  it("a replayed callback gets its answer but changes nothing", async () => {
    nonceUsed = true;
    const answer = await signedRequest("answer", { callId: "crm-1", flow: "outbound" }, { CallUUID: "a-leg" });
    expect(await answer.text()).toContain("<Dial");
    const event = await signedRequest("event", { callId: "crm-1", source: "hangup" }, { CallUUID: "a-leg" });
    expect(await event.json()).toEqual({ ok: true, duplicate: true });
    await runAfterTasks();
    expect(telephony.recordTelephonyCallEvent).not.toHaveBeenCalled();
    expect(db.executeAsSystem).not.toHaveBeenCalled();
  });

  it("inbound with nobody to ring: plays the message and logs a missed call", async () => {
    config = { ...config, defaultAgentNumber: "", plivoUnavailableMessage: "We are closed & will call back." };
    callLog = null;
    const response = await signedRequest("answer", {}, { CallUUID: "in-1", Direction: "inbound", From: "917777777777", To: "911111111111" });
    expect(await response.text()).toContain("<Speak>We are closed &amp; will call back.</Speak><Hangup/>");
    await runAfterTasks();
    expect(telephony.recordTelephonyCallEvent).toHaveBeenCalledWith(TENANT, expect.objectContaining({
      callId: "in-1", direction: "INBOUND", status: "no-answer", fromNumber: "+917777777777", metadata: expect.objectContaining({ outcomeReason: "NO_AGENT_AVAILABLE" }),
    }), undefined);
  });

  it("inbound not answered by the lead owner: rings the default agent phone next, then plays the message", async () => {
    callLog = { ...callLog, direction: "INBOUND", status: "ringing", metadata: { agentPhone: "+919999999999" } };
    const first = await (await signedRequest("dial-status", { callId: "in-1", stage: "primary" }, { DialStatus: "no-answer", Direction: "inbound" })).text();
    expect(first).toContain("<Number>+918888888888</Number>");
    expect(first).toContain("stage=fallback");
    const second = await (await signedRequest("dial-status", { callId: "in-1", stage: "fallback" }, { DialStatus: "timeout", Direction: "inbound" })).text();
    expect(second).toContain("<Speak>");
    await runAfterTasks();
    expect(telephony.recordTelephonyCallEvent.mock.calls.map(([, input]) => input.status)).toEqual(["ringing", "no-answer"]);
  });

  it("outbound dial finished: hangs up and records the outcome", async () => {
    callLog = { ...callLog, status: "ringing" };
    expect(await (await signedRequest("dial-status", { callId: "crm-1" }, { DialStatus: "busy" })).text()).toContain("<Hangup/>");
    await runAfterTasks();
    expect(telephony.recordTelephonyCallEvent).toHaveBeenCalledWith(TENANT, expect.objectContaining({ status: "busy" }), expect.anything());
  });

  it("rejects an unknown event source and answers 404 for a call it didn't place", async () => {
    expect((await signedRequest("event", { callId: "crm-1", source: "other" }, {})).status).toBe(400);
    callLog = null;
    expect((await signedRequest("event", { callId: "crm-x", source: "dial" }, { Direction: "outbound", DialAction: "answer" })).status).toBe(404);
  });
});

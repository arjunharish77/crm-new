import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import { parse as parseQuery } from "querystring";

const db = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), queryOneAsSystem: vi.fn(), executeAsSystem: vi.fn() }));
const files = vi.hoisted(() => ({ writePrivateFileStream: vi.fn(), deletePrivateFile: vi.fn() }));
const telephony = vi.hoisted(() => ({ recordTelephonyCallEvent: vi.fn(), fireRecordingAvailableAutomation: vi.fn() }));
vi.mock("@/lib/db/query", () => db);
vi.mock("@/lib/server/module-entitlements", () => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/server/secret-encryption", () => ({ decryptSecretAtRest: vi.fn(() => "token") }));
vi.mock("@/lib/server/telephony-webhook", () => telephony);
vi.mock("@/lib/storage/file-storage", () => files);

import {
  advancePlivoStatus, inboundPlivoTarget, normalizePhone, plivoAgentPhoneForUser, plivoDialOutcome, plivoDialXml,
  plivoV3SignedString, savePlivoRecording, startPlivoCall, syncPlivoEvent, verifyPlivoV3Signature,
} from "@/lib/server/plivo";

// A line-for-line port of plivo-node lib/utils/v3Security.js (construct_get_url,
// construct_post_url, get_signature_v3), the code Plivo's SDK uses to check these callbacks, so
// the CRM's implementation is checked against Plivo's rather than against itself.
function sdkSignatureV3(uri: string, nonce: string, authToken: string, params: Record<string, string | string[]>) {
  const getMapFromQuery = (first: Record<string, any>, second: Record<string, any>) => {
    const merged: Record<string, string[]> = {};
    for (const key of Object.keys(first)) merged[key] = Array.isArray(first[key]) ? first[key] : [first[key]];
    for (const key of Object.keys(second)) {
      const value = Array.isArray(second[key]) ? second[key] : [second[key]];
      merged[key] = key in merged ? merged[key].concat(value) : value;
    }
    return merged;
  };
  const sortedQueryString = (params: Record<string, string[]>) => {
    const parts: string[] = [];
    Object.keys(params).sort().forEach((key) => params[key].sort().forEach((value) => parts.push(`${key}=${value}`)));
    return parts.join("&");
  };
  const sortedParamsString = (params: Record<string, string | string[]>) => {
    const parts: string[] = [];
    Object.keys(params).sort().forEach((key) => {
      const value = params[key];
      if (Array.isArray(value)) [...value].sort().forEach((item) => parts.push(key + item));
      else parts.push(key + value);
    });
    return parts.join("");
  };
  const constructGetUrl = (uri: string, params: Record<string, any>, emptyPostParams = true) => {
    const parsed = new URL(uri);
    let baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    const queryParams = sortedQueryString(getMapFromQuery(parseQuery(parsed.search.replace(/^\?/, "")) as Record<string, any>, params));
    if (queryParams.length > 0 || !emptyPostParams) baseUrl += `?${queryParams}`;
    if (queryParams.length > 0 && !emptyPostParams) baseUrl += ".";
    return baseUrl;
  };
  const baseUrl = constructGetUrl(uri, {}, Object.keys(params).length === 0) + sortedParamsString(params);
  return createHmac("sha256", authToken).update(`${baseUrl}.${nonce}`).digest("base64");
}

function formOf(params: Record<string, string | string[]>) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  return form;
}

const callRow = (overrides: Record<string, unknown> = {}) => ({
  id: "log-1", status: "dialing", direction: "OUTBOUND", fromNumber: "+911111111111", toNumber: "+913333333333",
  leadId: "lead-1", opportunityId: null, agentId: "user-1", metadata: {}, ...overrides,
});
const activeConfig = { isActive: true, config: { provider: "plivo", plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "encrypted", outboundCallerId: "+911111111111", defaultAgentNumber: "+918888888888" } };

describe("native Plivo connector", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env.APP_URL = "https://crm.example.com";
    db.queryOne.mockReset();
    db.query.mockReset();
    telephony.recordTelephonyCallEvent.mockReset().mockResolvedValue({ id: "log-1" });
    telephony.fireRecordingAvailableAutomation.mockReset().mockResolvedValue(undefined);
    files.writePrivateFileStream.mockReset().mockResolvedValue({ storageKey: "stored", prefix: Buffer.from("ID3") });
    files.deletePrivateFile.mockReset().mockResolvedValue(undefined);
  });

  describe("Signature V3", () => {
    const cases: Array<[string, string, Record<string, string | string[]>]> = [
      ["query and form fields", "https://crm.example.com/api/integrations/telephony/plivo/t1/answer?flow=outbound&callId=abc", { To: "+919999999999", CallUUID: "call-1", From: "918888888888", Direction: "outbound" }],
      ["form fields only", "https://crm.example.com/api/integrations/telephony/plivo/t1/answer", { From: "918888888888", CallUUID: "call-1", CallStatus: "in-progress" }],
      ["query only", "https://crm.example.com/api/integrations/telephony/plivo/t1/event?source=hangup", {}],
      ["encoded query values and repeated keys", "https://crm.example.com/api/integrations/telephony/plivo/t1/event?source=dial&callId=a%2Bb&z=1&z=0", { b: ["2", "1"], a: "x y", B: "upper" }],
    ];
    it.each(cases)("matches Plivo's SDK for %s", (_label, url, params) => {
      const form = formOf(params);
      const signature = sdkSignatureV3(url, "nonce-123", "token", params);
      expect(verifyPlivoV3Signature(url, form, "nonce-123", signature, "token")).toBe(true);
      // Plivo can send more than one signature (token rotation), comma-separated.
      expect(verifyPlivoV3Signature(url, form, "nonce-123", `bogus,${signature}`, "token")).toBe(true);
    });

    it("builds the documented string", () => {
      expect(plivoV3SignedString("https://h.example/p?b=2&a=1", formOf({ To: "1", From: "2" }), "n")).toBe("https://h.example/p?a=1&b=2.From2To1.n");
      expect(plivoV3SignedString("https://h.example/p", formOf({ To: "1" }), "n")).toBe("https://h.example/p?To1.n");
      expect(plivoV3SignedString("https://h.example/p", new URLSearchParams(), "n")).toBe("https://h.example/p.n");
    });

    it("rejects a changed field, a changed URL, another token and a missing nonce", () => {
      const url = cases[0][1];
      const params = cases[0][2];
      const signature = sdkSignatureV3(url, "nonce-123", "token", params);
      expect(verifyPlivoV3Signature(url, formOf({ ...params, To: "+917777777777" }), "nonce-123", signature, "token")).toBe(false);
      expect(verifyPlivoV3Signature(url.replace("t1", "t2"), formOf(params), "nonce-123", signature, "token")).toBe(false);
      expect(verifyPlivoV3Signature(url, formOf(params), "nonce-123", signature, "other")).toBe(false);
      expect(verifyPlivoV3Signature(url, formOf(params), null, signature, "token")).toBe(false);
      expect(verifyPlivoV3Signature(url, formOf(params), "nonce-124", signature, "token")).toBe(false);
    });
  });

  it("writes Indian numbers in E.164", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(normalizePhone("080 2345 6789")).toBe("+918023456789");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalizePhone("0091 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalizePhone("4155550100", "1")).toBe("+14155550100");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("rings the user's mapped phone, else their profile phone, never the Plivo number", () => {
    const config = { outboundCallerId: "+911111111111", userAgentMappings: [{ userId: "u1", phoneNumber: "9222222222" }] };
    expect(plivoAgentPhoneForUser(config, "u1", "9333333333")).toBe("+919222222222");
    expect(plivoAgentPhoneForUser(config, "u2", "9333333333")).toBe("+919333333333");
    expect(plivoAgentPhoneForUser(config, "u2", "1111111111")).toBeNull();
  });

  it("dials with a ring timeout, a dial outcome URL and a 4-hour recording cap, and no phone numbers in URLs", () => {
    const recorded = plivoDialXml("tenant", { target: "+919999999999", callId: "call", recordingEnabled: true, callerId: "+911111111111", timeoutSeconds: 30 });
    expect(recorded).toContain('<Record startOnDialAnswer="true" maxLength="14400"');
    expect(recorded).toContain("/recording?callId=call");
    expect(recorded).toContain('timeout="30"');
    expect(recorded).toContain('action="https://crm.example.com/api/integrations/telephony/plivo/tenant/dial-status?callId=call"');
    expect(recorded).toContain("/event?callId=call&amp;source=dial");
    expect(recorded).toContain("<Number>+919999999999</Number>");
    expect(recorded.match(/https:[^"]+/g)!.join(" ")).not.toMatch(/9999999999|1111111111/);
    expect(plivoDialXml("tenant", { target: "+919999999999", callId: "call", recordingEnabled: false, timeoutSeconds: 30 })).not.toContain("<Record");
    expect(plivoDialXml("tenant", { target: "+919999999999", callId: "call", recordingEnabled: false, timeoutSeconds: 30, stage: "fallback" })).toContain("dial-status?callId=call&amp;stage=fallback");
  });

  it("places the agent leg with the CRM call ID in every callback and no phone numbers in URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ request_uuid: "req-1" }) }));
    const result = await startPlivoCall("tenant", { plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "encrypted", outboundCallerId: "1111111111", plivoRingTimeoutSeconds: 25 }, "2222222222", "3333333333", "crm-call-1");
    expect(result).toEqual({ requestUuid: "req-1", agentNumber: "+912222222222", customerNumber: "+913333333333", fromNumber: "+911111111111" });
    const [endpoint, options] = vi.mocked(fetch).mock.calls[0];
    expect(endpoint).toBe("https://api.plivo.com/v1/Account/AUTH/Call/");
    const body = JSON.parse(String(options?.body));
    expect(body.to).toBe("+912222222222");
    expect(body.ring_timeout).toBe(25);
    expect(body.answer_url).toBe("https://crm.example.com/api/integrations/telephony/plivo/tenant/answer?callId=crm-call-1&flow=outbound");
    expect(body.hangup_url).toContain("callId=crm-call-1&source=hangup");
    expect([body.answer_url, body.ring_url, body.hangup_url].join(" ")).not.toMatch(/3333333333|2222222222/);
    expect(String((options?.headers as Record<string, string>).Authorization)).toContain("Basic ");
    await expect(startPlivoCall("tenant", { plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "encrypted", outboundCallerId: "1111111111" }, "1111111111", "3333333333", "x")).rejects.toThrow("PLIVO_AGENT_NUMBER_CANNOT_BE_PLIVO_NUMBER");
  });

  it("routes an inbound lead to its owner, or to the default agent if the owner has no phone", async () => {
    db.query.mockResolvedValueOnce([{ id: "lead", ownerId: "owner" }]);
    db.queryOne.mockResolvedValueOnce({ phone: "+919999999999" });
    const config = { defaultAgentNumber: "8888888888", inboundNumber: "+911111111111" };
    expect(await inboundPlivoTarget("tenant", config, "+917777777777")).toEqual({ leadId: "lead", agentId: "owner", target: "+919999999999" });
    db.query.mockResolvedValueOnce([{ id: "lead", ownerId: "owner" }]);
    db.queryOne.mockResolvedValueOnce({ phone: null }).mockResolvedValueOnce({ id: "fallback" });
    expect(await inboundPlivoTarget("tenant", config, "+917777777777")).toEqual({ leadId: "lead", agentId: "fallback", target: "+918888888888" });
    db.query.mockResolvedValueOnce([{ id: "lead-1", ownerId: "one" }, { id: "lead-2", ownerId: "two" }]);
    db.queryOne.mockResolvedValueOnce({ id: "fallback" });
    expect(await inboundPlivoTarget("tenant", config, "+917777777777")).toEqual({ leadId: null, agentId: "fallback", target: "+918888888888" });
    db.query.mockResolvedValueOnce([]);
    expect(await inboundPlivoTarget("tenant", { defaultAgentNumber: "+911111111111", inboundNumber: "1111111111" }, "+917777777777")).toEqual({ leadId: null, agentId: null, target: null });
  });

  describe("call outcomes", () => {
    it("maps Plivo's DialStatus values", () => {
      expect(plivoDialOutcome("completed")).toBe("completed");
      expect(plivoDialOutcome("busy")).toBe("busy");
      expect(plivoDialOutcome("failed")).toBe("failed");
      for (const value of ["cancel", "timeout", "no-answer", null]) expect(plivoDialOutcome(value)).toBe("no-answer");
    });

    it("only moves a call forward and keeps its first outcome", () => {
      expect(advancePlivoStatus("dialing", "ringing")).toBe("ringing");
      expect(advancePlivoStatus("answered", "ringing")).toBe("answered");
      expect(advancePlivoStatus("ringing", "no-answer")).toBe("no-answer");
      expect(advancePlivoStatus("no-answer", "completed")).toBe("no-answer");
      expect(advancePlivoStatus("answered", null)).toBe("answered");
      expect(advancePlivoStatus(null, null)).toBe("ringing");
    });

    const sync = async (row: Record<string, unknown> | null, kind: Parameters<typeof syncPlivoEvent>[2], params: Record<string, string>) => {
      db.queryOne.mockResolvedValueOnce(row);
      await syncPlivoEvent("tenant", formOf(params), kind, "call-1", { config: activeConfig.config });
      return telephony.recordTelephonyCallEvent.mock.calls.at(-1)!;
    };

    it("customer answered and hung up: completed, with the customer leg's talk time only", async () => {
      expect((await sync(callRow({ status: "ringing" }), "dial", { DialAction: "answer", DialBLegUUID: "b-1" }))[1]).toMatchObject({ status: "answered" });
      const [, input] = await sync(callRow({ status: "answered" }), "dial", { DialAction: "hangup", DialBLegDuration: "42", Duration: "70", DialBLegHangupCauseName: "NORMAL_CLEARING" });
      expect(input).toMatchObject({ status: "completed", duration: 42, metadata: expect.objectContaining({ hangupCause: "NORMAL_CLEARING" }) });
      expect(input.endedAt).toEqual(expect.any(String));
    });

    it("customer never answered: the dial outcome, not completed", async () => {
      expect((await sync(callRow({ status: "ringing" }), "dial", { DialAction: "hangup" }))[1]).toMatchObject({ status: "ringing" });
      expect((await sync(callRow({ status: "ringing" }), "dial-status", { DialStatus: "timeout" }))[1]).toMatchObject({ status: "no-answer", metadata: expect.objectContaining({ outcomeReason: "CUSTOMER_NO_ANSWER" }) });
      // The agent leg's hangup afterwards doesn't change the outcome or add the agent leg's time.
      const [, input] = await sync(callRow({ status: "no-answer" }), "hangup", { CallStatus: "completed", Duration: "35" });
      expect(input).toMatchObject({ status: "no-answer", duration: null, endedAt: undefined });
    });

    it("the agent's own phone never picked up", async () => {
      expect((await sync(callRow(), "hangup", { CallStatus: "no-answer" }))[1]).toMatchObject({ status: "no-answer", metadata: expect.objectContaining({ outcomeReason: "AGENT_NOT_REACHED" }) });
      expect((await sync(callRow(), "hangup", { CallStatus: "busy" }))[1]).toMatchObject({ status: "busy" });
    });

    it("an agent answer that is logged late doesn't move an answered call back to ringing", async () => {
      expect((await sync(callRow({ status: "answered" }), "answer", { CallUUID: "a-1" }))[1]).toMatchObject({ status: "answered", metadata: expect.objectContaining({ agentAnsweredAt: expect.any(String) }) });
    });

    it("an inbound caller who hung up while ringing is missed", async () => {
      expect((await sync(callRow({ direction: "INBOUND", status: "ringing" }), "hangup", { CallStatus: "completed" }))[1]).toMatchObject({ status: "no-answer", metadata: expect.objectContaining({ outcomeReason: "CALLER_HUNG_UP" }) });
    });

    it("refuses an outbound callback for a call the CRM didn't place", async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(syncPlivoEvent("tenant", formOf({ Direction: "outbound" }), "dial", "unknown", { config: activeConfig.config })).rejects.toThrow("PLIVO_CALL_NOT_FOUND");
    });
  });

  it("stores a ready recording inside private VPS storage and runs the recording automation", async () => {
    db.queryOne
      .mockResolvedValueOnce({ isActive: true, config: { provider: "plivo", plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "encrypted", plivoRecordingEnabled: true, recordingRetentionDays: 7 } })
      .mockResolvedValueOnce({ id: "11111111-1111-1111-1111-111111111111", recordingUrl: null, startedAt: "2026-10-26T00:00:00Z", metadata: {}, activityId: null })
      .mockResolvedValueOnce({ id: "11111111-1111-1111-1111-111111111111" });
    const audio = new Uint8Array([0x49, 0x44, 0x33]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-length": "3" }), body: new ReadableStream({ start(controller) { controller.enqueue(audio); controller.close(); } }) }));
    const result = await savePlivoRecording("tenant", new URLSearchParams({ RecordingID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", RecordingDuration: "12" }), "call");
    expect(result).toEqual({ stored: true });
    expect(files.writePrivateFileStream).toHaveBeenCalledWith("telephony/tenant/11111111-1111-1111-1111-111111111111.mp3", expect.any(ReadableStream), { maxBytes: 500 * 1024 * 1024, contentType: "audio/mpeg" });
    expect(db.queryOne.mock.calls[2][1][0]).toBe("vps://telephony/tenant/11111111-1111-1111-1111-111111111111.mp3");
    expect(telephony.fireRecordingAvailableAutomation).toHaveBeenCalledWith("tenant", "11111111-1111-1111-1111-111111111111");
  });

  it("does not download or store a recording when the switch is off", async () => {
    db.queryOne
      .mockResolvedValueOnce({ isActive: true, config: { provider: "plivo", plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "encrypted", plivoRecordingEnabled: false } })
      .mockResolvedValueOnce({ id: "11111111-1111-1111-1111-111111111111", recordingUrl: null, metadata: {}, startedAt: "2026-10-27T10:00:00.000Z", activityId: null });
    vi.stubGlobal("fetch", vi.fn());
    expect(await savePlivoRecording("tenant", new URLSearchParams({ RecordingID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }), "call")).toEqual({ stored: false, reason: "disabled" });
    expect(fetch).not.toHaveBeenCalled();
    expect(files.writePrivateFileStream).not.toHaveBeenCalled();
  });

  it("keeps a voice bot call's audio by the bot's own setting, not the connector's switch (decision 17)", async () => {
    db.queryOne
      .mockResolvedValueOnce({ isActive: true, config: { provider: "plivo", plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "encrypted", plivoRecordingEnabled: false } })
      .mockResolvedValueOnce({ id: "11111111-1111-1111-1111-111111111111", recordingUrl: null, metadata: { voiceBotCallId: "c1", voiceBotKeepAudio: false }, startedAt: "2026-10-27T10:00:00.000Z", activityId: null });
    vi.stubGlobal("fetch", vi.fn());
    expect(await savePlivoRecording("tenant", new URLSearchParams({ RecordingID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }), "call")).toEqual({ stored: false, reason: "disabled" });
    expect(fetch).not.toHaveBeenCalled();
    db.queryOne
      .mockResolvedValueOnce({ isActive: true, config: { provider: "plivo", plivoAuthId: "AUTH", plivoAuthTokenEncrypted: "encrypted", plivoRecordingEnabled: false } })
      .mockResolvedValueOnce({ id: "11111111-1111-1111-1111-111111111111", recordingUrl: null, metadata: { voiceBotCallId: "c1", voiceBotKeepAudio: true }, startedAt: "2026-10-27T10:00:00.000Z", activityId: null })
      .mockResolvedValueOnce({ id: "11111111-1111-1111-1111-111111111111" });
    const audio = new Uint8Array([0x49, 0x44, 0x33]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-length": "3" }), body: new ReadableStream({ start(controller) { controller.enqueue(audio); controller.close(); } }) }));
    expect(await savePlivoRecording("tenant", new URLSearchParams({ RecordingID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }), "call")).toEqual({ stored: true });
  });
});

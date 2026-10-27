import { after, NextResponse } from "next/server";
import {
  findPlivoCall,
  inboundPlivoTarget,
  normalizePhone,
  PLIVO_CALLBACK_ACTIONS,
  plivoCountryCode,
  plivoDefaultAgentTarget,
  plivoDialOutcome,
  plivoDialXml,
  plivoHangupXml,
  plivoNonceAlreadyUsed,
  plivoRingTimeout,
  plivoSpeakXml,
  plivoUnavailableMessage,
  rememberPlivoNonce,
  savePlivoRecording,
  syncPlivoEvent,
  userIdForPhone,
  verifyPlivoRequest,
  type PlivoConfig,
  type PlivoEventKind,
} from "@/lib/server/plivo";
import {
  botAnswerXml,
  botTransferDialStatusXml,
  botTransferXml,
  findVoiceBotCall,
  handleBotHangup,
  handleBotMachine,
  inboundBotForNumber,
  processVoiceBotCall,
  startInboundBotCall,
} from "@/lib/server/voice-bot-calls";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16384;
const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EVENT_SOURCES = new Set<PlivoEventKind>(["ring", "dial", "hangup"]);
const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" };

// One answer for every refused request (unknown workspace, Plivo off, bad signature), so the
// response doesn't tell a caller which workspaces exist or use Plivo.
const forbidden = () => new Response("Forbidden", { status: 403 });
const xml = (body: string) => new Response(body, { headers: XML_HEADERS });

function isRefusal(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "PLIVO_NOT_ACTIVE" || message === "PLIVO_CREDENTIALS_MISSING" || message === "TENANT_CONTEXT_REQUIRED" || message.startsWith("MODULE_DISABLED");
}

// Call logging that Plivo doesn't wait for: XML answers go back first (the caller hears no gap),
// and the CRM records the event straight after.
function later(label: string, work: () => Promise<unknown>) {
  const run = () => work().catch((error) => console.error(`Plivo ${label} failed`, error instanceof Error ? error.message : error));
  try {
    after(run);
  } catch {
    // Outside a request (scripts calling the route directly): run it now, without waiting.
    void run();
  }
}

export async function POST(request: Request, context: { params: Promise<{ tenantId: string; action: string }> }) {
  const { tenantId, action } = await context.params;
  if (!(PLIVO_CALLBACK_ACTIONS as readonly string[]).includes(action)) return new Response("Not found", { status: 404 });
  if (!TENANT_ID.test(tenantId)) return forbidden();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
    const form = new URLSearchParams(body);
    let verification: Awaited<ReturnType<typeof verifyPlivoRequest>>;
    try {
      verification = await verifyPlivoRequest(request, tenantId, form);
    } catch (error) {
      if (isRefusal(error)) return forbidden();
      throw error;
    }
    if (!verification.verified || !verification.nonce) return forbidden();
    const { config, nonce } = verification;
    // A callback sent a second time (same nonce) gets the same kind of answer but changes nothing.
    // The nonce is kept once the callback has been handled, so one that failed can be retried.
    const replay = await plivoNonceAlreadyUsed(nonce);
    const handled = async (response: Response) => {
      if (!replay) await rememberPlivoNonce(tenantId, nonce);
      return response;
    };

    const url = new URL(request.url);
    const callId = url.searchParams.get("callId") || form.get("CallUUID");
    if (!callId || callId.length > 100) return new Response("Call ID missing", { status: 400 });

    // Voice bot calls (wave E) have their own flow; their call ID is the bot call's.
    const botCall = /^[0-9a-f-]{36}$/.test(callId) ? await findVoiceBotCall(tenantId, callId) : null;
    if (botCall) return handled(await botCallback(tenantId, config, form, action, url, botCall, replay));

    if (action === "answer") return handled(xml(await answerXml(tenantId, config, form, callId, url.searchParams.get("flow") === "outbound", replay)));
    if (action === "dial-status") return handled(xml(await dialStatusXml(tenantId, config, form, callId, url.searchParams.get("stage"), replay)));
    if (replay) return NextResponse.json({ ok: true, duplicate: true });

    if (action === "recording") {
      // Downloading the file can take a while; Plivo only needs to know the callback arrived.
      later("recording", () => savePlivoRecording(tenantId, form, callId, config));
      return handled(NextResponse.json({ ok: true }));
    }

    const source = url.searchParams.get("source") as PlivoEventKind | null;
    if (!source || !EVENT_SOURCES.has(source)) return new Response("Unknown event", { status: 400 });
    await syncPlivoEvent(tenantId, form, source, callId, { config });
    return handled(NextResponse.json({ ok: true }));
  } catch (error) {
    if (error instanceof Error && error.message === "PLIVO_CALL_NOT_FOUND") return new Response("Unknown call", { status: 404 });
    console.error("Plivo webhook failed", error instanceof Error ? error.message : error);
    return new Response("Plivo webhook failed", { status: 500 });
  }
}

// Outbound: the agent picked up, so dial the customer saved on the call log. Inbound: ring the
// matched lead's owner, else the default agent phone.
async function answerXml(tenantId: string, config: PlivoConfig, form: URLSearchParams, callId: string, outbound: boolean, replay: boolean) {
  const countryCode = plivoCountryCode(config);
  const timeoutSeconds = plivoRingTimeout(config);
  const recordingEnabled = !!config.plivoRecordingEnabled;
  if (outbound) {
    const call = await findPlivoCall(tenantId, callId);
    const customer = normalizePhone(call?.toNumber, countryCode);
    if (!call || !customer) return plivoSpeakXml("Sorry, this call could not be connected.");
    if (!replay) later("answer", () => syncPlivoEvent(tenantId, form, "answer", callId, { config }));
    return plivoDialXml(tenantId, { target: customer, callId, recordingEnabled, callerId: normalizePhone(config.outboundCallerId || config.inboundNumber, countryCode), timeoutSeconds });
  }
  const route = await inboundPlivoTarget(tenantId, config, form.get("From") ?? "");
  // Voice bots (wave F): a number set to Bot, or Owner then bot outside the bot's hours, is
  // answered by the bot. If the bot can't take the call, people's routing carries on.
  const bot = replay ? null : await inboundBotForNumber(tenantId, config, form.get("To"));
  if (bot?.botAnswersFirst) {
    const botXml = await startInboundBotCall(tenantId, config, form, bot.botId, route);
    if (botXml) return botXml;
  }
  if (!route.target) {
    if (bot && !replay) {
      const botXml = await startInboundBotCall(tenantId, config, form, bot.botId, route);
      if (botXml) return botXml;
    }
    if (!replay) later("answer", () => syncPlivoEvent(tenantId, form, "answer", callId, { config, route, status: "no-answer", metadata: { outcomeReason: "NO_AGENT_AVAILABLE" } }));
    return plivoSpeakXml(plivoUnavailableMessage(config));
  }
  if (!replay) later("answer", () => syncPlivoEvent(tenantId, form, "answer", callId, { config, route, metadata: { stage: "primary" } }));
  return plivoDialXml(tenantId, { target: route.target, callId, recordingEnabled, callerId: normalizePhone(config.inboundNumber || config.outboundCallerId, countryCode), timeoutSeconds, stage: "primary" });
}

// The dial ended. Outbound: hang up. Inbound and unanswered: try the default agent phone once
// (when the first phone wasn't it), then tell the caller nobody is available.
async function dialStatusXml(tenantId: string, config: PlivoConfig, form: URLSearchParams, callId: string, stage: string | null, replay: boolean) {
  const outcome = plivoDialOutcome(form.get("DialStatus"));
  const call = await findPlivoCall(tenantId, callId);
  const inbound = call ? call.direction === "INBOUND" : String(form.get("Direction") ?? "").toLowerCase().startsWith("inbound");
  if (!inbound || outcome === "completed") {
    if (!replay) later("dial status", () => syncPlivoEvent(tenantId, form, "dial-status", callId, { config }));
    return plivoHangupXml();
  }
  if (stage !== "fallback") {
    const fallback = plivoDefaultAgentTarget(config);
    const dialled = call?.metadata?.agentPhone ?? (await inboundPlivoTarget(tenantId, config, form.get("From") ?? "")).target;
    if (fallback && fallback !== dialled) {
      if (!replay) later("fallback", async () => syncPlivoEvent(tenantId, form, "dial-status", callId, {
        config, status: "ringing", agentId: await userIdForPhone(tenantId, config, fallback),
        metadata: { stage: "fallback", agentPhone: fallback, firstAgentPhone: dialled ?? null, firstAgentOutcome: outcome },
      }));
      const countryCode = plivoCountryCode(config);
      return plivoDialXml(tenantId, {
        target: fallback, callId, recordingEnabled: !!config.plivoRecordingEnabled,
        callerId: normalizePhone(config.inboundNumber || config.outboundCallerId, countryCode), timeoutSeconds: plivoRingTimeout(config), stage: "fallback",
      });
    }
  }
  // Owner then bot (decision 23): nobody picked up, so the bot answers.
  const bot = inbound && !replay ? await inboundBotForNumber(tenantId, config, call?.toNumber ?? form.get("To")) : null;
  if (bot) {
    const route = { leadId: call?.leadId ?? null, agentId: call?.agentId ?? null };
    const botXml = await startInboundBotCall(tenantId, config, new URLSearchParams({ ...Object.fromEntries(form), CallUUID: form.get("CallUUID") ?? callId, From: form.get("From") ?? call?.fromNumber ?? "", To: form.get("To") ?? call?.toNumber ?? "" }), bot.botId, route);
    if (botXml) return botXml;
  }
  if (!replay) later("dial status", () => syncPlivoEvent(tenantId, form, "dial-status", callId, { config }));
  return plivoSpeakXml(plivoUnavailableMessage(config));
}

// A voice bot's call: answered → stream to the bot (or ring the next person after a hand-over);
// the end of a hand-over's ring; hung up → close it and do the after-call work; a machine → hang up.
async function botCallback(
  tenantId: string, config: PlivoConfig, form: URLSearchParams, action: string, url: URL,
  call: NonNullable<Awaited<ReturnType<typeof findVoiceBotCall>>>, replay: boolean,
) {
  if (action === "answer") {
    if (url.searchParams.get("flow") === "bot-transfer") return xml(await botTransferXml(tenantId, config, call, Number(call.transfer?.index ?? 0)));
    return xml(await botAnswerXml(tenantId, config, form, call));
  }
  if (action === "dial-status") {
    const stage = /^transfer-(\d+)$/.exec(url.searchParams.get("stage") ?? "");
    return xml(stage ? await botTransferDialStatusXml(tenantId, config, form, call, Number(stage[1])) : plivoHangupXml());
  }
  if (replay) return NextResponse.json({ ok: true, duplicate: true });
  if (action === "recording") {
    later("recording", () => savePlivoRecording(tenantId, form, call.id, config));
    return NextResponse.json({ ok: true });
  }
  if (action === "machine") {
    await handleBotMachine(tenantId, config, form, call);
    return NextResponse.json({ ok: true });
  }
  const source = url.searchParams.get("source");
  if (source === "ring") await syncPlivoEvent(tenantId, form, "ring", call.id, { config }).catch(() => undefined);
  if (source === "hangup") {
    const { process } = await handleBotHangup(tenantId, config, form, call);
    if (process) later("voice bot results", () => processVoiceBotCall(tenantId, call.id));
  }
  return NextResponse.json({ ok: true });
}


import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { executeAsSystem, query, queryOne, queryOneAsSystem } from "@/lib/db/query";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";
import { decryptSecretAtRest } from "@/lib/server/secret-encryption";
import { fireRecordingAvailableAutomation, recordTelephonyCallEvent } from "@/lib/server/telephony-webhook";
import { deletePrivateFile, writePrivateFileStream } from "@/lib/storage/file-storage";
import { publicAppOrigin } from "@/lib/server/public-app-url";

export type PlivoConfig = {
  provider?: string;
  plivoAuthId?: string;
  plivoAuthTokenEncrypted?: string;
  outboundCallerId?: string;
  defaultAgentNumber?: string;
  inboundNumber?: string;
  userAgentMappings?: Array<{ userId?: string; phoneNumber?: string }>;
  plivoRecordingEnabled?: boolean;
  recordingRetentionDays?: number | string;
  // Numbers typed without a country code (a 10-digit Indian mobile, 0-prefixed landline) get this.
  plivoDefaultCountryCode?: string;
  // How long a phone rings before the call counts as not answered (10-120 s, default 30).
  plivoRingTimeoutSeconds?: number | string;
  // What an inbound caller hears when nobody picks up.
  plivoUnavailableMessage?: string;
};

export const PLIVO_CALLBACK_ACTIONS = ["answer", "event", "dial-status", "recording", "machine"] as const;
export type PlivoCallbackAction = (typeof PLIVO_CALLBACK_ACTIONS)[number];

export const DEFAULT_PLIVO_UNAVAILABLE_MESSAGE = "Sorry, no one is available to take your call right now. We will call you back soon.";

export function publicPlivoBaseUrl() {
  return publicAppOrigin();
}

// Callback URLs carry the CRM's own call ID (a random UUID) and never a phone number: Plivo logs
// these URLs, and the numbers are already in the CRM's call log.
export function plivoCallbackUrl(tenantId: string, action: PlivoCallbackAction, extra?: Record<string, string>) {
  const url = new URL(`/api/integrations/telephony/plivo/${tenantId}/${action}`, publicPlivoBaseUrl());
  for (const [key, value] of Object.entries(extra ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

export async function getActivePlivoConfig(tenantId: string): Promise<PlivoConfig> {
  await assertModuleEnabled(tenantId, "TELEPHONY");
  const row = await queryOne<{ config: PlivoConfig; isActive: boolean }>(
    `select config, "isActive" from "IntegrationSetting" where "tenantId" = $1 and type = 'TELEPHONY' limit 1`, [tenantId],
  );
  if (!row?.isActive || String(row.config?.provider).toLowerCase() !== "plivo") throw new Error("PLIVO_NOT_ACTIVE");
  if (!row.config.plivoAuthId || !row.config.plivoAuthTokenEncrypted) throw new Error("PLIVO_CREDENTIALS_MISSING");
  return row.config;
}

function token(config: PlivoConfig) {
  return decryptSecretAtRest(config.plivoAuthTokenEncrypted!);
}

// For the voice bot service, which hangs up the calls it holds (voice bot wave E).
export function plivoCredentials(config: PlivoConfig) {
  return { authId: config.plivoAuthId!, authToken: token(config) };
}

// ---- Signature V3 -------------------------------------------------------------------------------
// The exact string Plivo's own SDKs sign (plivo-node lib/utils/v3Security.js, POST):
//   scheme://host/path
//   + "?" + the URL's query as sorted "key=value" pairs joined by "&"   (when there is a query)
//   + "."                                                               (when there is a query and form fields)
//   + "?"                                                               (when there are form fields but no query)
//   + the form fields as sorted "keyvalue" pairs, no separator
//   + "." + nonce
// Keys are sorted, then each key's values; both by UTF-16 code unit (JavaScript's default sort).
// Query values are compared decoded, so the URL's percent-encoding doesn't matter.
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sortedPairs(entries: Iterable<[string, string]>) {
  const grouped = new Map<string, string[]>();
  for (const [key, value] of entries) grouped.set(key, [...(grouped.get(key) ?? []), value]);
  return [...grouped.keys()].sort(byCodeUnit).flatMap((key) => [...grouped.get(key)!].sort(byCodeUnit).map((value) => [key, value] as const));
}

export function plivoV3SignedString(url: string, form: URLSearchParams, nonce: string) {
  const parsed = new URL(url);
  let signed = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const queryString = sortedPairs(parsed.searchParams.entries()).map(([key, value]) => `${key}=${value}`).join("&");
  const hasForm = [...form.keys()].length > 0;
  if (queryString || hasForm) signed += `?${queryString}`;
  if (queryString && hasForm) signed += ".";
  signed += sortedPairs(form.entries()).map(([key, value]) => key + value).join("");
  return `${signed}.${nonce}`;
}

export function verifyPlivoV3Signature(url: string, params: URLSearchParams, nonce: string | null, signature: string | null, authToken: string) {
  if (!nonce || !signature || nonce.length > 200 || signature.length > 2000) return false;
  const expected = Buffer.from(createHmac("sha256", authToken).update(plivoV3SignedString(url, params, nonce)).digest("base64"));
  return signature.split(",").some((candidate) => {
    const actual = Buffer.from(candidate.trim());
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

// Plivo signs the public URL it called; behind the VPS proxy the request's own host is internal,
// so the URL is rebuilt from APP_URL.
export async function verifyPlivoRequest(request: Request, tenantId: string, params: URLSearchParams) {
  const config = await getActivePlivoConfig(tenantId);
  const requestUrl = new URL(request.url);
  const signedUrl = new URL(requestUrl.pathname + requestUrl.search, publicPlivoBaseUrl()).toString();
  const nonce = request.headers.get("x-plivo-signature-v3-nonce");
  const verified = verifyPlivoV3Signature(signedUrl, params, nonce, request.headers.get("x-plivo-signature-v3"), token(config));
  return { verified, config, nonce };
}

// The signature has no timestamp, so each nonce is accepted once (migration 0140). Checked
// before and stored after processing, so a callback that failed here can still be retried.
// System queries: this runs before any user or workspace session exists.
export async function plivoNonceAlreadyUsed(nonce: string) {
  return !!(await queryOneAsSystem(`select 1 as used from "TelephonyWebhookNonce" where provider = 'plivo' and nonce = $1`, [nonce]));
}

export async function rememberPlivoNonce(tenantId: string, nonce: string) {
  await executeAsSystem(
    `insert into "TelephonyWebhookNonce" (id, "tenantId", provider, nonce) values ($1, $2, 'plivo', $3) on conflict (provider, nonce) do nothing`,
    [randomUUID(), tenantId, nonce],
  );
}

// ---- Phone numbers ------------------------------------------------------------------------------
export function plivoCountryCode(config?: PlivoConfig | null) {
  const digits = String(config?.plivoDefaultCountryCode ?? "").replace(/\D/g, "");
  return digits.length >= 1 && digits.length <= 3 ? digits : "91";
}

export function plivoRingTimeout(config?: PlivoConfig | null) {
  const seconds = Math.round(Number(config?.plivoRingTimeoutSeconds));
  return Number.isFinite(seconds) && seconds >= 10 && seconds <= 120 ? seconds : 30;
}

// E.164 for Plivo. "+..." and "00..." already carry a country code; a number starting with a
// single 0 is a national number (Indian landline "080 2345 6789", mobile "098765 43210"); 10
// digits or fewer is a national number without the 0. Anything else already starts with its
// country code ("919876543210").
export function normalizePhone(value: unknown, defaultCountryCode = "91") {
  const raw = String(value ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (!raw.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = defaultCountryCode + digits.replace(/^0+/, "");
    else if (digits.length <= 10) digits = defaultCountryCode + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

function isPlivoNumber(config: PlivoConfig, number: string) {
  const countryCode = plivoCountryCode(config);
  return [config.inboundNumber, config.outboundCallerId].some((value) => normalizePhone(value, countryCode) === number);
}

// The default agent phone, when it can take a call (it must not be the Plivo number itself).
export function plivoDefaultAgentTarget(config: PlivoConfig) {
  const target = normalizePhone(config.defaultAgentNumber, plivoCountryCode(config));
  return target && !isPlivoNumber(config, target) ? target : null;
}

// The phone a CRM user's calls ring: their User-Agent Mapping entry, else their profile phone.
export function plivoAgentPhoneForUser(config: PlivoConfig, userId: string | null | undefined, profilePhone: unknown) {
  const countryCode = plivoCountryCode(config);
  const mapped = userId ? config.userAgentMappings?.find((entry) => entry?.userId === userId)?.phoneNumber : null;
  const phone = normalizePhone(mapped || profilePhone, countryCode);
  return phone && !isPlivoNumber(config, phone) ? phone : null;
}

// ---- Plivo XML ----------------------------------------------------------------------------------
export function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>`;

export type PlivoDialOptions = {
  target: string;
  callId: string;
  recordingEnabled: boolean;
  callerId?: string | null;
  timeoutSeconds: number;
  // Inbound: "primary" is the routed agent, "fallback" the default agent tried after them.
  // Voice bot hand-over (wave E): "transfer-<n>", the n-th person rung.
  stage?: "primary" | "fallback" | `transfer-${number}`;
};

// <Dial action> is fetched when the dial ends (with DialStatus) and returns what happens next;
// <Dial callbackUrl> reports the agent/customer leg being answered and hung up. Recording starts
// when the dialled phone answers and is capped at Plivo's maximum of 4 hours (the default is 60 s).
export function plivoDialXml(tenantId: string, options: PlivoDialOptions) {
  const params: Record<string, string> = { callId: options.callId, ...(options.stage ? { stage: options.stage } : {}) };
  const action = plivoCallbackUrl(tenantId, "dial-status", params);
  const callback = plivoCallbackUrl(tenantId, "event", { ...params, source: "dial" });
  const recording = options.recordingEnabled
    ? `<Record startOnDialAnswer="true" maxLength="14400" fileFormat="mp3" callbackUrl="${escapeXml(plivoCallbackUrl(tenantId, "recording", { callId: options.callId }))}" callbackMethod="POST" />`
    : "";
  const caller = options.callerId ? ` callerId="${escapeXml(options.callerId)}"` : "";
  return `${XML_HEAD}<Response>${recording}<Dial${caller} timeout="${options.timeoutSeconds}" action="${escapeXml(action)}" method="POST" callbackUrl="${escapeXml(callback)}" callbackMethod="POST"><Number>${escapeXml(options.target)}</Number></Dial></Response>`;
}

export function plivoSpeakXml(message: string) {
  return `${XML_HEAD}<Response><Speak>${escapeXml(message)}</Speak><Hangup/></Response>`;
}

export function plivoHangupXml() {
  return `${XML_HEAD}<Response><Hangup/></Response>`;
}

export function plivoUnavailableMessage(config: PlivoConfig) {
  const message = String(config.plivoUnavailableMessage ?? "").trim();
  return message ? message.slice(0, 500) : DEFAULT_PLIVO_UNAVAILABLE_MESSAGE;
}

// ---- Placing and routing calls ------------------------------------------------------------------
// Click-to-call rings the agent first (the A leg); when they answer, the answer URL dials the
// customer. `callId` is the CRM call log's own ID, created before this request is sent.
export async function startPlivoCall(tenantId: string, config: PlivoConfig, agentNumber: string, customerNumber: string, callId: string) {
  const countryCode = plivoCountryCode(config);
  const from = normalizePhone(config.outboundCallerId || config.inboundNumber, countryCode);
  const to = normalizePhone(agentNumber, countryCode);
  const customer = normalizePhone(customerNumber, countryCode);
  if (!from || !to || !customer) throw new Error("PLIVO_PHONE_CONFIG_INVALID");
  if (from === to) throw new Error("PLIVO_AGENT_NUMBER_CANNOT_BE_PLIVO_NUMBER");
  const authId = config.plivoAuthId!;
  const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${authId}:${token(config)}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to,
      answer_url: plivoCallbackUrl(tenantId, "answer", { callId, flow: "outbound" }), answer_method: "POST",
      ring_url: plivoCallbackUrl(tenantId, "event", { callId, source: "ring" }), ring_method: "POST",
      hangup_url: plivoCallbackUrl(tenantId, "event", { callId, source: "hangup" }), hangup_method: "POST",
      ring_timeout: plivoRingTimeout(config),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.request_uuid) throw new Error(`PLIVO_CALL_FAILED:${response.status}`);
  return { requestUuid: String(body.request_uuid), agentNumber: to, customerNumber: customer, fromNumber: from };
}

export type PlivoInboundRoute = { leadId: string | null; agentId: string | null; target: string | null };

// An inbound caller who matches exactly one lead rings that lead's owner; anyone else (unknown,
// or a number shared by several leads) rings the default agent phone.
export async function inboundPlivoTarget(tenantId: string, config: PlivoConfig, fromNumber: string): Promise<PlivoInboundRoute> {
  const digits = fromNumber.replace(/\D/g, "").slice(-10);
  const matches = digits.length >= 7 ? await query<{ id: string; ownerId: string | null }>(
    `select id, "ownerId" from "Lead" where "tenantId" = $1 and "deletedAt" is null and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $2 order by "updatedAt" desc limit 2`,
    [tenantId, digits],
  ) : [];
  const lead = matches.length === 1 ? matches[0] : null;
  const owner = lead?.ownerId ? await queryOne<{ phone: string | null }>(`select phone from "User" where id = $1 and "tenantId" = $2 limit 1`, [lead.ownerId, tenantId]) : null;
  const ownerTarget = lead?.ownerId ? plivoAgentPhoneForUser(config, lead.ownerId, owner?.phone) : null;
  if (ownerTarget) return { leadId: lead?.id ?? null, agentId: lead?.ownerId ?? null, target: ownerTarget };
  const target = plivoDefaultAgentTarget(config);
  if (!target) return { leadId: lead?.id ?? null, agentId: null, target: null };
  return { leadId: lead?.id ?? null, agentId: await userIdForPhone(tenantId, config, target), target };
}

export async function userIdForPhone(tenantId: string, config: PlivoConfig, phone: string) {
  const mapped = config.userAgentMappings?.find((entry) => entry?.userId && normalizePhone(entry.phoneNumber, plivoCountryCode(config)) === phone)?.userId;
  if (mapped) return mapped;
  const user = await queryOne<{ id: string }>(
    `select id from "User" where "tenantId" = $1 and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $2 order by "createdAt" asc limit 1`,
    [tenantId, phone.replace(/\D/g, "").slice(-10)],
  );
  return user?.id ?? null;
}

// ---- Call outcomes ------------------------------------------------------------------------------
type PlivoCallRow = {
  id: string; status: string; direction: string; fromNumber: string | null; toNumber: string | null;
  leadId: string | null; opportunityId: string | null; agentId: string | null; metadata: Record<string, any> | null;
};

export async function findPlivoCall(tenantId: string, callId: string) {
  return queryOne<PlivoCallRow>(
    `select id, status, direction, "fromNumber", "toNumber", "leadId", "opportunityId", "agentId", metadata from "TelephonyCallLog" where "tenantId" = $1 and provider = 'plivo' and "callId" = $2 limit 1`,
    [tenantId, callId],
  );
}

const TERMINAL = new Set(["completed", "busy", "failed", "no-answer", "missed", "voicemail"]);
const OPEN_RANK: Record<string, number> = { dialing: 0, ringing: 1, answered: 2 };
const rank = (status: string | null | undefined) => (status == null ? -1 : TERMINAL.has(status) ? 3 : OPEN_RANK[status] ?? 0);

// A call only moves forward (dialing -> ringing -> answered -> outcome) and keeps its first
// outcome: Plivo's callbacks for the two legs can arrive in any order.
export function advancePlivoStatus(previous: string | null | undefined, next: string | null) {
  if (!next) return previous ?? "ringing";
  if (previous && TERMINAL.has(previous)) return previous;
  return rank(next) >= rank(previous) ? next : previous!;
}

// <Dial action> DialStatus: completed (the dialled phone answered), busy, failed, or
// cancel/timeout/no-answer (it never answered).
export function plivoDialOutcome(dialStatus: string | null) {
  const value = String(dialStatus ?? "").toLowerCase();
  return value === "completed" ? "completed" : value === "busy" ? "busy" : value === "failed" ? "failed" : "no-answer";
}

export type PlivoEventKind = "answer" | "ring" | "dial" | "dial-status" | "hangup";

function eventOutcome(kind: PlivoEventKind, params: URLSearchParams, existing: PlivoCallRow | null, direction: string) {
  const previous = existing?.status ?? null;
  switch (kind) {
    case "ring": return { status: "dialing" };
    case "answer": return { status: "ringing" };
    case "dial": {
      const action = String(params.get("DialAction") ?? "").toLowerCase();
      if (action === "answer" || action === "connected") return { status: "answered", metadata: { answeredAt: new Date().toISOString() } };
      if (action === "hangup" && previous === "answered") return { status: "completed" };
      return { status: null };
    }
    case "dial-status": {
      const status = plivoDialOutcome(params.get("DialStatus"));
      const reason = status === "no-answer" ? (direction === "INBOUND" ? "AGENT_NO_ANSWER" : "CUSTOMER_NO_ANSWER") : undefined;
      return { status, metadata: reason ? { outcomeReason: reason } : undefined };
    }
    case "hangup": {
      if (previous && TERMINAL.has(previous)) return { status: null };
      if (previous === "answered") return { status: "completed" };
      // Outbound: the agent's own phone never picked up, so the customer was never dialled.
      if (direction === "OUTBOUND" && !existing?.metadata?.agentAnsweredAt) {
        const callStatus = String(params.get("CallStatus") ?? "").toLowerCase();
        return { status: callStatus === "busy" ? "busy" : callStatus === "failed" ? "failed" : "no-answer", metadata: { outcomeReason: "AGENT_NOT_REACHED" } };
      }
      return { status: "no-answer", metadata: { outcomeReason: direction === "INBOUND" ? "CALLER_HUNG_UP" : "AGENT_HUNG_UP" } };
    }
  }
}

function compact(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export async function syncPlivoEvent(
  tenantId: string,
  params: URLSearchParams,
  kind: PlivoEventKind,
  callId: string,
  options: { config?: PlivoConfig; route?: PlivoInboundRoute | null; status?: string; metadata?: Record<string, unknown>; agentId?: string | null } = {},
) {
  const config = options.config ?? await getActivePlivoConfig(tenantId);
  const countryCode = plivoCountryCode(config);
  const existing = await findPlivoCall(tenantId, callId);
  const direction = existing?.direction ?? (String(params.get("Direction") ?? "").toLowerCase().startsWith("inbound") ? "INBOUND" : "OUTBOUND");
  // Outbound calls are logged by click-to-call before Plivo is asked to dial; an unknown
  // outbound call ID isn't ours.
  if (!existing && direction === "OUTBOUND") throw new Error("PLIVO_CALL_NOT_FOUND");
  const route = existing ? null : options.route ?? await inboundPlivoTarget(tenantId, config, params.get("From") ?? "");
  const outcome = options.status ? { status: options.status } : eventOutcome(kind, params, existing, direction);
  const status = advancePlivoStatus(existing?.status, outcome.status);
  const becameTerminal = TERMINAL.has(status) && !(existing && TERMINAL.has(existing.status));
  // Talk time is the dialled leg's own duration. The A leg's Duration also counts the time the
  // agent's phone rang and waited, so it is never used.
  const legDuration = Number(params.get("DialBLegDuration"));
  const metadata = compact({
    source: "plivo",
    lastEvent: kind,
    requestUuid: params.get("RequestUUID"),
    callUuid: kind === "answer" || kind === "hangup" ? params.get("CallUUID") : undefined,
    dialBLegUuid: params.get("DialBLegUUID"),
    hangupCause: params.get("DialBLegHangupCauseName") ?? params.get("DialHangupCause") ?? (kind === "hangup" ? params.get("HangupCauseName") : undefined),
    hangupSource: params.get("DialBLegHangupSource") ?? (kind === "hangup" ? params.get("HangupSource") : undefined),
    agentAnsweredAt: kind === "answer" && direction === "OUTBOUND" ? new Date().toISOString() : undefined,
    agentPhone: route?.target ?? undefined,
    ...(outcome.metadata ?? {}),
    ...(options.metadata ?? {}),
  });
  const agentId = options.agentId ?? existing?.agentId ?? route?.agentId ?? null;
  return recordTelephonyCallEvent(tenantId, {
    provider: "plivo", callId, direction,
    fromNumber: existing ? undefined : normalizePhone(params.get("From"), countryCode),
    toNumber: existing ? undefined : normalizePhone(params.get("To"), countryCode),
    status,
    duration: Number.isFinite(legDuration) && params.has("DialBLegDuration") ? legDuration : null,
    leadId: existing?.leadId ?? route?.leadId ?? undefined,
    opportunityId: existing?.opportunityId ?? undefined,
    agentId: agentId ?? undefined,
    // The CRM's own clock; Plivo's EndTime has no time zone.
    endedAt: becameTerminal ? new Date().toISOString() : undefined,
    metadata,
  }, agentId ? { id: agentId, tenantId } : undefined);
}

// ---- Recordings ---------------------------------------------------------------------------------
export async function savePlivoRecording(tenantId: string, params: URLSearchParams, callId: string, activeConfig?: PlivoConfig) {
  const config = activeConfig ?? await getActivePlivoConfig(tenantId);
  const recordingId = params.get("RecordingID") ?? "";
  if (!/^[A-Za-z0-9-]{10,100}$/.test(recordingId)) throw new Error("PLIVO_RECORDING_ID_INVALID");
  const call = await queryOne<{ id: string; recordingUrl: string | null; metadata: any; startedAt: string; activityId: string | null }>(
    `select id, "recordingUrl", metadata, "startedAt", "activityId" from "TelephonyCallLog" where "tenantId" = $1 and provider = 'plivo' and "callId" = $2 limit 1`, [tenantId, callId],
  );
  if (!call) throw new Error("PLIVO_CALL_NOT_FOUND");
  // A voice bot's call follows the bot's own "keep call audio" (decision 17), not the connector's switch.
  const keep = call.metadata?.voiceBotCallId ? call.metadata?.voiceBotKeepAudio === true : !!config.plivoRecordingEnabled;
  if (!keep) return { stored: false, reason: "disabled" };
  const activityNote = `Recording available in CRM (Plivo ID: ${recordingId}${params.get("RecordingDuration") ? `, ${params.get("RecordingDuration")}s` : ""})`;
  const syncActivity = async () => {
    if (!call.activityId) return;
    await queryOne(
      `update "Activity" set notes = concat_ws(E'\\n', nullif(notes, ''), $3), "updatedAt" = now() where id = $1 and "tenantId" = $2 and (notes is null or position($4 in notes) = 0) returning id`,
      [call.activityId, tenantId, activityNote, `Plivo ID: ${recordingId}`],
    );
  };
  if (call.recordingUrl?.startsWith("vps://")) {
    await syncActivity();
    return { stored: true, alreadyStored: true };
  }
  const authId = config.plivoAuthId!;
  const mediaUrl = `https://media.plivo.com/v1/Account/${encodeURIComponent(authId)}/Recording/${encodeURIComponent(recordingId)}.mp3`;
  const response = await fetch(mediaUrl, { headers: { Authorization: `Basic ${Buffer.from(`${authId}:${token(config)}`).toString("base64")}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`PLIVO_RECORDING_FETCH_FAILED:${response.status}`);
  const maxBytes = 500 * 1024 * 1024;
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new Error("PLIVO_RECORDING_TOO_LARGE");
  if (!response.body) throw new Error("PLIVO_RECORDING_EMPTY");
  const key = `telephony/${tenantId}/${call.id}.mp3`;
  let stored: Awaited<ReturnType<typeof writePrivateFileStream>>;
  try {
    stored = await writePrivateFileStream(key, response.body, { maxBytes, contentType: "audio/mpeg" });
  } catch (error) {
    if (error instanceof Error && error.message === "PRIVATE_FILE_TOO_LARGE") throw new Error("PLIVO_RECORDING_TOO_LARGE");
    if (error instanceof Error && error.message === "PRIVATE_FILE_EMPTY") throw new Error("PLIVO_RECORDING_EMPTY");
    throw error;
  }
  if (!(stored.prefix.subarray(0, 3).toString("ascii") === "ID3" || (stored.prefix[0] === 0xff && (stored.prefix[1] & 0xe0) === 0xe0))) {
    await deletePrivateFile(key);
    throw new Error("PLIVO_RECORDING_INVALID_AUDIO");
  }
  const days = Number(config.recordingRetentionDays);
  const expiresAt = Number.isFinite(days) && days > 0 ? new Date(new Date(call.startedAt).getTime() + days * 86400000).toISOString() : null;
  const updated = await queryOne(
    `update "TelephonyCallLog" set "recordingUrl" = $1, "recordingExpiresAt" = $2, metadata = coalesce(metadata, '{}'::jsonb) || $3::jsonb where id = $4 and "tenantId" = $5 returning id`,
    [`vps://${key}`, expiresAt, JSON.stringify({ recordingId, recordingDuration: params.get("RecordingDuration") }), call.id, tenantId],
  );
  if (!updated) throw new Error("PLIVO_CALL_NOT_FOUND");
  await syncActivity();
  await fireRecordingAvailableAutomation(tenantId, call.id).catch(() => undefined);
  return { stored: true };
}

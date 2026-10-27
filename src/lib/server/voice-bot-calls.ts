import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { execute, executeAsSystem, query, queryAsSystem, queryOne, queryOneAsSystem } from "@/lib/db/query";
import type { VoiceBotConfig } from "@/lib/voice-bot-config";
import { getTenantTimeZone, zonedWallClockParts, zonedWallClockToUTC } from "@/lib/server/date-format";
import {
    escapeXml, getActivePlivoConfig, normalizePhone, plivoAgentPhoneForUser, plivoCallbackUrl, plivoCountryCode, plivoCredentials, plivoDialXml,
    plivoHangupXml, plivoRingTimeout, publicPlivoBaseUrl, syncPlivoEvent, type PlivoConfig,
} from "@/lib/server/plivo";
import { checkTelephonyComplianceForCall, recordTelephonyCallEvent } from "@/lib/server/telephony-webhook";
import { createCallSession, issueCallStreamUrl } from "@/lib/server/voice-bot-sessions";
import { loadVoiceBotForSession } from "@/lib/server/voice-bots";
import { callClaude, callGroqJson, claudeCapReached, providerKey } from "@/lib/server/voice-providers";
import { voiceBotServiceConfig } from "@/lib/server/voice-bot-service";
import { canBulkCallWithVoiceBots, voiceBotAccess } from "@/lib/voice-bot-access-level";
import { readPrivateFile } from "@/lib/storage/file-storage";
import { requireTenantId } from "@/lib/server/tenant-guard";

// Voice bot phone calls (voice bot plan wave E; decisions 2, 3, 10–15, 17, 21, 28–30).
//
//   queue → dispatch (checks, calling hours, limits) → Plivo call → the bot service holds the
//   conversation → after the call: summary and fields, the bot's activity, mapping to the
//   lead/opportunity, callback tasks, the stop list, and retries.
//
// A call that rings out, is busy or reaches a machine is retried per the bot's policy, always
// inside its calling hours. Nothing is dropped silently: a call that can't be placed is kept
// as BLOCKED with the reason.

type TenantUser = { id: string; tenantId: string | null; role?: any; permissionTemplates?: any; teamId?: string | null; isTenantAdmin?: boolean };
type CallTrigger = "MANUAL" | "BULK" | "ENQUIRY" | "AUTOMATION" | "CAMPAIGN" | "INBOUND" | "TEST_PHONE";

// Whisper's free tier handles about two conversations at once (plan §3); the queue keeps to it.
export const MAX_ACTIVE_CALLS_PER_WORKSPACE = 2;
export const PRIORITY: Record<CallTrigger | "RETRY", number> = { INBOUND: 0, TEST_PHONE: 0, ENQUIRY: 1, RETRY: 2, MANUAL: 3, BULK: 3, AUTOMATION: 3, CAMPAIGN: 3 };
const ACTIVE = ["DIALING", "IN_PROGRESS"];
const UNANSWERED = new Set(["NO_ANSWER", "BUSY", "MACHINE", "FAILED"]);

export const OUTCOME_LABELS: Record<string, string> = {
    interested: "Interested", not_interested: "Not interested", callback: "Callback booked", transferred: "Transferred", wrong_number: "Wrong number",
    do_not_call: "Asked for no bot calls", no_response: "No response", hung_up: "Caller hung up", other: "Completed",
    NO_ANSWER: "No answer", BUSY: "Busy", MACHINE: "Answering machine", FAILED: "Call failed",
};

const BLOCK_MESSAGES: Record<string, string> = {
    NO_PHONE: "The record has no phone number.",
    STOP_LIST: "This number asked for no bot calls.",
    SUPPRESSED: "The number is on the do-not-call list.",
    OPTED_OUT: "The person opted out of calls.",
    RECORD_GONE: "The lead or opportunity no longer exists, or was merged.",
    BOT_NOT_LIVE: "The bot isn't live.",
    BOT_ARCHIVED: "The bot was archived.",
    CALLED_TODAY: "This bot already spoke to this number today.",
    CAMPAIGN_STOPPED: "The call campaign was paused or deleted before this call was placed.",
    ALREADY_QUEUED: "A call to this number by this bot is already waiting.",
    PLIVO: "The Plivo connector isn't on, or its settings aren't valid.",
    NOT_READY: "The bot couldn't start: check the items listed on the bot.",
    SERVICE: "The voice bot service isn't set up or isn't answering.",
};

function digitsOf(phone: string) {
    return phone.replace(/\D/g, "").slice(-10);
}

// ---- Calling hours (decision 15) -----------------------------------------------------------------
// The first moment at or after `from` inside the bot's calling days and hours, in the workspace's
// time zone, skipping holidays when the bot does. Null when no window opens in the next 3 weeks.
export function nextCallingTime(calling: VoiceBotConfig["calling"], holidays: Set<string>, timeZone: string, from: Date): Date | null {
    const [startHour, startMinute] = calling.start.split(":").map(Number);
    const [endHour, endMinute] = calling.end.split(":").map(Number);
    const today = zonedWallClockParts(from, timeZone);
    for (let offset = 0; offset < 21; offset++) {
        const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
        const [year, month, date, weekday] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), day.getUTCDay()];
        if (!calling.days.includes(weekday)) continue;
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        if (calling.skipHolidays && holidays.has(iso)) continue;
        const opens = zonedWallClockToUTC(year, month, date, startHour, startMinute, timeZone);
        const closes = zonedWallClockToUTC(year, month, date, endHour, endMinute, timeZone);
        if (from.getTime() < closes.getTime() - 60_000) return from.getTime() >= opens.getTime() ? from : opens;
    }
    return null;
}

// Voice bots and the phone system they need are both on for the workspace. Read as the system:
// the worker and Plivo's callbacks have no signed-in user (a missing row means on).
export async function voiceBotsOnFor(tenantId: string) {
    const off = await queryOneAsSystem(
        `select 1 from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" in ('VOICE_BOT', 'TELEPHONY') and status not in ('ENABLED', 'TRIAL') limit 1`, [tenantId],
    );
    return !off;
}

async function holidaySet(tenantId: string) {
    const rows = await queryAsSystem<{ date: string }>(`select date::text as date from "VoiceBotHoliday" where "tenantId" = $1 and date >= current_date - 1`, [tenantId]);
    return new Set(rows.map((row) => row.date));
}

// ---- Who acts for a call ----------------------------------------------------------------------------
// Background work runs as a real user (the audit trail needs one): whoever started the call,
// else the record's owner, else a workspace admin.
export async function loadActor(tenantId: string, preferredIds: Array<string | null | undefined>): Promise<TenantUser | null> {
    for (const id of preferredIds) {
        if (!id) continue;
        const row = await queryOneAsSystem<any>(
            `select u.id, u."tenantId", u."teamId", r.permissions from "User" u left join "Role" r on r.id = u."roleId"
             where u.id = $1 and u."tenantId" = $2 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'`,
            [id, tenantId],
        );
        if (row) return { id: row.id, tenantId, teamId: row.teamId, role: { permissions: row.permissions ?? {} } };
    }
    const admin = await queryOneAsSystem<any>(
        `select u.id, u."teamId", r.permissions from "User" u join "Role" r on r.id = u."roleId"
         where u."tenantId" = $1 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE' and r.permissions -> 'modules' ->> 'admin' = 'full'
         order by u."createdAt" limit 1`,
        [tenantId],
    );
    return admin ? { id: admin.id, tenantId, teamId: admin.teamId, role: { permissions: admin.permissions ?? {} }, isTenantAdmin: true } : null;
}

// ---- Queueing -----------------------------------------------------------------------------------------
type QueueTarget = { leadId?: string | null; opportunityId?: string | null };

async function recordPhone(user: TenantUser, target: QueueTarget) {
    const { getLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const { getOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    if (target.opportunityId) {
        const opportunity: any = await getOpportunityForTenant(user as any, target.opportunityId).catch(() => null);
        if (!opportunity) return null;
        const lead: any = opportunity.leadId ? await getLeadForTenant(user as any, opportunity.leadId).catch(() => null) : null;
        return { leadId: lead?.id ?? opportunity.leadId ?? null, opportunityId: opportunity.id, phone: lead?.phone ?? opportunity.phone ?? null, ownerId: opportunity.ownerId ?? lead?.ownerId ?? null };
    }
    if (target.leadId) {
        const lead: any = await getLeadForTenant(user as any, target.leadId).catch(() => null);
        if (!lead || lead.mergedIntoId) return null;
        return { leadId: lead.id, opportunityId: null, phone: lead.phone ?? null, ownerId: lead.ownerId ?? null };
    }
    return null;
}

// Queues bot calls to leads or opportunities the user can see (decision 18: "use", plus the bulk
// switch for more than one). Records that can't be called are kept as BLOCKED with the reason.
export async function queueVoiceBotCalls(user: TenantUser, botId: string, input: { targets: QueueTarget[]; trigger?: CallTrigger }) {
    const tenantId = requireTenantId(user);
    const access = voiceBotAccess(user as any);
    if (access !== "use" && access !== "manage") throw new Error("FORBIDDEN");
    const targets = (input.targets ?? []).slice(0, 5000);
    if (!targets.length) throw new Error("VOICE_BOT_CALL_NO_TARGETS");
    if (targets.length > 1 && !canBulkCallWithVoiceBots(user as any)) throw new Error("VOICE_BOT_BULK_NOT_ALLOWED");
    const bot = await queryOne<{ id: string; status: string; archivedAt: string | null }>(`select id, status, "archivedAt" from "VoiceBot" where "tenantId" = $1 and id = $2`, [tenantId, botId]);
    if (!bot || bot.archivedAt) throw new Error("VOICE_BOT_NOT_FOUND");
    if (bot.status !== "LIVE") throw new Error("VOICE_BOT_CALL_NOT_LIVE");
    const trigger: CallTrigger = input.trigger ?? (targets.length > 1 ? "BULK" : "MANUAL");
    const plivo = await getActivePlivoConfig(tenantId).catch(() => null);
    const countryCode = plivoCountryCode(plivo);
    const result = { queued: 0, blocked: [] as Array<{ leadId: string | null; opportunityId: string | null; reason: string }>, callIds: [] as string[] };
    for (const target of targets) {
        const record = await recordPhone(user, target);
        const phone = record?.phone ? normalizePhone(record.phone, countryCode) : null;
        let reason: string | null = !record ? "RECORD_GONE" : !phone ? "NO_PHONE" : null;
        if (!reason && phone) {
            if (await queryOne(`select 1 from "VoiceBotStopList" where "tenantId" = $1 and "phoneDigits" = $2`, [tenantId, digitsOf(phone)])) reason = "STOP_LIST";
            else if (await queryOne(`select 1 from "VoiceBotCall" where "tenantId" = $1 and "botId" = $2 and right(phone, 10) = $3 and status in ('QUEUED', 'DIALING', 'IN_PROGRESS')`, [tenantId, botId, digitsOf(phone)])) reason = "ALREADY_QUEUED";
        }
        const id = randomUUID();
        await execute(
            `insert into "VoiceBotCall" (id, "tenantId", "botId", "firstAttemptId", attempt, trigger, priority, status, "blockedReason", "leadId", "opportunityId", phone, "startedBy")
             values ($1, $2, $3, $1, 1, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, tenantId, botId, trigger, PRIORITY[trigger], reason ? "BLOCKED" : "QUEUED", reason, record?.leadId ?? target.leadId ?? null, record?.opportunityId ?? target.opportunityId ?? null, phone ?? "", user.id],
        );
        if (reason) result.blocked.push({ leadId: record?.leadId ?? target.leadId ?? null, opportunityId: record?.opportunityId ?? target.opportunityId ?? null, reason: BLOCK_MESSAGES[reason] });
        else {
            result.queued++;
            result.callIds.push(id);
        }
    }
    return result;
}

// "Call my phone" from the builder (plan §4.3, Test): the bot calls the tester's own phone, with
// its saved settings, without a record. Works before the bot is live and outside calling hours.
export async function queueTestPhoneCall(user: TenantUser, botId: string, phoneInput: unknown) {
    const tenantId = requireTenantId(user);
    const config = await getActivePlivoConfig(tenantId).catch(() => { throw new Error("VOICE_BOT_CALL_PLIVO_OFF"); });
    const profile = await queryOne<{ phone: string | null }>(`select phone from "User" where id = $1 and "tenantId" = $2`, [user.id, tenantId]);
    const phone = normalizePhone(typeof phoneInput === "string" && phoneInput.trim() ? phoneInput : profile?.phone, plivoCountryCode(config));
    if (!phone) throw new Error("VOICE_BOT_CALL_PHONE_INVALID");
    const bot = await queryOne<{ id: string }>(`select id from "VoiceBot" where "tenantId" = $1 and id = $2 and "archivedAt" is null`, [tenantId, botId]);
    if (!bot) throw new Error("VOICE_BOT_NOT_FOUND");
    if (await queryOne(`select 1 from "VoiceBotCall" where "tenantId" = $1 and "botId" = $2 and trigger = 'TEST_PHONE' and status in ('QUEUED', 'DIALING', 'IN_PROGRESS') and "startedBy" = $3`, [tenantId, botId, user.id])) {
        throw new Error("VOICE_BOT_CALL_TEST_RUNNING");
    }
    const id = randomUUID();
    await execute(
        `insert into "VoiceBotCall" (id, "tenantId", "botId", "firstAttemptId", attempt, trigger, priority, status, phone, "startedBy") values ($1, $2, $3, $1, 1, 'TEST_PHONE', 0, 'QUEUED', $4, $5)`,
        [id, tenantId, botId, phone, user.id],
    );
    return { id, phone };
}

// ---- Dispatching ----------------------------------------------------------------------------------
type CallRow = {
    id: string; tenantId: string; botId: string; firstAttemptId: string | null; attempt: number; trigger: CallTrigger; priority: number; status: string;
    leadId: string | null; opportunityId: string | null; phone: string; startedBy: string | null; sessionId: string | null; callLogId: string | null;
    plivoCallUuid: string | null; answeredAt: string | null; transfer: any; outcome: string | null; processedAt: string | null; durationSeconds: number | null; fromNumber: string | null;
};
const CALL_COLUMNS = `id, "tenantId", "botId", "firstAttemptId", attempt, trigger, priority, status, "leadId", "opportunityId", phone, "startedBy", "sessionId", "callLogId", "plivoCallUuid", "answeredAt", transfer, outcome, "processedAt", "durationSeconds", "fromNumber"`;

async function blockCall(call: CallRow, reason: string, detail?: string) {
    await executeAsSystem(`update "VoiceBotCall" set status = 'BLOCKED', "blockedReason" = $2, error = $3, "updatedAt" = now() where id = $1`, [call.id, reason, detail ?? null]);
    await callChainEnded(call.tenantId, call.id, { status: "BLOCKED", outcome: "BLOCKED", blockedReason: reason });
}

async function deferCall(call: CallRow, until: Date) {
    await executeAsSystem(`update "VoiceBotCall" set status = 'QUEUED', "notBefore" = $2, "updatedAt" = now() where id = $1`, [call.id, until.toISOString()]);
}

// Places due calls, at most MAX_ACTIVE_CALLS_PER_WORKSPACE at a time, highest priority first
// (decision 14). Run by the worker every 15 seconds and straight after calls are queued.
export async function dispatchVoiceBotCalls(options: { tenantId?: string; place?: (call: CallRow) => Promise<void> } = {}) {
    await expireStaleCalls();
    await feedBotCampaigns(options.tenantId);
    const tenants = options.tenantId ? [{ tenantId: options.tenantId }] : await queryAsSystem<{ tenantId: string }>(
        `select distinct "tenantId" from "VoiceBotCall" where status = 'QUEUED' and "notBefore" <= now()`, [],
    );
    let placed = 0;
    for (const { tenantId } of tenants) {
        // With Voice bots switched off for the workspace, its calls stay queued (paused) until it's back on.
        if (!(await voiceBotsOnFor(tenantId))) continue;
        const active = Number((await queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "VoiceBotCall" where "tenantId" = $1 and status = any($2)`, [tenantId, ACTIVE]))?.count ?? 0);
        let slots = MAX_ACTIVE_CALLS_PER_WORKSPACE - active;
        if (slots <= 0) continue;
        const due = await queryAsSystem<CallRow>(
            `select ${CALL_COLUMNS} from "VoiceBotCall" where "tenantId" = $1 and status = 'QUEUED' and "notBefore" <= now() order by priority, "notBefore", "createdAt" limit $2`,
            [tenantId, slots * 4],
        );
        const timeZone = await getTenantTimeZone(tenantId);
        const holidays = await holidaySet(tenantId);
        for (const call of due) {
            if (slots <= 0) break;
            const claimed = await queryOneAsSystem<{ id: string }>(`update "VoiceBotCall" set status = 'DIALING', "updatedAt" = now() where id = $1 and status = 'QUEUED' returning id`, [call.id]);
            if (!claimed) continue;
            const decision = await checkBeforeDialling(call, timeZone, holidays);
            if (decision.action === "block") {
                await blockCall(call, decision.reason);
                continue;
            }
            if (decision.action === "wait") {
                await deferCall(call, decision.until);
                continue;
            }
            slots--;
            placed++;
            await (options.place ?? placeVoiceBotCall)(call).catch(async (error) => {
                await executeAsSystem(`update "VoiceBotCall" set status = 'FAILED', error = $2, "endedAt" = now(), "updatedAt" = now() where id = $1`, [call.id, String(error instanceof Error ? error.message : error).slice(0, 300)]);
            });
        }
    }
    return { placed };
}

type Decision = { action: "place" } | { action: "wait"; until: Date } | { action: "block"; reason: string };

async function checkBeforeDialling(call: CallRow, timeZone: string, holidays: Set<string>): Promise<Decision> {
    const bot = await queryOneAsSystem<{ status: string; archivedAt: string | null; config: VoiceBotConfig }>(`select status, "archivedAt", config from "VoiceBot" where id = $1`, [call.botId]);
    if (!bot || bot.archivedAt) return { action: "block", reason: "BOT_ARCHIVED" };
    if (call.trigger === "TEST_PHONE") return { action: "place" };
    if (bot.status === "PAUSED") return { action: "wait", until: new Date(Date.now() + 15 * 60_000) };
    if (bot.status !== "LIVE") return { action: "block", reason: "BOT_NOT_LIVE" };
    if (!call.phone) return { action: "block", reason: "NO_PHONE" };
    if (call.leadId) {
        const lead = await queryOneAsSystem<{ mergedIntoId: string | null }>(`select "mergedIntoId" from "Lead" where id = $1 and "tenantId" = $2 and "deletedAt" is null`, [call.leadId, call.tenantId]);
        if (!lead || lead.mergedIntoId) return { action: "block", reason: "RECORD_GONE" };
    }
    if (await queryOneAsSystem(`select 1 from "VoiceBotStopList" where "tenantId" = $1 and "phoneDigits" = $2`, [call.tenantId, digitsOf(call.phone)])) return { action: "block", reason: "STOP_LIST" };
    const compliance = await checkTelephonyComplianceForCall(call.tenantId, call.phone, { entityType: call.opportunityId ? "OPPORTUNITY" : "LEAD", entityId: call.opportunityId ?? call.leadId });
    if (!compliance.allowed) {
        if (compliance.reason === "QUIET_HOURS") return { action: "wait", until: new Date(Date.now() + 15 * 60_000) };
        return { action: "block", reason: compliance.reason };
    }
    const config = bot.config;
    const now = new Date();
    const window = nextCallingTime(config.calling, holidays, timeZone, now);
    if (!window) return { action: "block", reason: "BOT_NOT_LIVE" };
    if (window.getTime() > now.getTime() + 30_000) return { action: "wait", until: window };
    // The bot's daily limit counts calls placed since the start of today, in the workspace time zone.
    const today = zonedWallClockParts(now, timeZone);
    const startOfDay = zonedWallClockToUTC(today.year, today.month, today.day, 0, 0, timeZone);
    const placedToday = Number((await queryOneAsSystem<{ count: number }>(
        `select count(*)::int as count from "VoiceBotCall" where "botId" = $1 and trigger not in ('TEST_PHONE', 'INBOUND') and "dialedAt" >= $2`, [call.botId, startOfDay.toISOString()],
    ))?.count ?? 0);
    if (placedToday >= config.dailyLimit) {
        const tomorrow = nextCallingTime(config.calling, holidays, timeZone, new Date(startOfDay.getTime() + 24 * 3600_000));
        return tomorrow ? { action: "wait", until: tomorrow } : { action: "block", reason: "BOT_NOT_LIVE" };
    }
    if (call.attempt === 1 && call.trigger !== "INBOUND") {
        const spoke = await queryOneAsSystem(
            `select 1 from "VoiceBotCall" where "botId" = $1 and right(phone, 10) = $2 and "answeredAt" >= $3 and id <> $4 limit 1`,
            [call.botId, digitsOf(call.phone), startOfDay.toISOString(), call.id],
        );
        if (spoke) return { action: "block", reason: "CALLED_TODAY" };
    }
    return { action: "place" };
}

// A call that Plivo never reported back on (the CRM was down, a callback was lost) is closed.
async function expireStaleCalls() {
    await executeAsSystem(
        `update "VoiceBotCall" set status = 'FAILED', error = coalesce(error, 'Plivo never reported how this call went.'), "endedAt" = now(), "updatedAt" = now()
         where status = 'DIALING' and coalesce("dialedAt", "updatedAt") < now() - interval '10 minutes'`,
        [],
    );
    const stuck = await queryAsSystem<{ id: string; tenantId: string }>(
        `select id, "tenantId" from "VoiceBotCall" where status = 'IN_PROGRESS' and "answeredAt" < now() - interval '45 minutes' and "processedAt" is null`, [],
    );
    for (const call of stuck) {
        await executeAsSystem(`update "VoiceBotCall" set status = 'COMPLETED', "endedAt" = coalesce("endedAt", now()), "updatedAt" = now() where id = $1`, [call.id]);
        await processVoiceBotCall(call.tenantId, call.id).catch(() => undefined);
    }
    // The bot service's report and Plivo's hang-up can cross; a call both have finished with is
    // processed here if neither started its after-call work.
    const finished = await queryAsSystem<{ id: string; tenantId: string }>(
        `select c.id, c."tenantId" from "VoiceBotCall" c left join "VoiceBotSession" s on s.id = c."sessionId"
         where c."processedAt" is null and c.status in ('COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'MACHINE') and c."endedAt" < now() - interval '1 minute'
           and (s.id is null or s.status not in ('ACTIVE', 'PENDING'))
         limit 20`, [],
    );
    for (const call of finished) await processVoiceBotCall(call.tenantId, call.id).catch(() => undefined);
}

// Places one call through Plivo. The CRM's call ID is the bot call's own ID.
export async function placeVoiceBotCall(call: CallRow) {
    const config = await getActivePlivoConfig(call.tenantId).catch(() => null);
    if (!config) return blockCall(call, "PLIVO");
    const loaded = await loadVoiceBotForSession(call.tenantId, call.botId);
    if (!loaded) return blockCall(call, "BOT_ARCHIVED");
    const bot = loaded.bot;
    const owner = call.leadId ? (await queryOneAsSystem<{ ownerId: string | null }>(`select "ownerId" from "Lead" where id = $1`, [call.leadId]))?.ownerId ?? null : null;
    const actor = await loadActor(call.tenantId, [call.startedBy, owner]);
    if (!actor) return blockCall(call, "NOT_READY", "No user to act for this call.");
    const countryCode = plivoCountryCode(config);
    const from = normalizePhone(bot.config.outboundNumber || config.outboundCallerId || config.inboundNumber, countryCode);
    if (!from) return blockCall(call, "PLIVO", "No calling number is set.");
    const ringSeconds = plivoRingTimeout(config);
    let session: Awaited<ReturnType<typeof createCallSession>>;
    try {
        session = await createCallSession(actor, call.botId, { leadId: call.leadId, opportunityId: call.opportunityId }, call.id, ringSeconds);
    } catch (error) {
        const code = error instanceof Error ? error.message : "";
        return blockCall(call, code.startsWith("VOICE_BOT_SERVICE") ? "SERVICE" : "NOT_READY", code);
    }
    const machine = bot.config.answeringMachine === "NOT_ANSWERED" && call.trigger !== "TEST_PHONE";
    await recordTelephonyCallEvent(call.tenantId, {
        provider: "plivo", callId: call.id, direction: "OUTBOUND", fromNumber: from, toNumber: call.phone, status: "dialing",
        leadId: call.leadId ?? undefined, opportunityId: call.opportunityId ?? undefined, agentId: owner ?? actor.id,
        metadata: { source: "plivo", voiceBotCallId: call.id, voiceBotId: bot.id, voiceBotName: bot.name, voiceBotKeepAudio: bot.config.keepAudio, trigger: call.trigger },
    }, { id: actor.id, tenantId: call.tenantId });
    const callLog = await queryOneAsSystem<{ id: string }>(`select id from "TelephonyCallLog" where "tenantId" = $1 and provider = 'plivo' and "callId" = $2`, [call.tenantId, call.id]);
    const { authId, authToken } = plivoCredentials(config);
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString("base64")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from, to: call.phone,
            answer_url: plivoCallbackUrl(call.tenantId, "answer", { callId: call.id, flow: "bot" }), answer_method: "POST",
            ring_url: plivoCallbackUrl(call.tenantId, "event", { callId: call.id, source: "ring" }), ring_method: "POST",
            hangup_url: plivoCallbackUrl(call.tenantId, "event", { callId: call.id, source: "hangup" }), hangup_method: "POST",
            ring_timeout: ringSeconds,
            // Plivo ends the call itself if the bot service somehow doesn't.
            time_limit: bot.config.maxCallMinutes * 60 + 180,
            ...(machine ? { machine_detection: "true", machine_detection_url: plivoCallbackUrl(call.tenantId, "machine", { callId: call.id }), machine_detection_method: "POST" } : {}),
        }),
        signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.request_uuid) {
        await executeAsSystem(`update "VoiceBotSession" set status = 'EXPIRED', "updatedAt" = now() where id = $1`, [session.sessionId]);
        await syncPlivoEvent(call.tenantId, new URLSearchParams(), "hangup", call.id, { config, status: "failed", metadata: { outcomeReason: "PLIVO_REQUEST_FAILED" } }).catch(() => undefined);
        await executeAsSystem(`update "VoiceBotCall" set status = 'FAILED', error = $2, "sessionId" = $3, "callLogId" = $4, "endedAt" = now(), "updatedAt" = now() where id = $1`,
            [call.id, `Plivo refused the call (${response.status}).`, session.sessionId, callLog?.id ?? null]);
        return;
    }
    await executeAsSystem(
        `update "VoiceBotCall" set status = 'DIALING', "sessionId" = $2, "callLogId" = $3, "plivoRequestUuid" = $4, "fromNumber" = $5, "dialedAt" = now(), "updatedAt" = now() where id = $1`,
        [call.id, session.sessionId, callLog?.id ?? null, String(body.request_uuid), from],
    );
}

export async function findVoiceBotCall(tenantId: string, callId: string) {
    return queryOneAsSystem<CallRow>(`select ${CALL_COLUMNS} from "VoiceBotCall" where "tenantId" = $1 and id = $2`, [tenantId, callId]);
}

// ---- Plivo callbacks for bot calls -----------------------------------------------------------------
const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>`;

// The bot call was answered: record the whole call when the bot keeps audio (decision 17), and
// stream it to the bot service.
export async function botAnswerXml(tenantId: string, config: PlivoConfig, form: URLSearchParams, call: CallRow) {
    const session = call.sessionId ? await queryOneAsSystem<{ id: string; status: string }>(`select id, status from "VoiceBotSession" where id = $1`, [call.sessionId]) : null;
    const bot = await queryOneAsSystem<{ config: VoiceBotConfig }>(`select config from "VoiceBot" where id = $1`, [call.botId]);
    await executeAsSystem(
        `update "VoiceBotCall" set status = 'IN_PROGRESS', "answeredAt" = coalesce("answeredAt", now()), "plivoCallUuid" = coalesce($2, "plivoCallUuid"), "updatedAt" = now() where id = $1 and status in ('DIALING', 'IN_PROGRESS')`,
        [call.id, form.get("CallUUID")],
    );
    await syncPlivoEvent(tenantId, form, "answer", call.id, { config, status: "answered", metadata: { answeredAt: new Date().toISOString(), callUuid: form.get("CallUUID") } }).catch(() => undefined);
    const streamUrl = session && session.status === "PENDING" ? await issueCallStreamUrl(session.id) : null;
    if (!streamUrl) return `${XML_HEAD}<Response><Hangup/></Response>`;
    const keepAudio = bot?.config.keepAudio === true;
    const record = keepAudio
        ? `<Record recordSession="true" maxLength="${(bot!.config.maxCallMinutes + 5) * 60}" fileFormat="mp3" callbackUrl="${escapeXml(plivoCallbackUrl(tenantId, "recording", { callId: call.id }))}" callbackMethod="POST"/>`
        : "";
    const timeout = (bot?.config.maxCallMinutes ?? 8) * 60 + 120;
    return `${XML_HEAD}<Response>${record}<Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" streamTimeout="${timeout}">${escapeXml(streamUrl)}</Stream></Response>`;
}

// Plivo's hangup callback for a bot call: the call's final status, and what happens next.
export async function handleBotHangup(tenantId: string, config: PlivoConfig, form: URLSearchParams, call: CallRow) {
    const answered = !!call.answeredAt;
    const callStatus = String(form.get("CallStatus") ?? "").toLowerCase();
    const cause = String(form.get("HangupCauseName") ?? "").toLowerCase();
    const status = answered ? "COMPLETED"
        : call.status === "MACHINE" ? "MACHINE"
        : callStatus === "busy" || cause.includes("busy") ? "BUSY"
        : callStatus === "failed" || cause.includes("unallocated") || cause.includes("invalid") ? "FAILED"
        : "NO_ANSWER";
    const duration = Number(form.get("Duration"));
    await executeAsSystem(
        `update "VoiceBotCall" set status = case when status in ('COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'MACHINE', 'CANCELLED') then status else $2 end,
           "endedAt" = coalesce("endedAt", now()), "durationSeconds" = coalesce($3, "durationSeconds"), "updatedAt" = now() where id = $1`,
        [call.id, status, answered && Number.isFinite(duration) ? duration : null],
    );
    const logStatus = status === "COMPLETED" ? "completed" : status === "BUSY" ? "busy" : status === "FAILED" ? "failed" : status === "MACHINE" ? "voicemail" : "no-answer";
    await syncPlivoEvent(tenantId, form, "hangup", call.id, { config, status: logStatus, metadata: { hangupCause: form.get("HangupCauseName"), hangupSource: form.get("HangupSource") } }).catch(() => undefined);
    if (answered && Number.isFinite(duration)) await executeAsSystem(`update "TelephonyCallLog" set duration = $3 where "tenantId" = $1 and "callId" = $2`, [tenantId, call.id, duration]);
    if (!answered && call.sessionId) await executeAsSystem(`update "VoiceBotSession" set status = 'EXPIRED', "updatedAt" = now() where id = $1 and status = 'PENDING'`, [call.sessionId]);
    // Unanswered calls are processed now; answered ones once the bot service's report is in.
    const session = call.sessionId ? await queryOneAsSystem<{ status: string }>(`select status from "VoiceBotSession" where id = $1`, [call.sessionId]) : null;
    if (!answered || (session && session.status !== "ACTIVE" && session.status !== "PENDING")) return { process: true };
    return { process: false };
}

// Asynchronous answering-machine detection (decision 12): a machine counts as not answered.
export async function handleBotMachine(tenantId: string, config: PlivoConfig, form: URLSearchParams, call: CallRow) {
    if (String(form.get("Machine") ?? "").toLowerCase() !== "true") return;
    await executeAsSystem(`update "VoiceBotCall" set status = 'MACHINE', "answeredAt" = null, "updatedAt" = now() where id = $1 and status in ('DIALING', 'IN_PROGRESS')`, [call.id]);
    const uuid = form.get("CallUUID") ?? call.plivoCallUuid;
    if (!uuid) return;
    const { authId, authToken } = plivoCredentials(config);
    await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/${encodeURIComponent(uuid)}/`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString("base64")}` },
        signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
}

// ---- Live transfer (decision 3) ---------------------------------------------------------------------
// The people a caller is handed to, in order: the lead owner, then the bot's team's agents who
// are online, fewest calls today first.
async function transferTargets(tenantId: string, config: PlivoConfig, call: CallRow, teamId: string | null) {
    const countryCode = plivoCountryCode(config);
    const targets: Array<{ userId: string | null; phone: string; name: string | null }> = [];
    const ownerId = call.leadId ? (await queryOneAsSystem<{ ownerId: string | null }>(`select "ownerId" from "Lead" where id = $1`, [call.leadId]))?.ownerId ?? null : call.startedBy;
    if (ownerId) {
        const owner = await queryOneAsSystem<{ phone: string | null; name: string | null }>(`select phone, name from "User" where id = $1 and "tenantId" = $2`, [ownerId, tenantId]);
        const phone = plivoAgentPhoneForUser(config, ownerId, owner?.phone);
        if (phone) targets.push({ userId: ownerId, phone, name: owner?.name ?? null });
    }
    if (teamId) {
        const agents = await queryAsSystem<{ id: string; phone: string | null; name: string | null }>(
            `select u.id, u.phone, u.name from "TeamMember" tm join "User" u on u.id = tm."userId" and u."tenantId" = tm."tenantId"
             join "AgentAvailability" a on a."userId" = u.id and a."tenantId" = u."tenantId" and a.status = 'ONLINE'
             where tm."tenantId" = $1 and tm."teamId"::text = $2 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'
             order by (select count(*) from "TelephonyCallLog" c where c."tenantId" = u."tenantId" and c."agentId" = u.id and c."startedAt" >= now() - interval '1 day'), u.name
             limit 6`,
            [tenantId, teamId],
        );
        for (const agent of agents) {
            const phone = plivoAgentPhoneForUser(config, agent.id, agent.phone);
            if (phone && !targets.some((target) => target.phone === phone)) targets.push({ userId: agent.id, phone, name: agent.name });
            if (targets.length >= 4) break;
        }
    }
    return targets.filter((target) => normalizePhone(target.phone, countryCode) !== normalizePhone(config.inboundNumber, countryCode));
}

// The bot service asks for a hand-over during a phone call.
export async function requestVoiceBotTransfer(sessionId: string, input: { reason?: unknown; transcript?: unknown }) {
    const session = await queryOneAsSystem<{ tenantId: string; status: string; kind: string; voiceBotCallId: string | null }>(
        `select "tenantId", status, kind, "voiceBotCallId" from "VoiceBotSession" where id = $1`, [sessionId],
    );
    if (!session || session.status !== "ACTIVE" || session.kind !== "CALL" || !session.voiceBotCallId) return null;
    const call = await findVoiceBotCall(session.tenantId, session.voiceBotCallId);
    if (!call?.plivoCallUuid) return { ok: false, reason: "call_not_found" };
    const bot = await queryOneAsSystem<{ name: string; config: VoiceBotConfig }>(`select name, config from "VoiceBot" where id = $1`, [call.botId]);
    if (!bot?.config.transfer.enabled) return { ok: false, reason: "transfer_off" };
    const config = await getActivePlivoConfig(session.tenantId).catch(() => null);
    if (!config) return { ok: false, reason: "plivo_off" };
    const targets = await transferTargets(session.tenantId, config, call, bot.config.transfer.teamId);
    if (!targets.length) {
        await executeAsSystem(`update "VoiceBotCall" set transfer = $2, "updatedAt" = now() where id = $1`, [call.id, JSON.stringify({ status: "NO_ONE", reason: String(input.reason ?? "").slice(0, 200), at: new Date().toISOString() })]);
        return { ok: false, reason: "no_one_to_ring" };
    }
    const lead = call.leadId ? await queryOneAsSystem<{ name: string | null }>(`select name from "Lead" where id = $1`, [call.leadId]) : null;
    const transcript = Array.isArray(input.transcript) ? input.transcript as Array<{ role?: string; text?: string }> : [];
    const lastCaller = [...transcript].reverse().find((line) => line?.role === "caller")?.text ?? "";
    const { createUserNotification } = await import("@/lib/server/notifications");
    for (const target of targets) {
        if (!target.userId) continue;
        await createUserNotification({
            tenantId: session.tenantId, userId: target.userId, category: "CALLS",
            title: `Voice bot ${bot.name} is handing you a call`,
            message: `${lead?.name ?? call.phone}: ${String(input.reason ?? "wants to talk to someone").slice(0, 150)}.${lastCaller ? ` Last said: "${lastCaller.slice(0, 160)}"` : ""}`,
            data: call.leadId ? { leadId: call.leadId, type: "VOICE_BOT_TRANSFER" } : { type: "VOICE_BOT_TRANSFER" },
        }).catch(() => undefined);
    }
    await executeAsSystem(`update "VoiceBotCall" set transfer = $2, "updatedAt" = now() where id = $1`,
        [call.id, JSON.stringify({ status: "RINGING", reason: String(input.reason ?? "").slice(0, 200), targets, index: 0, at: new Date().toISOString() })]);
    const { authId, authToken } = plivoCredentials(config);
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/${encodeURIComponent(call.plivoCallUuid)}/`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString("base64")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ legs: "aleg", aleg_url: plivoCallbackUrl(session.tenantId, "answer", { callId: call.id, flow: "bot-transfer" }), aleg_method: "POST" }),
        signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!response || !response.ok) {
        await executeAsSystem(`update "VoiceBotCall" set transfer = transfer || '{"status":"FAILED"}'::jsonb, "updatedAt" = now() where id = $1`, [call.id]);
        return { ok: false, reason: "plivo_refused" };
    }
    return { ok: true, people: targets.length };
}

// Plivo asks what to do with the transferred call: ring the next person.
export async function botTransferXml(tenantId: string, config: PlivoConfig, call: CallRow, index: number) {
    const target = call.transfer?.targets?.[index];
    const bot = await queryOneAsSystem<{ config: VoiceBotConfig }>(`select config from "VoiceBot" where id = $1`, [call.botId]);
    if (!target) return transferFailedXml(tenantId, call);
    await executeAsSystem(`update "VoiceBotCall" set transfer = transfer || jsonb_build_object('index', $2::int, 'status', 'RINGING'), "updatedAt" = now() where id = $1`, [call.id, index]);
    return plivoDialXml(tenantId, {
        target: target.phone, callId: call.id, recordingEnabled: false,
        callerId: normalizePhone(call.fromNumber ?? config.outboundCallerId ?? config.inboundNumber, plivoCountryCode(config)),
        timeoutSeconds: bot?.config.transfer.ringSeconds ?? 25, stage: `transfer-${index}`,
    });
}

// The person rung didn't answer: the next one, or the caller hears that someone will call back,
// and the owner gets a callback task.
export async function botTransferDialStatusXml(tenantId: string, config: PlivoConfig, form: URLSearchParams, call: CallRow, index: number) {
    const dialStatus = String(form.get("DialStatus") ?? "").toLowerCase();
    if (dialStatus === "completed") {
        const target = call.transfer?.targets?.[index];
        await executeAsSystem(`update "VoiceBotCall" set transfer = transfer || jsonb_build_object('status', 'CONNECTED', 'connectedTo', $2::text, 'connectedUserId', $3::text), "updatedAt" = now() where id = $1`,
            [call.id, target?.name ?? target?.phone ?? null, target?.userId ?? null]);
        if (target?.userId) await executeAsSystem(`update "TelephonyCallLog" set "agentId" = $3 where "tenantId" = $1 and "callId" = $2`, [tenantId, call.id, target.userId]);
        return plivoHangupXml();
    }
    if (call.transfer?.targets?.[index + 1]) return botTransferXml(tenantId, config, call, index + 1);
    return transferFailedXml(tenantId, call);
}

async function transferFailedXml(tenantId: string, call: CallRow) {
    await executeAsSystem(`update "VoiceBotCall" set transfer = coalesce(transfer, '{}'::jsonb) || '{"status":"NO_ANSWER"}'::jsonb, "updatedAt" = now() where id = $1`, [call.id]);
    const audio = call.sessionId ? signedLineUrl(tenantId, call.sessionId, "noOneFree") : null;
    const say = audio ? `<Play>${escapeXml(audio)}</Play>` : `<Speak>${escapeXml("Sorry, nobody from our team is free right now. We'll call you back soon. Thank you!")}</Speak>`;
    return `${XML_HEAD}<Response>${say}<Hangup/></Response>`;
}

// A recorded line of the call's bot, as a short-lived address Plivo can play (the bot's own voice).
function audioSecret() {
    return voiceBotServiceConfig().secret || process.env.JWT_SECRET || "";
}
export function signedLineUrl(tenantId: string, sessionId: string, line: string) {
    if (!audioSecret()) return null;
    const expires = Math.floor(Date.now() / 1000) + 15 * 60;
    const payload = `${tenantId}.${sessionId}.${line}.${expires}`;
    const signature = createHmac("sha256", audioSecret()).update(payload).digest("base64url");
    return new URL(`/api/public/voice-bot-audio/${Buffer.from(payload).toString("base64url")}.${signature}.wav`, publicPlivoBaseUrl()).toString();
}

export async function signedLineAudio(token: string) {
    const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})\.wav$/.exec(token);
    if (!match || !audioSecret()) return null;
    const payload = Buffer.from(match[1], "base64url").toString("utf8");
    const expected = createHmac("sha256", audioSecret()).update(payload).digest();
    const given = Buffer.from(match[2], "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const [tenantId, sessionId, line, expires] = payload.split(".");
    if (!tenantId || !sessionId || !/^[A-Za-z]+$/.test(line ?? "") || Number(expires) < Date.now() / 1000) return null;
    const session = await queryOneAsSystem<{ snapshot: any }>(`select snapshot from "VoiceBotSession" where id = $1 and "tenantId" = $2`, [sessionId, tenantId]);
    const lines = session?.snapshot?.audioLines ?? {};
    const path = lines[`${line}.${session?.snapshot?.startLanguage ?? "hi"}`] ?? lines[`${line}.en`] ?? lines[`${line}.hi`];
    if (!path) return null;
    const pcm = await readPrivateFile(path).catch(() => null);
    if (!pcm) return null;
    const rate = Number(session?.snapshot?.sampleRate ?? 8000);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0, "ascii"); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii"); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
    header.write("data", 36, "ascii"); header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

// ---- After the call --------------------------------------------------------------------------------------
// How the bot did (decision 30, wave G): 1-5, what went wrong, and whether a person should listen.
export type CallReview = { score: number; issues: string[]; listen: boolean; reason: string; by: "claude" | "groq" };
type Summary = { summary: string; outcome: string | null; fields: Record<string, unknown>; callbackAt: string | null; callerName: string | null; review: CallReview | null };

function cleanReview(value: any, by: CallReview["by"]): CallReview | null {
    if (!value || typeof value !== "object") return null;
    const score = Math.round(Number(value.score));
    if (!(score >= 1 && score <= 5)) return null;
    const issues = Array.isArray(value.issues) ? value.issues.map((item: unknown) => String(item).trim().slice(0, 200)).filter(Boolean).slice(0, 5) : [];
    return { score, issues, listen: value.listen === true, reason: String(value.reason ?? "").trim().slice(0, 300), by };
}

async function summarise(tenantId: string, botId: string, input: {
    transcript: Array<{ role: string; text: string }>; fields: Array<{ key: string; label: string; type: string; options: string[] }>; liveFields: Record<string, unknown>;
    timeZone: string; callbackWhen: string | null; brief: string;
}): Promise<Summary | null> {
    const lines = input.transcript.filter((line) => line.text?.trim()).map((line) => `${line.role === "caller" ? "Caller" : "Bot"}: ${line.text}`);
    if (!lines.some((line) => line.startsWith("Caller:"))) return null;
    const now = new Date().toLocaleString("en-IN", { timeZone: input.timeZone, dateStyle: "full", timeStyle: "short" });
    const fieldList = input.fields.map((field) => `- ${field.key} (${field.label}, ${field.type.toLowerCase()}${field.options.length ? `; one of: ${field.options.join(" | ")}` : ""})`).join("\n") || "(none)";
    const system = "You summarise a phone call between an education institution's voice bot and a caller, for the counsellor who owns the lead. Write in English, even if the call was in Hindi. Be factual: only what the caller said or agreed. You also review how the bot did, for the team that builds it: strict, fair and specific.";
    const user = [
        `Now: ${now} (${input.timeZone}).`,
        `Fields to fill from the call:\n${fieldList}`,
        `Already captured during the call (keep unless the caller clearly corrected them): ${JSON.stringify(input.liveFields)}`,
        input.callbackWhen ? `The caller asked for a callback: "${input.callbackWhen}".` : "",
        `The bot's brief (what it was told to do):\n${input.brief.slice(0, 6000) || "(none)"}`,
        `Transcript:\n${lines.join("\n").slice(0, 40_000)}`,
        `Answer as JSON: {"summary": "2 to 4 sentences for the counsellor", "outcome": one of interested | not_interested | callback | wrong_number | do_not_call | no_response | other, "fields": {"key": value} (only fields the caller actually answered; numbers as digits, dates YYYY-MM-DD, yes/no as true/false, list answers exactly as allowed), "callbackAt": the callback time as an ISO 8601 date-time with the workspace offset, or null, "callerName": the caller's own name if they said it, else null, "review": {"score": 1 to 5 for how well the bot followed its brief, stayed accurate (nothing made up), understood the caller, kept to the caller's language and was polite, "issues": up to 5 short, specific problems (empty if none), "listen": true when a person should listen to this call (wrong or made-up information, a rule broken, the caller upset or confused, the bot misunderstood them, or a hand-over they asked for was missed), "reason": one sentence on the score}}`,
    ].filter(Boolean).join("\n\n");
    const useClaude = !!(await providerKey(tenantId, "claude")) && !(await claudeCapReached(tenantId));
    try {
        if (useClaude) {
            const result = await callClaude(tenantId, {
                model: "claude-sonnet-5-5", botId, maxTokens: 1200, system,
                messages: [{ role: "user", content: user }],
                tools: [{ name: "call_summary", description: "The call's summary and results.", input_schema: {
                    type: "object",
                    properties: {
                        summary: { type: "string" }, outcome: { type: "string" }, fields: { type: "object" }, callbackAt: { type: ["string", "null"] }, callerName: { type: ["string", "null"] },
                        review: {
                            type: "object",
                            properties: { score: { type: "integer", minimum: 1, maximum: 5 }, issues: { type: "array", items: { type: "string" } }, listen: { type: "boolean" }, reason: { type: "string" } },
                            required: ["score", "issues", "listen", "reason"],
                        },
                    },
                    required: ["summary", "outcome", "fields", "review"],
                } }],
                toolChoice: { type: "tool", name: "call_summary" },
            });
            const value = result.content.find((block) => block.type === "tool_use")?.input ?? {};
            return { summary: String(value.summary ?? ""), outcome: value.outcome ? String(value.outcome) : null, fields: value.fields && typeof value.fields === "object" ? value.fields : {}, callbackAt: value.callbackAt ? String(value.callbackAt) : null, callerName: cleanName(value.callerName), review: cleanReview(value.review, "claude") };
        }
    } catch {
        // Claude unavailable: Groq below (decision 28).
    }
    try {
        const value = await callGroqJson(tenantId, { model: "openai/gpt-oss-120b", system, user, botId });
        return { summary: String(value.summary ?? ""), outcome: value.outcome ? String(value.outcome) : null, fields: value.fields && typeof value.fields === "object" ? value.fields : {}, callbackAt: value.callbackAt ? String(value.callbackAt) : null, callerName: cleanName(value.callerName), review: cleanReview(value.review, "groq") };
    } catch {
        return null;
    }
}

// What the bot was told, for the review: its persona, goal, rules and when to hand over or end.
function botBrief(config: VoiceBotConfig) {
    return [
        config.persona && `Persona: ${config.persona}`,
        config.goal && `Goal: ${config.goal}`,
        config.rules && `Rules: ${config.rules}`,
        config.transfer.enabled && `Hand over to a person when: ${config.transfer.rule || "the caller asks for one"}`,
        config.endRule && `End the call when: ${config.endRule}`,
    ].filter(Boolean).join("\n");
}

function cleanName(value: unknown) {
    const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    return name && !/^(null|unknown|n\/a)$/i.test(name) ? name : null;
}

function isEmpty(value: unknown) {
    return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

// Copies the bot's answers to the lead or opportunity, per each mapping's mode (decision 11). The
// record's history shows each change as set by the voice bot.
async function applyMappings(actor: TenantUser, bot: { id: string; name: string; config: VoiceBotConfig }, call: CallRow, fields: Record<string, unknown>) {
    const applied: Array<{ field: string; target: string; value: unknown }> = [];
    const skipped: Array<{ field: string; target: string; reason: string }> = [];
    const source = { kind: "VOICE_BOT" as const, label: bot.name, botId: bot.id, callId: call.id };
    const leadPatch: Record<string, unknown> = {};
    const leadCustom: Record<string, unknown> = {};
    const opportunityPatch: Record<string, unknown> = {};
    const opportunityCustom: Record<string, unknown> = {};
    const { getLeadForTenant, updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const { getOpportunityForTenant, updateOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    const lead: any = call.leadId ? await getLeadForTenant(actor as any, call.leadId).catch(() => null) : null;
    const opportunity: any = call.opportunityId ? await getOpportunityForTenant(actor as any, call.opportunityId).catch(() => null) : null;
    for (const mapping of bot.config.mappings) {
        const value = fields[mapping.fieldKey];
        if (isEmpty(value) || mapping.mode === "NEVER") continue;
        const [object, key] = mapping.target.split(".") as ["lead" | "opportunity", string];
        const record = object === "lead" ? lead : opportunity;
        if (!record) {
            skipped.push({ field: mapping.fieldKey, target: mapping.target, reason: `No ${object} on this call` });
            continue;
        }
        const standard = object === "lead" ? ["name", "email", "company", "source"].includes(key) : ["amount", "expectedCloseDate"].includes(key);
        const current = standard ? record[key] : record.customFields?.[key];
        if (mapping.mode === "IF_EMPTY" && !isEmpty(current)) {
            skipped.push({ field: mapping.fieldKey, target: mapping.target, reason: "Already filled" });
            continue;
        }
        if (object === "lead") (standard ? leadPatch : leadCustom)[key] = value;
        else (standard ? opportunityPatch : opportunityCustom)[key] = value;
        applied.push({ field: mapping.fieldKey, target: mapping.target, value });
    }
    const actingAs = { ...actor, changeSource: source };
    try {
        if (lead && (Object.keys(leadPatch).length || Object.keys(leadCustom).length)) {
            await updateLeadForTenant(actingAs as any, lead.id, { ...leadPatch, ...(Object.keys(leadCustom).length ? { customFields: leadCustom } : {}) });
        }
        if (opportunity && (Object.keys(opportunityPatch).length || Object.keys(opportunityCustom).length)) {
            await updateOpportunityForTenant(actingAs as any, opportunity.id, { ...opportunityPatch, ...(Object.keys(opportunityCustom).length ? { customFields: opportunityCustom } : {}) });
        }
    } catch (error) {
        return { applied: [], skipped: [...skipped, ...applied.map((item) => ({ field: item.field, target: item.target, reason: error instanceof Error ? error.message : "Update failed" }))] };
    }
    return { applied, skipped };
}

function transcriptText(transcript: Array<{ role: string; text: string; at?: number }>) {
    return transcript.map((line) => `${line.role === "caller" ? "Caller" : "Bot"}: ${line.text}`).join("\n");
}

async function createInboundLead(tenantId: string, bot: { id: string; name: string }, call: CallRow, callerName: string | null) {
    const actor = await loadActor(tenantId, []);
    if (!actor) return { leadId: null, error: "No active admin to create the lead as" };
    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    try {
        const lead: any = await createLeadForTenant(
            { ...actor, changeSource: { kind: "VOICE_BOT", label: bot.name, botId: bot.id, callId: call.id } } as any,
            { name: callerName ?? call.phone, phone: call.phone, source: "Voice bot (inbound)" },
            `voice-bot-inbound:${call.id}`,
        );
        await executeAsSystem(`update "VoiceBotCall" set "leadId" = $2, "updatedAt" = now() where id = $1`, [call.id, lead.id]);
        if (call.callLogId) await executeAsSystem(`update "TelephonyCallLog" set "leadId" = coalesce("leadId", $2) where id = $1`, [call.callLogId, lead.id]);
        return { leadId: lead.id as string, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { leadId: null, error: message.startsWith("DUPLICATE_RULE_BLOCK") ? "A duplicate rule blocked the new lead" : message.slice(0, 200) };
    }
}

// The bot call ended (answered or not): its activity, mapping, tasks, stop list and retries.
// Runs once per call.
export async function processVoiceBotCall(tenantId: string, callId: string) {
    const call = await queryOneAsSystem<CallRow>(
        `update "VoiceBotCall" set "processedAt" = now(), "updatedAt" = now()
         where "tenantId" = $1 and id = $2 and "processedAt" is null and status in ('IN_PROGRESS', 'COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'MACHINE')
         returning ${CALL_COLUMNS}`,
        [tenantId, callId],
    );
    if (!call) return null;
    try {
        return await processClaimedCall(call);
    } catch (error) {
        await executeAsSystem(`update "VoiceBotCall" set error = $2, "updatedAt" = now() where id = $1`, [call.id, `After-call processing failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300)]);
        throw error;
    }
}

async function processClaimedCall(claimed: CallRow) {
    let call = claimed;
    const tenantId = call.tenantId;
    const loaded = await loadVoiceBotForSession(tenantId, call.botId);
    const botRow = loaded?.bot ?? (await queryOneAsSystem<any>(`select id, name, "activityTypeId", config from "VoiceBot" where id = $1`, [call.botId]));
    const bot = { id: botRow.id, name: botRow.name, activityTypeId: botRow.activityTypeId as string | null, config: botRow.config as VoiceBotConfig };
    const fields = loaded?.fields ?? [];
    const session = call.sessionId ? await queryOneAsSystem<any>(`select status, outcome, transcript, events, fields, "durationSeconds" from "VoiceBotSession" where id = $1`, [call.sessionId]) : null;
    const answered = !!call.answeredAt && call.status !== "MACHINE";
    const finalStatus = answered ? "COMPLETED" : call.status === "IN_PROGRESS" ? "COMPLETED" : call.status;
    if (finalStatus !== call.status) await executeAsSystem(`update "VoiceBotCall" set status = $2 where id = $1`, [call.id, finalStatus]);
    const timeZone = await getTenantTimeZone(tenantId);
    const events: Array<{ type: string; detail: any }> = Array.isArray(session?.events) ? session.events : [];
    const transcript: Array<{ role: string; text: string }> = Array.isArray(session?.transcript) ? session.transcript : [];
    const liveFields: Record<string, unknown> = session?.fields && typeof session.fields === "object" ? session.fields : {};
    const callbackEvent = [...events].reverse().find((event) => event.type === "callback_booked");
    const results: Record<string, unknown> = {};

    // Summary and fields (decision 30): Sonnet, or Groq over the budget.
    let summary: Summary | null = null;
    if (answered && transcript.length) {
        summary = await summarise(tenantId, bot.id, {
            transcript, liveFields, timeZone, callbackWhen: callbackEvent?.detail?.when ?? null, brief: botBrief(bot.config),
            fields: fields.map((field) => ({ key: field.key, label: field.label, type: field.type, options: field.options })),
        });
    }
    const allowed = new Set(fields.map((field) => field.key));
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries({ ...(summary?.fields ?? {}), ...liveFields })) if (allowed.has(key) && !isEmpty(value)) merged[key] = value;
    const outcome = answered ? (session?.outcome && session.outcome !== "other" ? session.outcome : summary?.outcome ?? session?.outcome ?? "other") : finalStatus;
    const transferStatus = call.transfer?.status ?? null;

    // An incoming call from a number with no lead (decision 34): a new lead, owned per the
    // workspace's assignment rules, and the call's activity, answers and task go on it.
    if (call.trigger === "INBOUND" && !call.leadId && !call.opportunityId && outcome !== "wrong_number") {
        const created = await createInboundLead(tenantId, bot, call, summary?.callerName ?? null);
        if (created.leadId) call = { ...call, leadId: created.leadId };
        results.inboundLead = created;
    }
    const owner = call.leadId ? (await queryOneAsSystem<{ ownerId: string | null }>(`select "ownerId" from "Lead" where id = $1`, [call.leadId]))?.ownerId ?? null : null;
    const actor = await loadActor(tenantId, [owner, call.startedBy]);

    // The bot's own activity on the record (decisions 10, 19), not for a test call to your own phone.
    let activityId: string | null = null;
    if (actor && bot.activityTypeId && (call.leadId || call.opportunityId)) {
        const { createActivityForTenant } = await import("@/lib/server/crm");
        const attempts = bot.config.retries.attempts;
        const notes = [
            answered ? (summary?.summary || "The call was answered; no summary could be written.") : `${OUTCOME_LABELS[finalStatus] ?? finalStatus} (attempt ${call.attempt} of ${attempts}).`,
            transferStatus === "CONNECTED" ? `Handed over to ${call.transfer.connectedTo}.` : transferStatus === "NO_ANSWER" || transferStatus === "NO_ONE" ? "A hand-over was asked for, but nobody answered: a callback task was created." : null,
            callbackEvent ? `Callback asked for: ${callbackEvent.detail?.when ?? "soon"}.` : null,
            call.durationSeconds ? `Duration: ${call.durationSeconds}s.` : null,
        ].filter(Boolean).join("\n");
        const activity = await createActivityForTenant(actor as any, {
            typeId: bot.activityTypeId, leadId: call.leadId, opportunityId: call.opportunityId,
            outcome: OUTCOME_LABELS[outcome] ?? outcome, notes, customFields: merged,
        }, { system: true });
        activityId = activity.id;
        await executeAsSystem(`update "Activity" set "completedAt" = now(), "slaStatus" = 'MET' where id = $1`, [activityId]).catch(() => undefined);
    }
    if (call.callLogId) {
        await executeAsSystem(`update "TelephonyCallLog" set "activityId" = coalesce($2, "activityId"), transcript = $3, metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb where id = $1`,
            [call.callLogId, activityId, transcript.length ? transcriptText(transcript) : null, JSON.stringify({ voiceBotOutcome: outcome, voiceBotSummary: summary?.summary ?? null })]);
    }

    // Copy answers to the record (decision 11).
    if (answered && actor && Object.keys(merged).length && bot.config.mappings.length) results.mapping = await applyMappings(actor, bot, call, merged);

    // A callback the caller asked for, or a hand-over nobody picked up: a task for the owner.
    const needsCallback = !!callbackEvent || transferStatus === "NO_ANSWER" || transferStatus === "NO_ONE" || events.some((event) => event.type === "transfer_failed");
    if (needsCallback && actor && (call.leadId || call.opportunityId)) {
        const { createTaskForTenant } = await import("@/lib/server/tasks");
        const parsed = summary?.callbackAt ? new Date(summary.callbackAt) : null;
        const dueAt = parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now() ? parsed : new Date(Date.now() + 30 * 60_000);
        const task = await createTaskForTenant(actor as any, {
            title: callbackEvent ? `Call back (asked the voice bot): ${callbackEvent.detail?.when ?? "soon"}` : "Call back: the caller wanted to talk to someone",
            description: summary?.summary ?? undefined,
            priority: callbackEvent ? "MEDIUM" : "HIGH",
            ownerId: owner ?? actor.id, leadId: call.leadId, opportunityId: call.opportunityId, dueAt: dueAt.toISOString(),
            metadata: { source: "VOICE_BOT", voiceBotId: bot.id, voiceBotCallId: call.id },
        } as any).catch(() => null);
        if (task) results.taskId = (task as any).id;
    }

    // "Don't call me" (decision 21).
    if (events.some((event) => event.type === "stop_bot_calls") || outcome === "do_not_call") {
        await executeAsSystem(
            `insert into "VoiceBotStopList" (id, "tenantId", "phoneDigits", phone, "botId", "voiceBotCallId") values ($1, $2, $3, $4, $5, $6) on conflict ("tenantId", "phoneDigits") do nothing`,
            [randomUUID(), tenantId, digitsOf(call.phone), call.phone, bot.id, call.id],
        );
        await executeAsSystem(`update "VoiceBotCall" set status = 'CANCELLED', "blockedReason" = 'STOP_LIST', "updatedAt" = now() where "tenantId" = $1 and right(phone, 10) = $2 and status = 'QUEUED'`, [tenantId, digitsOf(call.phone)]);
        results.stopListed = true;
    }

    // Retries (decision 12): not answered, busy or a machine, within the bot's calling hours.
    if (!answered && UNANSWERED.has(finalStatus) && call.trigger !== "TEST_PHONE" && call.attempt < bot.config.retries.attempts) {
        const gap = bot.config.retries.gapsMinutes[call.attempt - 1] ?? 1440;
        const when = nextCallingTime(bot.config.calling, await holidaySet(tenantId), timeZone, new Date(Date.now() + gap * 60_000));
        if (when) {
            const retryId = randomUUID();
            await executeAsSystem(
                `insert into "VoiceBotCall" (id, "tenantId", "botId", "firstAttemptId", attempt, trigger, priority, status, "notBefore", "leadId", "opportunityId", phone, "startedBy")
                 values ($1, $2, $3, $4, $5, $6, $7, 'QUEUED', $8, $9, $10, $11, $12)`,
                [retryId, tenantId, bot.id, call.firstAttemptId ?? call.id, call.attempt + 1, call.trigger, PRIORITY.RETRY, when.toISOString(), call.leadId, call.opportunityId, call.phone, call.startedBy],
            );
            results.retry = { id: retryId, at: when.toISOString() };
        }
    }

    await executeAsSystem(
        `update "VoiceBotCall" set outcome = $2, summary = $3, fields = $4, results = $5, "activityId" = $6, review = $7, "updatedAt" = now() where id = $1`,
        [call.id, outcome, summary?.summary ?? null, JSON.stringify(merged), JSON.stringify(results), activityId, summary?.review ? JSON.stringify(summary.review) : null],
    );
    // The last attempt: an automation waiting on the call carries on, a campaign member is done.
    if (!results.retry) await callChainEnded(tenantId, call.id, { status: finalStatus, outcome, blockedReason: null, stopListed: !!results.stopListed });
    return { outcome, activityId, results };
}

// ---- Lists for the builder -------------------------------------------------------------------------------
export async function listVoiceBotCalls(user: TenantUser, botId: string, options: { limit?: number; toListen?: boolean } = {}) {
    const tenantId = requireTenantId(user);
    return query<any>(
        `select c.id, c.trigger, c.attempt, c.status, c."blockedReason", c."notBefore", c.phone, c."leadId", c."opportunityId", c."dialedAt", c."answeredAt", c."endedAt",
                c."durationSeconds", c.outcome, c.summary, c."createdAt", c.review, l.name as "leadName"
         from "VoiceBotCall" c left join "Lead" l on l.id = c."leadId"
         where c."tenantId" = $1 and c."botId" = $2 ${options.toListen ? `and c.review ->> 'listen' = 'true'` : ""} order by c."createdAt" desc limit $3`,
        [tenantId, botId, Math.min(200, Math.max(1, options.limit ?? 50))],
    ).then((rows) => rows.map((row) => ({
        ...row,
        blockedReason: row.blockedReason ? BLOCK_MESSAGES[row.blockedReason] ?? row.blockedReason : null,
        outcomeLabel: row.outcome ? OUTCOME_LABELS[row.outcome] ?? row.outcome : null,
    })));
}

export async function getVoiceBotCallDetail(user: TenantUser, botId: string, callId: string) {
    const tenantId = requireTenantId(user);
    const row = await queryOne<any>(
        `select c.*, l.name as "leadName", s.transcript, s.events, s.turns from "VoiceBotCall" c
         left join "Lead" l on l.id = c."leadId" left join "VoiceBotSession" s on s.id = c."sessionId"
         where c."tenantId" = $1 and c."botId" = $2 and c.id = $3`,
        [tenantId, botId, callId],
    );
    if (!row) throw new Error("VOICE_BOT_CALL_NOT_FOUND");
    const labels = new Map((await query<{ key: string; label: string }>(
        `select fd.key, fd.label from "FieldDefinition" fd join "VoiceBot" b on b."activityTypeId" = fd."entityTypeId" where b.id = $1 and fd."tenantId" = $2`, [botId, tenantId],
    )).map((field) => [field.key, field.label]));
    const { transfer, results, ...rest } = row;
    return {
        ...rest,
        blockedReason: row.blockedReason ? BLOCK_MESSAGES[row.blockedReason] ?? row.blockedReason : null,
        outcomeLabel: row.outcome ? OUTCOME_LABELS[row.outcome] ?? row.outcome : null,
        fields: Object.entries(row.fields ?? {}).map(([key, value]) => ({ key, label: labels.get(key) ?? key, value })),
        transfer: transfer ? { status: transfer.status, connectedTo: transfer.connectedTo ?? null, people: (transfer.targets ?? []).length } : null,
        results: results ?? {},
    };
}

export async function cancelVoiceBotCall(user: TenantUser, botId: string, callId: string) {
    const tenantId = requireTenantId(user);
    const row = await queryOne<{ id: string }>(`update "VoiceBotCall" set status = 'CANCELLED', "updatedAt" = now() where "tenantId" = $1 and "botId" = $2 and id = $3 and status = 'QUEUED' returning id`, [tenantId, botId, callId]);
    if (!row) throw new Error("VOICE_BOT_CALL_NOT_CANCELLABLE");
    await callChainEnded(tenantId, callId, { status: "CANCELLED", outcome: "CANCELLED", blockedReason: null });
}


// ---- Incoming calls (wave F; decisions 4, 23, 35) ------------------------------------------------------
// Who answers a Plivo number: a bot when its mode is Bot, or Owner then bot (decision 23).
export async function inboundBotForNumber(tenantId: string, config: PlivoConfig, dialled: string | null) {
    const number = normalizePhone(dialled, plivoCountryCode(config));
    if (!number) return null;
    if (!(await voiceBotsOnFor(tenantId))) return null;
    const row = await queryOneAsSystem<{ mode: "BOT" | "OWNER_THEN_BOT"; botId: string; config: VoiceBotConfig }>(
        `select n.mode, n."botId", b.config from "VoiceBotNumber" n join "VoiceBot" b on b.id = n."botId"
         where n."tenantId" = $1 and n.number = $2 and n.mode in ('BOT', 'OWNER_THEN_BOT') and b.status = 'LIVE' and b."archivedAt" is null`,
        [tenantId, number],
    );
    if (!row) return null;
    // Decision 35: "working hours" for Owner then bot are the bot's own calling hours.
    const timeZone = await getTenantTimeZone(tenantId);
    const now = new Date();
    const window = nextCallingTime(row.config.calling, await holidaySet(tenantId), timeZone, now);
    const inHours = !!window && window.getTime() <= now.getTime() + 30_000;
    return { mode: row.mode, botId: row.botId, botAnswersFirst: row.mode === "BOT" || !inHours };
}

// The bot answers an incoming call (Bot mode, after hours, or after nobody picked up). The bot
// call's ID is Plivo's own call UUID, so the call's later callbacks find it. Null when the bot
// can't take it (two calls already running, or the bot isn't ready): people's routing then
// carries on as before.
export async function startInboundBotCall(tenantId: string, config: PlivoConfig, form: URLSearchParams, botId: string, route: { leadId: string | null; agentId: string | null }) {
    const callUuid = String(form.get("CallUUID") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(callUuid)) return null;
    const active = Number((await queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "VoiceBotCall" where "tenantId" = $1 and status = any($2)`, [tenantId, ACTIVE]))?.count ?? 0);
    if (active >= MAX_ACTIVE_CALLS_PER_WORKSPACE) return null;
    const countryCode = plivoCountryCode(config);
    const caller = normalizePhone(form.get("From"), countryCode) ?? String(form.get("From") ?? "");
    const ours = normalizePhone(form.get("To"), countryCode);
    const inserted = await queryOneAsSystem<{ id: string }>(
        `insert into "VoiceBotCall" (id, "tenantId", "botId", "firstAttemptId", attempt, trigger, priority, status, phone, "fromNumber", "leadId", "plivoCallUuid", "dialedAt", "answeredAt")
         values ($1, $2, $3, $1, 1, 'INBOUND', 0, 'IN_PROGRESS', $4, $5, $6, $1, now(), now()) on conflict (id) do nothing returning id`,
        [callUuid, tenantId, botId, caller, ours, route.leadId],
    );
    if (!inserted) return null;
    const owner = route.leadId ? (await queryOneAsSystem<{ ownerId: string | null }>(`select "ownerId" from "Lead" where id = $1`, [route.leadId]))?.ownerId ?? null : null;
    const actor = await loadActor(tenantId, [owner, route.agentId]);
    let session: Awaited<ReturnType<typeof createCallSession>> | null = null;
    try {
        session = actor ? await createCallSession(actor, botId, { leadId: route.leadId }, callUuid, 60) : null;
    } catch {
        session = null;
    }
    const streamUrl = session ? await issueCallStreamUrl(session.sessionId) : null;
    if (!session || !streamUrl) {
        await executeAsSystem(`delete from "VoiceBotCall" where id = $1 and "tenantId" = $2`, [callUuid, tenantId]);
        return null;
    }
    const bot = await queryOneAsSystem<{ name: string; config: VoiceBotConfig }>(`select name, config from "VoiceBot" where id = $1`, [botId]);
    await executeAsSystem(`update "VoiceBotCall" set "sessionId" = $2, "updatedAt" = now() where id = $1`, [callUuid, session.sessionId]);
    // The call log: the bot's activity replaces the generic Call activity, as on outbound calls.
    await syncPlivoEvent(tenantId, form, "answer", callUuid, {
        config, route: { leadId: route.leadId, agentId: route.agentId, target: null }, status: "answered",
        metadata: { voiceBotCallId: callUuid, voiceBotId: botId, voiceBotName: bot?.name ?? null, voiceBotKeepAudio: bot?.config.keepAudio === true, trigger: "INBOUND", answeredAt: new Date().toISOString() },
    }).catch(() => undefined);
    const callLog = await queryOneAsSystem<{ id: string }>(`select id from "TelephonyCallLog" where "tenantId" = $1 and provider = 'plivo' and "callId" = $2`, [tenantId, callUuid]);
    if (callLog) await executeAsSystem(`update "VoiceBotCall" set "callLogId" = $2 where id = $1`, [callUuid, callLog.id]);
    const keepAudio = bot?.config.keepAudio === true;
    const maxMinutes = bot?.config.maxCallMinutes ?? 8;
    const record = keepAudio
        ? `<Record recordSession="true" maxLength="${(maxMinutes + 5) * 60}" fileFormat="mp3" callbackUrl="${escapeXml(plivoCallbackUrl(tenantId, "recording", { callId: callUuid }))}" callbackMethod="POST"/>`
        : "";
    return `${XML_HEAD}<Response>${record}<Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" streamTimeout="${maxMinutes * 60 + 120}">${escapeXml(streamUrl)}</Stream></Response>`;
}

// ---- Starting calls without a person (wave F: automations, enquiries, campaigns) ---------------------
async function recordPhoneAsSystem(tenantId: string, target: QueueTarget) {
    if (target.opportunityId) {
        const row = await queryOneAsSystem<{ id: string; leadId: string | null; phone: string | null; mergedIntoId: string | null }>(
            `select o.id, o."leadId", l.phone, l."mergedIntoId" from "Opportunity" o left join "Lead" l on l.id = o."leadId" and l."deletedAt" is null
             where o."tenantId" = $1 and o.id = $2 and o."deletedAt" is null`, [tenantId, target.opportunityId],
        );
        return row ? { leadId: row.leadId, opportunityId: row.id, phone: row.phone } : null;
    }
    if (target.leadId) {
        const row = await queryOneAsSystem<{ id: string; phone: string | null; mergedIntoId: string | null }>(
            `select id, phone, "mergedIntoId" from "Lead" where "tenantId" = $1 and id = $2 and "deletedAt" is null`, [tenantId, target.leadId],
        );
        return row && !row.mergedIntoId ? { leadId: row.id, opportunityId: null, phone: row.phone } : null;
    }
    return null;
}

// Queues one bot call for work that has no person behind it. The bot may be paused (the call
// waits); a draft or archived bot, a missing phone or a stopped number keeps it as BLOCKED, and
// whatever is waiting on it (an automation, a campaign member) is told straight away.
export async function queueVoiceBotCallAsSystem(tenantId: string, botId: string, target: QueueTarget, options: { trigger: CallTrigger; startedBy?: string | null; automationQueueId?: string | null; campaignMemberId?: string | null }) {
    const bot = await queryOneAsSystem<{ status: string; archivedAt: string | null }>(`select status, "archivedAt" from "VoiceBot" where "tenantId" = $1 and id = $2`, [tenantId, botId]);
    if (!bot) return { callId: null, reason: "BOT_ARCHIVED" };
    const plivo = await getActivePlivoConfig(tenantId).catch(() => null);
    const record = await recordPhoneAsSystem(tenantId, target);
    const phone = record?.phone ? normalizePhone(record.phone, plivoCountryCode(plivo)) : null;
    let reason: string | null = bot.archivedAt ? "BOT_ARCHIVED" : bot.status === "DRAFT" ? "BOT_NOT_LIVE" : !record ? "RECORD_GONE" : !phone ? "NO_PHONE" : null;
    if (!reason && phone) {
        if (await queryOneAsSystem(`select 1 from "VoiceBotStopList" where "tenantId" = $1 and "phoneDigits" = $2`, [tenantId, digitsOf(phone)])) reason = "STOP_LIST";
        else if (await queryOneAsSystem(`select 1 from "VoiceBotCall" where "tenantId" = $1 and "botId" = $2 and right(phone, 10) = $3 and status in ('QUEUED', 'DIALING', 'IN_PROGRESS')`, [tenantId, botId, digitsOf(phone)])) reason = "ALREADY_QUEUED";
    }
    const id = randomUUID();
    await executeAsSystem(
        `insert into "VoiceBotCall" (id, "tenantId", "botId", "firstAttemptId", attempt, trigger, priority, status, "blockedReason", "leadId", "opportunityId", phone, "startedBy", "automationQueueId", "campaignMemberId")
         values ($1, $2, $3, $1, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, tenantId, botId, options.trigger, PRIORITY[options.trigger], reason ? "BLOCKED" : "QUEUED", reason, record?.leadId ?? target.leadId ?? null, record?.opportunityId ?? target.opportunityId ?? null,
            phone ?? "", options.startedBy ?? null, options.automationQueueId ?? null, options.campaignMemberId ?? null],
    );
    if (reason) await callChainEnded(tenantId, id, { status: "BLOCKED", outcome: "BLOCKED", blockedReason: reason });
    return { callId: id, reason };
}

// A call and its retries are over: an automation step waiting for it carries on (its next steps
// can branch on voiceBotCall.outcome), and a campaign member gets its final state.
async function callChainEnded(tenantId: string, callId: string, result: { status: string; outcome: string; blockedReason: string | null; stopListed?: boolean }) {
    const links = await queryOneAsSystem<{ firstId: string; automationQueueId: string | null; campaignMemberId: string | null; botId: string }>(
        `select f.id as "firstId", f."automationQueueId", f."campaignMemberId", f."botId" from "VoiceBotCall" c join "VoiceBotCall" f on f.id = coalesce(c."firstAttemptId", c.id)
         where c."tenantId" = $1 and c.id = $2`, [tenantId, callId],
    );
    if (!links) return;
    if (links.automationQueueId) {
        const value = { voiceBotCall: { id: callId, botId: links.botId, status: result.status, outcome: result.outcome, blockedReason: result.blockedReason } };
        await executeAsSystem(
            `update "AutomationQueue" set "runAt" = now(), record = coalesce(record, '{}'::jsonb) || $3::jsonb, "updatedAt" = now() where id = $1 and "tenantId" = $2 and status = 'PENDING'`,
            [links.automationQueueId, tenantId, JSON.stringify(value)],
        );
    }
    if (links.campaignMemberId) {
        const doNotCall = result.stopListed || result.outcome === "do_not_call" || ["STOP_LIST", "SUPPRESSED", "OPTED_OUT"].includes(result.blockedReason ?? "");
        const status = doNotCall ? "DO_NOT_CALL" : result.status === "COMPLETED" ? "COMPLETED" : "EXHAUSTED";
        await executeAsSystem(`update "CallCampaignMember" set status = $3, "updatedAt" = now() where id = $1 and "tenantId" = $2`, [links.campaignMemberId, tenantId, status]);
    }
}

// New enquiries (plan §5): a lead from one of a live bot's chosen sources is called within about a
// minute, before other queued calls (priority 1). One bot per lead: the first by name.
export async function queueEnquiryVoiceBotCall(tenantId: string, lead: { id: string; source?: unknown }) {
    const source = typeof lead.source === "string" ? lead.source.trim().toLowerCase() : "";
    if (!source || source === "voice bot (inbound)") return null;
    if (!(await voiceBotsOnFor(tenantId))) return null;
    const bot = await queryOneAsSystem<{ id: string }>(
        `select id from "VoiceBot" where "tenantId" = $1 and status = 'LIVE' and "archivedAt" is null
           and coalesce((config -> 'enquiryCalls' ->> 'enabled')::boolean, false)
           and exists (select 1 from jsonb_array_elements_text(coalesce(config -> 'enquiryCalls' -> 'sources', '[]'::jsonb)) as item where lower(trim(item)) = $2)
         order by lower(name) limit 1`,
        [tenantId, source],
    );
    if (!bot) return null;
    return queueVoiceBotCallAsSystem(tenantId, bot.id, { leadId: lead.id }, { trigger: "ENQUIRY" });
}

// Call campaigns dialled by a bot: pending members become bot calls, a batch at a time so the
// queue stays short (the bot's daily limit and calling hours still apply at dial time). The
// bot's own retry policy applies; the campaign's is for people.
const CAMPAIGN_BATCH = 20;
async function feedBotCampaigns(tenantId?: string) {
    const campaigns = await queryAsSystem<{ id: string; tenantId: string; voiceBotId: string; createdBy: string | null; module: string }>(
        `select c.id, c."tenantId", c."voiceBotId", c."createdBy", c.module from "CallCampaign" c join "VoiceBot" b on b.id = c."voiceBotId"
         where c.status = 'ACTIVE' and c."dialledBy" = 'BOT' and b.status = 'LIVE' and b."archivedAt" is null ${tenantId ? `and c."tenantId" = $1` : ""}`,
        tenantId ? [tenantId] : [],
    );
    for (const campaign of campaigns) {
        if (!(await voiceBotsOnFor(campaign.tenantId))) continue;
        const waiting = Number((await queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "CallCampaignMember" where "campaignId" = $1 and status = 'QUEUED'`, [campaign.id]))?.count ?? 0);
        if (waiting >= CAMPAIGN_BATCH) continue;
        const members = await queryAsSystem<{ id: string; leadId: string | null; opportunityId: string | null }>(
            `update "CallCampaignMember" set status = 'QUEUED', attempts = attempts + 1, "lastAttemptAt" = now(), "updatedAt" = now()
             where id in (select id from "CallCampaignMember" where "campaignId" = $1 and status = 'PENDING' and coalesce("nextEligibleAt", now()) <= now()
                          order by "createdAt" limit $2 for update skip locked)
             returning id, "leadId", "opportunityId"`,
            [campaign.id, CAMPAIGN_BATCH - waiting],
        );
        for (const member of members) {
            await queueVoiceBotCallAsSystem(campaign.tenantId, campaign.voiceBotId, { leadId: member.leadId, opportunityId: member.opportunityId }, {
                trigger: "CAMPAIGN", startedBy: campaign.createdBy, campaignMemberId: member.id,
            });
        }
    }
}

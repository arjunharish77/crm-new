import { query } from "@/lib/db/query";
import { getTenantTimeZone } from "@/lib/server/date-format";
import { requireTenantId } from "@/lib/server/tenant-guard";
import { andWhere, dateRangeWhere, type ReportFilters } from "@/lib/server/report-scope";
import { OUTCOME_LABELS } from "@/lib/server/voice-bot-calls";
import { getVoiceProviderSettings, meterName, usageMeters } from "@/lib/server/voice-providers";

// Voice bot dashboard and reports (voice bot plan wave G): calls and results per bot, reply times
// per AI as callers heard them, use of each free limit, Claude spend, and the calls the quality
// review says a person should listen to. Calls to your own phone ("Call my phone") aren't counted.

type TenantUser = { id: string; tenantId: string | null };
type Range = { sql: string; values: unknown[] } | null;

export const DASHBOARD_DAYS = [7, 30, 90] as const;

const num = (value: unknown) => Number(value ?? 0) || 0;
const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// One row per bot (archived bots only when they had calls in the range).
async function perBot(tenantId: string, range: Range, botId: string | null) {
    const values: unknown[] = [tenantId];
    const callRange = andWhere(values, range);
    let botWhere = "";
    if (botId) {
        values.push(botId);
        botWhere = ` and b.id = $${values.length}`;
    }
    const rows = await query<any>(
        `select b.id as "botId", b.name as "botName", b.status, b."archivedAt",
                count(c.id) filter (where c."dialedAt" is not null and c.trigger <> 'INBOUND')::int as placed,
                count(c.id) filter (where c."answeredAt" is not null and c.status <> 'MACHINE' and c.trigger <> 'INBOUND')::int as answered,
                count(c.id) filter (where c.trigger = 'INBOUND')::int as inbound,
                count(c.id) filter (where c.status = 'BLOCKED')::int as "notCalled",
                coalesce(sum(c."durationSeconds") filter (where c."answeredAt" is not null and c.status <> 'MACHINE'), 0)::int as "talkSeconds",
                count(c.id) filter (where c."answeredAt" is not null and c.status <> 'MACHINE')::int as conversations,
                count(c.id) filter (where c.outcome = 'interested')::int as interested,
                count(c.id) filter (where c.outcome = 'callback')::int as callbacks,
                count(c.id) filter (where c.transfer ->> 'status' = 'CONNECTED')::int as transferred,
                count(c.id) filter (where c.review ->> 'listen' = 'true')::int as "toListen",
                round(avg((c.review ->> 'score')::numeric), 1)::float as "averageScore"
         from "VoiceBot" b
         left join "VoiceBotCall" c on c."botId" = b.id and c.trigger <> 'TEST_PHONE'${callRange.replaceAll('"createdAt"', 'c."createdAt"')}
         where b."tenantId" = $1${botWhere}
         group by b.id
         having b."archivedAt" is null or count(c.id) > 0
         order by lower(b.name)`,
        values,
    );
    return rows.map((row) => ({
        botId: row.botId as string,
        botName: row.botName as string,
        status: row.status as string,
        archived: !!row.archivedAt,
        placed: num(row.placed),
        answered: num(row.answered),
        answerRate: rate(num(row.answered), num(row.placed)),
        inbound: num(row.inbound),
        notCalled: num(row.notCalled),
        averageSeconds: num(row.conversations) ? Math.round(num(row.talkSeconds) / num(row.conversations)) : 0,
        talkMinutes: Math.round(num(row.talkSeconds) / 6) / 10,
        interested: num(row.interested),
        callbacks: num(row.callbacks),
        transferred: num(row.transferred),
        toListen: num(row.toListen),
        averageScore: row.averageScore === null ? null : Number(row.averageScore),
    }));
}

function totalsOf(bots: Awaited<ReturnType<typeof perBot>>) {
    const sum = (key: "placed" | "answered" | "inbound" | "notCalled" | "interested" | "callbacks" | "transferred" | "toListen") => bots.reduce((total, bot) => total + bot[key], 0);
    const answered = sum("answered");
    const placed = sum("placed");
    const conversations = answered + sum("inbound");
    const talkSeconds = bots.reduce((total, bot) => total + bot.talkMinutes * 60, 0);
    return {
        placed, answered, answerRate: rate(answered, placed), inbound: sum("inbound"), notCalled: sum("notCalled"),
        interested: sum("interested"), callbacks: sum("callbacks"), transferred: sum("transferred"), toListen: sum("toListen"),
        talkMinutes: Math.round(talkSeconds / 6) / 10, conversations,
    };
}

// The dashboard: the last 7, 30 or 90 days, for every bot or one.
export async function voiceBotDashboard(user: TenantUser, input: { days?: number; botId?: string | null }) {
    const tenantId = requireTenantId(user);
    const days = (DASHBOARD_DAYS as readonly number[]).includes(Number(input.days)) ? Number(input.days) : 30;
    const botId = input.botId || null;
    const timeZone = await getTenantTimeZone(tenantId);
    const since = new Date(Date.now() - days * 86_400_000);
    const range: Range = { sql: `"createdAt" >= $1`, values: [since.toISOString()] };
    const bots = await perBot(tenantId, range, botId);

    const values: unknown[] = [tenantId, since.toISOString()];
    let botClause = "";
    if (botId) {
        values.push(botId);
        botClause = ` and "botId" = $${values.length}`;
    }
    const [outcomes, daily, replies, toListen, spend, settings, usage] = await Promise.all([
        query<{ outcome: string; count: number }>(
            `select outcome, count(*)::int as count from "VoiceBotCall"
             where "tenantId" = $1 and "createdAt" >= $2 and trigger <> 'TEST_PHONE' and outcome is not null and status <> 'BLOCKED'${botClause}
             group by outcome order by count(*) desc, outcome`,
            values,
        ),
        query<{ day: string; placed: number; answered: number; inbound: number }>(
            `select to_char(("createdAt" at time zone $${values.length + 1})::date, 'YYYY-MM-DD') as day,
                    count(*) filter (where "dialedAt" is not null and trigger <> 'INBOUND')::int as placed,
                    count(*) filter (where "answeredAt" is not null and status <> 'MACHINE' and trigger <> 'INBOUND')::int as answered,
                    count(*) filter (where trigger = 'INBOUND')::int as inbound
             from "VoiceBotCall" where "tenantId" = $1 and "createdAt" >= $2 and trigger <> 'TEST_PHONE'${botClause}
             group by 1 order by 1`,
            [...values, timeZone],
        ),
        // Old calls only have first-sound timing. New calls measure answer audio separately,
        // so a quick filler cannot make a slow answer look fast.
        query<any>(
            `select coalesce(t ->> 'ai', 'Unknown') as ai, count(*)::int as turns,
                    count(*) filter (where t ->> 'answerMs' is not null)::int as "answerTurns",
                    percentile_cont(0.5) within group (order by (t ->> 'answerMs')::numeric) as median,
                    percentile_cont(0.9) within group (order by (t ->> 'answerMs')::numeric) as p90,
                    max((t ->> 'answerMs')::numeric) as slowest,
                    percentile_cont(0.5) within group (order by (t ->> 'replyMs')::numeric) as "firstSoundMs",
                    percentile_cont(0.5) within group (order by (t ->> 'sttMs')::numeric) as "sttMs",
                    percentile_cont(0.5) within group (order by (t ->> 'llmMs')::numeric) as "llmMs",
                    percentile_cont(0.5) within group (order by (t ->> 'ttsMs')::numeric) as "ttsMs"
             from "VoiceBotSession" s
             cross join lateral jsonb_array_elements(case when jsonb_typeof(s.turns) = 'array' then s.turns else '[]'::jsonb end) as t
             where s."tenantId" = $1 and s."createdAt" >= $2 and s.kind = 'CALL' and (t ->> 'replyMs') is not null${botClause.replace('"botId"', 's."botId"')}
             group by 1 order by count(*) desc`,
            values,
        ),
        query<any>(
            `select c.id, c."botId", b.name as "botName", c.phone, l.name as "leadName", c.review, c."createdAt", c.outcome
             from "VoiceBotCall" c join "VoiceBot" b on b.id = c."botId" left join "Lead" l on l.id = c."leadId"
             where c."tenantId" = $1 and c."createdAt" >= $2 and c.review ->> 'listen' = 'true'${botClause.replace('"botId"', 'c."botId"')}
             order by c."createdAt" desc limit 10`,
            values,
        ),
        query<{ botId: string | null; costMicroUsd: string }>(
            `select "botId", sum("costMicroUsd") as "costMicroUsd" from "VoiceProviderUsage" where "tenantId" = $1 and provider = 'claude' and month = $2 group by "botId"`,
            [tenantId, new Date().toISOString().slice(0, 7)],
        ),
        getVoiceProviderSettings(tenantId),
        usageMeters(tenantId),
    ]);

    // Dollars to 4 places: a call's summary costs well under a cent.
    const spendByBot = new Map(spend.map((row) => [row.botId ?? "", Math.round(num(row.costMicroUsd) / 100) / 10_000]));
    const byDay = new Map(daily.map((row) => [row.day, row]));
    const series: Array<{ day: string; placed: number; answered: number; inbound: number }> = [];
    for (let offset = days - 1; offset >= 0; offset--) {
        const day = new Date(Date.now() - offset * 86_400_000).toLocaleDateString("en-CA", { timeZone });
        const row = byDay.get(day);
        series.push({ day, placed: num(row?.placed), answered: num(row?.answered), inbound: num(row?.inbound) });
    }
    const round = (value: unknown) => (value === null || value === undefined ? null : Math.round(Number(value)));
    return {
        days,
        botId,
        totals: totalsOf(bots),
        bots: bots.map((bot) => ({ ...bot, claudeSpendUsd: spendByBot.get(bot.botId) ?? 0 })),
        outcomes: outcomes.map((row) => ({ outcome: row.outcome, label: OUTCOME_LABELS[row.outcome] ?? row.outcome, count: num(row.count) })),
        daily: series,
        replyTimes: replies.map((row) => ({
            ai: row.ai as string, turns: num(row.turns), answerTurns: num(row.answerTurns), medianMs: round(row.median), p90Ms: round(row.p90), slowestMs: round(row.slowest), firstSoundMs: round(row.firstSoundMs),
            sttMs: round(row.sttMs), llmMs: round(row.llmMs), ttsMs: round(row.ttsMs),
        })),
        toListen: toListen.map((row) => ({
            id: row.id as string, botId: row.botId as string, botName: row.botName as string, name: (row.leadName as string | null) ?? (row.phone as string),
            score: num(row.review?.score), reason: String(row.review?.reason ?? ""), issues: Array.isArray(row.review?.issues) ? row.review.issues.map(String) : [],
            outcomeLabel: row.outcome ? OUTCOME_LABELS[row.outcome] ?? row.outcome : null, createdAt: row.createdAt,
        })),
        claude: {
            month: settings.claude.month, spentUsd: settings.claude.spentThisMonthUsd, capUsd: settings.claude.monthlyCapUsd,
            unassignedUsd: spendByBot.get("") ?? 0,
        },
        usage: { day: usage.day, month: usage.month, meters: usage.meters.map((meter) => ({ ...meter, name: meterName(meter.meter) })) },
    };
}

// "Voice Bot Performance" in Reports: one row per bot for the chosen dates.
export async function voiceBotPerformanceReport(user: TenantUser & { isPlatformAdmin?: boolean }, filters: ReportFilters) {
    const tenantId = requireTenantId(user);
    const range = await dateRangeWhere(user as any, filters, '"createdAt"');
    const bots = await perBot(tenantId, range, null);
    return {
        reportKey: "voice_bot_performance" as const,
        generatedAt: new Date().toISOString(),
        totals: totalsOf(bots),
        rows: bots.map((bot) => ({
            bot: bot.botName + (bot.archived ? " (archived)" : ""),
            callsPlaced: bot.placed,
            answered: bot.answered,
            answerRatePercent: bot.answerRate,
            incoming: bot.inbound,
            notCalled: bot.notCalled,
            averageCallSeconds: bot.averageSeconds,
            interested: bot.interested,
            callbacks: bot.callbacks,
            handedOver: bot.transferred,
            averageQuality: bot.averageScore,
            toListen: bot.toListen,
        })),
    };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Headphones } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { SelectField } from "@/components/voice-bots/builder/select-field";
import { SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/bulk-selection";

// The voice bot dashboard (voice bot plan wave G): for every bot (Voice bots › Overview) or one
// (the bot's Results tab). Calls and what came of them, reply times per AI as callers heard them,
// the free limits and the Claude budget, and the calls the quality review says to listen to.

type Meter = {
    meter: string; name: string; period: "day" | "month"; percent: number;
    used: { requests: number; tokens: number; audioSeconds: number; characters: number };
    limit: { requests?: number; tokens?: number; audioSeconds?: number; characters?: number };
};
type Dashboard = {
    days: number;
    totals: { placed: number; answered: number; answerRate: number; inbound: number; notCalled: number; interested: number; callbacks: number; transferred: number; toListen: number; talkMinutes: number; conversations: number };
    bots: Array<{ botId: string; botName: string; archived: boolean; placed: number; answered: number; answerRate: number; inbound: number; interested: number; callbacks: number; transferred: number; averageSeconds: number; averageScore: number | null; toListen: number; claudeSpendUsd: number }>;
    outcomes: Array<{ outcome: string; label: string; count: number }>;
    daily: Array<{ day: string; placed: number; answered: number; inbound: number }>;
    replyTimes: Array<{ ai: string; turns: number; medianMs: number | null; p90Ms: number | null; slowestMs: number | null; sttMs: number | null; llmMs: number | null; ttsMs: number | null }>;
    toListen: Array<{ id: string; botId: string; botName: string; name: string; score: number; reason: string; issues: string[]; outcomeLabel: string | null; createdAt: string }>;
    claude: { month: string; spentUsd: number; capUsd: number; unassignedUsd: number };
    usage: { day: string; month: string; meters: Meter[] };
};

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);
const clock = (total: number) => `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}`;
const usd = (value: number) => (value > 0 && value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`);

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="min-w-0 rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

function UsageBar({ label, detail, percent }: { label: string; detail: string; percent: number }) {
    const width = Math.min(100, Math.max(0, percent));
    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} aria-valuetext={`${Math.round(percent)}% used`}>
                <div className={cn("h-full rounded-full", percent >= 100 ? "bg-destructive" : percent >= 80 ? "bg-status-warning-foreground" : "bg-primary")} style={{ width: `${width}%` }} />
            </div>
        </div>
    );
}

function meterDetail(meter: Meter) {
    const parts: string[] = [];
    const { used, limit } = meter;
    if (limit.requests) parts.push(`${used.requests.toLocaleString()} of ${limit.requests.toLocaleString()} requests`);
    if (limit.tokens) parts.push(`${Math.round(used.tokens / 1000).toLocaleString()}k of ${Math.round(limit.tokens / 1000).toLocaleString()}k tokens`);
    if (limit.audioSeconds) parts.push(`${Math.round(used.audioSeconds / 60).toLocaleString()} of ${Math.round(limit.audioSeconds / 60).toLocaleString()} audio minutes`);
    if (limit.characters) parts.push(`${used.characters.toLocaleString()} of ${limit.characters.toLocaleString()} characters`);
    return `${parts.join(" · ")} ${meter.period === "day" ? "today (UTC)" : "this month"}`;
}

function Card({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
    const id = `vb-dash-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
    return (
        <section aria-labelledby={id} className={cn("min-w-0 space-y-3 rounded-lg border bg-card p-4", className)}>
            <div className="space-y-0.5">
                <h3 id={id} className="text-sm font-semibold">{title}</h3>
                {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
            </div>
            {children}
        </section>
    );
}

export function DashboardPanel({ botId }: { botId?: string }) {
    const [days, setDays] = useState("30");
    const [data, setData] = useState<Dashboard | null>(null);
    const [failed, setFailed] = useState(false);
    const load = useCallback(async () => {
        setFailed(false);
        try {
            setData(await apiFetch<Dashboard>(`/voice-bots/dashboard?days=${days}${botId ? `&botId=${botId}` : ""}`));
        } catch {
            setFailed(true);
        }
    }, [days, botId]);
    useEffect(() => { load(); }, [load]);

    const header = (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
                <h2 className="text-base font-semibold">{botId ? "Results" : "Overview"}</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    {botId ? "This bot's calls and what came of them" : "Every bot's calls and what came of them"}, how quickly the bot replied, and how much of each free limit is used. Calls to your own phone aren&apos;t counted.
                </p>
            </div>
            <SelectField id={botId ? "bot-dashboard-period" : "dashboard-period"} label="Period" value={days} onValueChange={setDays} className="w-44">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
            </SelectField>
        </div>
    );

    if (failed && !data) return <div className="space-y-4 py-6">{header}<ErrorState description="The dashboard couldn't be loaded." onRetry={load} /></div>;
    if (!data) return <div className="space-y-4 py-6">{header}<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-60" /></div>;

    const { totals } = data;
    const noCalls = totals.placed + totals.inbound + totals.notCalled === 0;
    const callsHref = (item: { botId: string; id: string }) => `/dashboard/voice-bots/${item.botId}?tab=calls&call=${item.id}`;
    const maxOutcome = Math.max(1, ...data.outcomes.map((item) => item.count));
    const claudePercent = data.claude.capUsd > 0 ? (data.claude.spentUsd / data.claude.capUsd) * 100 : 0;
    const scored = data.bots.filter((bot) => bot.averageScore !== null);
    const averageScore = scored.length ? scored.reduce((total, bot) => total + (bot.averageScore ?? 0), 0) / scored.length : null;

    return (
        <div className="space-y-4 py-6">
            {header}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Calls placed" value={totals.placed.toLocaleString()} hint={`${totals.answered.toLocaleString()} answered · ${totals.answerRate}%`} />
                <Tile label="Incoming calls" value={totals.inbound.toLocaleString()} hint={totals.notCalled ? `${plural(totals.notCalled, "record", "records")} not called` : "Answered by a bot"} />
                <Tile label="Interested" value={totals.interested.toLocaleString()} hint={`${totals.callbacks.toLocaleString()} callbacks · ${totals.transferred.toLocaleString()} handed over`} />
                <Tile label="To listen" value={totals.toListen.toLocaleString()} hint={averageScore === null ? `${totals.talkMinutes.toLocaleString()} minutes talked` : `Quality ${averageScore.toFixed(1)}/5 · ${totals.talkMinutes.toLocaleString()} min talked`} />
            </div>

            {noCalls ? (
                <EmptyState variant="inline" title={`No calls in the last ${data.days} days`} description={botId ? "Calls appear here once the bot is live and calls are started, or once it answers a number." : "Calls appear here once a bot is live and calls are started from records, lists, automations or campaigns, or a bot answers a number."} />
            ) : (
                <>
                    <Card title="Calls per day" description="Calls placed by bots (answered or not) and incoming calls a bot answered.">
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.daily.map((row) => ({ ...row, label: row.day.slice(5), notAnswered: Math.max(0, row.placed - row.answered) }))} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" minTickGap={16} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                                    <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }} />
                                    <Bar dataKey="answered" name="Answered" stackId="out" fill="var(--chart-1)" isAnimationActive={false} />
                                    <Bar dataKey="notAnswered" name="Not answered" stackId="out" fill="var(--chart-8)" isAnimationActive={false} />
                                    <Bar dataKey="inbound" name="Incoming" fill="var(--chart-2)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {[["Answered", "var(--chart-1)"], ["Not answered", "var(--chart-8)"], ["Incoming", "var(--chart-2)"]].map(([label, color]) => (
                                <span key={label} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />{label}</span>
                            ))}
                        </div>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card title="What came of the calls">
                            {data.outcomes.length ? (
                                <ul className="space-y-2">
                                    {data.outcomes.map((item) => (
                                        <li key={item.outcome} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                                            <span className="truncate">{item.label}</span>
                                            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${(item.count / maxOutcome) * 100}%` }} /></span>
                                            <span className="tabular-nums text-muted-foreground">{item.count.toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-sm text-muted-foreground">No finished calls yet.</p>}
                        </Card>

                        <Card title="Reply time" description="From the end of the caller's speech to the bot's first sound, on phone calls. Typical is the median; 9 in 10 replies were quicker than the next column.">
                            {data.replyTimes.length ? (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>AI</TableHead>
                                                <TableHead className="text-right">Typical</TableHead>
                                                <TableHead className="text-right">9 in 10</TableHead>
                                                <TableHead className="hidden text-right sm:table-cell">Slowest</TableHead>
                                                <TableHead className="text-right">Replies</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.replyTimes.map((row) => (
                                                <TableRow key={row.ai}>
                                                    <TableCell>
                                                        <span className="block font-medium">{row.ai}</span>
                                                        <span className="block text-xs text-muted-foreground">Hearing {seconds(row.sttMs)} · thinking {seconds(row.llmMs)} · voice {seconds(row.ttsMs)}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">{seconds(row.medianMs)}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{seconds(row.p90Ms)}</TableCell>
                                                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{seconds(row.slowestMs)}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{row.turns.toLocaleString()}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : <p className="text-sm text-muted-foreground">No answered phone calls yet.</p>}
                        </Card>
                    </div>
                </>
            )}

            {!botId && data.bots.length ? (
                <Card title="By bot" description="Claude spend is this month's, whatever the period.">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-full">Bot</TableHead>
                                    <TableHead className="text-right">Placed</TableHead>
                                    <TableHead className="text-right">Answered</TableHead>
                                    <TableHead className="hidden text-right md:table-cell">Incoming</TableHead>
                                    <TableHead className="hidden text-right md:table-cell">Interested</TableHead>
                                    <TableHead className="hidden text-right lg:table-cell">Avg length</TableHead>
                                    <TableHead className="hidden text-right lg:table-cell">Quality</TableHead>
                                    <TableHead className="hidden text-right sm:table-cell">Claude</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.bots.map((bot) => (
                                    <TableRow key={bot.botId}>
                                        <TableCell className="max-w-0">
                                            <Link href={`/dashboard/voice-bots/${bot.botId}?tab=results`} className="block truncate font-medium hover:underline">{bot.botName}</Link>
                                            {bot.archived ? <span className="text-xs text-muted-foreground">Archived</span> : null}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{bot.placed.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{bot.answerRate}%</TableCell>
                                        <TableCell className="hidden text-right tabular-nums md:table-cell">{bot.inbound.toLocaleString()}</TableCell>
                                        <TableCell className="hidden text-right tabular-nums md:table-cell">{bot.interested.toLocaleString()}</TableCell>
                                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{bot.averageSeconds ? clock(bot.averageSeconds) : "—"}</TableCell>
                                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{bot.averageScore === null ? "—" : `${bot.averageScore.toFixed(1)}/5`}</TableCell>
                                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{usd(bot.claudeSpendUsd)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Free limits and budget" description="Admins are told at 80% of any free limit, and at 50%, 80%, 95% and 100% of the Claude budget.">
                    <div className="space-y-4">
                        <UsageBar label="Claude budget" detail={`${usd(data.claude.spentUsd)} of ${usd(data.claude.capUsd)} this month`} percent={claudePercent} />
                        {data.usage.meters.map((meter) => <UsageBar key={meter.meter} label={meter.name} detail={meterDetail(meter)} percent={meter.percent} />)}
                        {!data.usage.meters.some((meter) => meter.meter.startsWith("groq")) ? <p className="text-xs text-muted-foreground">Groq&apos;s daily use appears once bots have talked today.</p> : null}
                    </div>
                </Card>

                <Card title="Calls to listen to" description="The quality review after each answered call flags made-up answers, broken rules, upset or confused callers and missed hand-overs.">
                    {data.toListen.length ? (
                        <ul className="divide-y">
                            {data.toListen.map((item) => (
                                <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                                    <Link href={callsHref(item)} className="group block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        <span className="flex flex-wrap items-center gap-2 text-sm">
                                            <Headphones className="size-4 shrink-0 text-status-warning-foreground" aria-hidden />
                                            <span className="min-w-0 truncate font-medium group-hover:underline">{item.name}</span>
                                            <StatusBadge tone={item.score <= 2 ? "danger" : "warning"} label={`${item.score}/5`} />
                                            <span className="text-xs text-muted-foreground">{botId ? "" : `${item.botName} · `}{formatWorkspaceRelativeTime(item.createdAt)}</span>
                                        </span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">{item.reason || item.issues[0]}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-muted-foreground">Nothing flagged in this period.</p>}
                </Card>
            </div>
        </div>
    );
}

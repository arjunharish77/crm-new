"use client";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { ModuleGate } from "@/components/common/module-gate";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhoneCall, PhoneMissed, PhoneOutgoing, CalendarClock, Users, RefreshCw, Circle, Coffee, CircleOff, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";
import { humanizeEnum } from "@/lib/display/status";
import { useConfirm } from "@/components/common/dialogs-provider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogCallOutcomeDialog } from "@/components/telephony/log-call-outcome-dialog";

const POLL_INTERVAL_MS = 20_000;

type CallRow = {
    id: string;
    direction: string;
    status: string;
    fromNumber: string | null;
    toNumber: string | null;
    agentId: string | null;
    leadId: string | null;
    opportunityId: string | null;
    startedAt: string;
    leadName: string | null;
    opportunityTitle: string | null;
};

type CallbackRow = {
    id: string;
    callbackAt: string;
    nextAction: string | null;
    leadId: string | null;
    opportunityId: string | null;
    leadName: string | null;
    leadPhone: string | null;
    opportunityTitle: string | null;
};

type RecordRow = { id: string; name?: string; title?: string; phone?: string; amount?: number; status?: string; stageName?: string };
type DispositionRow = { id: string; leadId: string | null; opportunityId: string | null; outcomeName: string | null; groupName: string | null; createdAt: string; interestLevel: string | null };
type AgentAvailabilityRow = { userId: string; name: string; status: "ONLINE" | "OFFLINE" | "BREAK"; callsToday: number; openTaskWorkload: number };

type Workspace = {
    isSupervisor: boolean;
    myLiveCalls: CallRow[];
    myMissedCallsToday: CallRow[];
    myCallbacksDue: CallbackRow[];
    myOpenLeads: RecordRow[];
    myOpenOpportunities: RecordRow[];
    myRecentDispositions: DispositionRow[];
    team: {
        liveCalls: CallRow[];
        missedCallsToday: CallRow[];
        callbacksDue: CallbackRow[];
        agentAvailability: AgentAvailabilityRow[];
        recentDispositions: DispositionRow[];
        queueHealth: QueueHealthRow[];
    } | null;
};

type QueueHealthRow = { teamId: string; teamName: string; totalQueued: number; unclaimed: number; avgAgeMinutes: number; oldestAgeMinutes: number };

type QueuedCallRow = {
    id: string;
    queueType: string;
    priority: string;
    queuedAt: string;
    claimedBy: string | null;
    fromNumber: string | null;
    toNumber: string | null;
    leadId: string | null;
    opportunityId: string | null;
    leadName: string | null;
    opportunityTitle: string | null;
};

const STATUS_META = {
    ONLINE: { label: "Online", icon: Circle, className: "text-status-success-foreground" },
    BREAK: { label: "On Break", icon: Coffee, className: "text-status-warning-foreground" },
    OFFLINE: { label: "Offline", icon: CircleOff, className: "text-muted-foreground" },
} as const;

function recordLabel(row: { leadId?: string | null; opportunityId?: string | null; leadName?: string | null; opportunityTitle?: string | null }) {
    return row.leadName || row.opportunityTitle || "Unlinked";
}

function recordHref(row: { leadId?: string | null; opportunityId?: string | null }) {
    if (row.leadId) return `/dashboard/leads/${row.leadId}`;
    if (row.opportunityId) return `/dashboard/opportunities/${row.opportunityId}`;
    return null;
}

function CallListCard({ title, icon: Icon, calls, emptyText }: { title: string; icon: typeof PhoneCall; calls: CallRow[]; emptyText: string }) {
    return (
        <Card className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b p-3">
                <Icon className="size-4 text-primary" />
                <h3 className="font-bold">{title}</h3>
                <Badge variant="outline">{calls.length}</Badge>
            </div>
            <div className="divide-y">
                {calls.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">{emptyText}</p>
                ) : (
                    calls.map((call) => {
                        const href = recordHref(call);
                        const label = recordLabel(call);
                        return (
                            <div key={call.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                                <div className="min-w-0 flex-1 basis-40 break-words">
                                    {href ? (
                                        <Link href={href} className="block truncate text-sm font-medium text-primary hover:underline">
                                            {label}
                                        </Link>
                                    ) : (
                                        <span className="block truncate text-sm font-medium">{label}</span>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {call.direction} · {call.status} · {call.toNumber || call.fromNumber || "—"}
                                    </p>
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">{formatWorkspaceDateTime(call.startedAt)}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
}

function CallbacksCard({
    title,
    callbacks,
    onLog,
    now,
}: {
    title: string;
    callbacks: CallbackRow[];
    onLog: (row: CallbackRow) => void;
    now: number;
}) {
    return (
        <Card className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b p-3">
                <CalendarClock className="size-4 text-primary" />
                <h3 className="font-bold">{title}</h3>
                <Badge variant="outline">{callbacks.length}</Badge>
            </div>
            <div className="divide-y">
                {callbacks.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No callbacks due in the next 24 hours.</p>
                ) : (
                    callbacks.map((row) => {
                        const overdue = new Date(row.callbackAt).getTime() <= now;
                        const href = recordHref(row);
                        const label = recordLabel(row);
                        return (
                            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                                <div className="min-w-0 flex-1 basis-40 break-words">
                                    {href ? (
                                        <Link href={href} className="block truncate text-sm font-medium text-primary hover:underline">
                                            {label}
                                        </Link>
                                    ) : (
                                        <span className="block truncate text-sm font-medium">{label}</span>
                                    )}
                                    <p className="text-xs text-muted-foreground">{row.nextAction || "Callback"} · {row.leadPhone || "—"}</p>
                                </div>
                                <div className="flex max-w-full flex-wrap items-center gap-2">
                                    <Badge variant={overdue ? "destructive" : "outline"}>{formatWorkspaceDateTime(row.callbackAt)}</Badge>
                                    <Button size="sm" variant="outline" onClick={() => onLog(row)}>
                                        Log Outcome
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
}

function DispositionsCard({ title, dispositions }: { title: string; dispositions: DispositionRow[] }) {
    return (
        <Card className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b p-3">
                <h3 className="font-bold">{title}</h3>
                <Badge variant="outline">{dispositions.length}</Badge>
            </div>
            <div className="divide-y">
                {dispositions.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No dispositions logged yet.</p>
                ) : (
                    dispositions.slice(0, 8).map((row) => {
                        const href = recordHref(row);
                        const label = recordLabel(row);
                        return (
                            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                                <div className="min-w-0 flex-1 basis-40 break-words">
                                    {href ? (
                                        <Link href={href} className="block truncate text-sm font-medium text-primary hover:underline">
                                            {label}
                                        </Link>
                                    ) : (
                                        <span className="block truncate text-sm font-medium">{label}</span>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {row.groupName ? `${row.groupName} · ` : ""}
                                        {row.outcomeName || "Outcome"}
                                    </p>
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">{formatWorkspaceDateTime(row.createdAt)}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
}

function OpenRecordsCard({ title, records, hrefBase }: { title: string; records: RecordRow[]; hrefBase: string }) {
    return (
        <Card className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b p-3">
                <h3 className="font-bold">{title}</h3>
                <Badge variant="outline">{records.length}</Badge>
            </div>
            <div className="divide-y">
                {records.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Nothing assigned right now.</p>
                ) : (
                    records.map((row) => (
                        <Link key={row.id} href={`${hrefBase}/${row.id}`} className="block p-3 text-sm hover:bg-accent/50">
                            <p className="break-words font-medium text-primary">{row.name || row.title}</p>
                            <p className="text-xs text-muted-foreground">{row.stageName || row.status || ""}</p>
                        </Link>
                    ))
                )}
            </div>
        </Card>
    );
}

function AgentAvailabilityCard({ agents }: { agents: AgentAvailabilityRow[] }) {
    return (
        <Card className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b p-3">
                <Users className="size-4 text-primary" />
                <h3 className="font-bold">Agent Availability</h3>
                <Badge variant="outline">{agents.length}</Badge>
            </div>
            <div className="divide-y">
                {agents.map((agent) => {
                    const Meta = STATUS_META[agent.status];
                    const Icon = Meta.icon;
                    return (
                        <div key={agent.userId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                            <span className="text-sm font-medium">{agent.name}</span>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{agent.callsToday} calls · {agent.openTaskWorkload} open</span>
                                <span className={`flex items-center gap-1 ${Meta.className}`}>
                                    <Icon className="size-3 fill-current" />
                                    {Meta.label}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

// Queue wait times come back in whole minutes from the queue health read.
function formatWait(minutes: number) {
    if (minutes < 1) return "under 1 min";
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    return `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
}

// Queue health (the same rows GET /call-queues/health returns, embedded in the workspace read)
// plus each team's queued calls. A claimed call stays listed until its outcome is logged, so a
// supervisor can release it back to the queue if the agent can't take it after all.
function QueueBacklogCard({ queues, agents, onChanged }: { queues: QueueHealthRow[]; agents: AgentAvailabilityRow[]; onChanged: () => void }) {
    const confirm = useConfirm();
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [queuedCalls, setQueuedCalls] = useState<QueuedCallRow[]>([]);
    const [loadingCalls, setLoadingCalls] = useState(false);
    const [queueError, setQueueError] = useState<string | null>(null);
    const queueRequest = useRef(0);
    const [busyId, setBusyId] = useState<string | null>(null);

    const agentName = (userId: string | null) => agents.find((agent) => agent.userId === userId)?.name ?? null;
    const totals = queues.reduce(
        (sum, queue) => ({
            waiting: sum.waiting + queue.totalQueued,
            unclaimed: sum.unclaimed + queue.unclaimed,
            oldest: Math.max(sum.oldest, queue.oldestAgeMinutes),
            ageTotal: sum.ageTotal + queue.avgAgeMinutes * queue.totalQueued,
        }),
        { waiting: 0, unclaimed: 0, oldest: 0, ageTotal: 0 },
    );
    const averageWait = totals.waiting ? Math.round(totals.ageTotal / totals.waiting) : 0;

    const toggleTeam = async (teamId: string, retry = false) => {
        const request = ++queueRequest.current;
        if (!retry && expandedTeamId === teamId) {
            setExpandedTeamId(null);
            return;
        }
        setExpandedTeamId(teamId);
        setLoadingCalls(true);
        setQueueError(null);
        try {
            const data = await apiFetch<QueuedCallRow[]>(`/call-queues/team/${teamId}/calls`);
            if (request === queueRequest.current) setQueuedCalls(Array.isArray(data) ? data : []);
        } catch {
            if (request === queueRequest.current) setQueueError("Could not load queued calls.");
        } finally {
            if (request === queueRequest.current) setLoadingCalls(false);
        }
    };

    const updateCall = (callId: string, patch: Partial<QueuedCallRow>) => {
        setQueuedCalls((current) => current.map((call) => (call.id === callId ? { ...call, ...patch } : call)));
    };

    const claim = async (callId: string) => {
        setBusyId(callId);
        try {
            const claimed = await apiFetch<{ claimedBy: string | null }>(`/call-queues/${callId}/claim`, { method: "POST" });
            updateCall(callId, { claimedBy: claimed?.claimedBy ?? null });
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || "Failed to claim call");
        } finally {
            setBusyId(null);
        }
    };

    const release = async (call: QueuedCallRow, queueName: string) => {
        const claimer = agentName(call.claimedBy);
        const ok = await confirm({
            title: claimer ? `Release ${claimer}'s call back to the queue?` : "Release this call back to the queue?",
            description: `It goes back to ${queueName} as unclaimed, so anyone on the team can claim it.`,
            confirmLabel: "Release call",
        });
        if (!ok) return;
        setBusyId(call.id);
        try {
            await apiFetch(`/call-queues/${call.id}/release`, { method: "POST" });
            updateCall(call.id, { claimedBy: null });
            toast.success("Call released to the queue");
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || "Failed to release call");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Card className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b p-3">
                <ListOrdered className="size-4 text-primary" />
                <h3 className="font-semibold">Queue backlog</h3>
                <Badge variant="outline">{queues.length}</Badge>
            </div>
            {queues.length > 0 ? (
                <dl className="grid grid-cols-2 gap-3 border-b p-3 sm:grid-cols-4">
                    <div>
                        <dt className="text-xs text-muted-foreground">Waiting</dt>
                        <dd className="text-lg font-semibold">{formatCount(totals.waiting)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Unclaimed</dt>
                        <dd className={cn("text-lg font-semibold", totals.unclaimed > 0 && "text-destructive")}>{formatCount(totals.unclaimed)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Average wait</dt>
                        <dd className="text-lg font-semibold">{formatWait(averageWait)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Longest wait</dt>
                        <dd className="text-lg font-semibold">{formatWait(totals.oldest)}</dd>
                    </div>
                </dl>
            ) : null}
            <div className="divide-y">
                {queues.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                        No queued calls. Calls queue for the team chosen in{" "}
                        <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/dashboard/settings/integrations?section=phone-system">Settings › Integrations › Phone system</Link>.
                    </p>
                ) : (
                    queues.map((queue) => (
                        <div key={queue.teamId}>
                            <button
                                type="button"
                                aria-expanded={expandedTeamId === queue.teamId}
                                onClick={() => toggleTeam(queue.teamId)}
                                className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-accent/50"
                            >
                                <span className="text-sm font-medium">{queue.teamName}</span>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span>{formatCount(queue.totalQueued)} waiting</span>
                                    <Badge tone={queue.unclaimed > 0 ? "danger" : "neutral"}>{formatCount(queue.unclaimed)} unclaimed</Badge>
                                    <span>average {formatWait(queue.avgAgeMinutes)}</span>
                                    <span>longest {formatWait(queue.oldestAgeMinutes)}</span>
                                </div>
                            </button>
                            {expandedTeamId === queue.teamId && (
                                <div className="divide-y border-t bg-muted/20">
                                    {loadingCalls ? (
                                        <p className="p-3 text-sm text-muted-foreground">Loading...</p>
                                    ) : queueError ? (
                                        <ErrorState description={queueError} onRetry={() => toggleTeam(queue.teamId, true)} />
                                    ) : queuedCalls.length === 0 ? (
                                        <p className="p-3 text-sm text-muted-foreground">Nothing queued right now.</p>
                                    ) : (
                                        queuedCalls.map((call) => (
                                            <div key={call.id} className="flex flex-wrap items-center justify-between gap-2 p-3 pl-6">
                                                <div className="min-w-0 flex-1 basis-40 break-words">
                                                    <p className="block truncate text-sm font-medium">
                                                        {call.leadName || call.opportunityTitle || call.fromNumber || call.toNumber || "Unknown"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {humanizeEnum(call.queueType)} · {humanizeEnum(call.priority)} · queued {formatWorkspaceDateTime(call.queuedAt)}
                                                    </p>
                                                </div>
                                                {call.claimedBy ? (
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge tone="info">{agentName(call.claimedBy) ? `Claimed by ${agentName(call.claimedBy)}` : "Claimed"}</Badge>
                                                        <Button size="sm" variant="outline" isLoading={busyId === call.id} disabled={busyId === call.id} onClick={() => release(call, queue.teamName)}>
                                                            Release
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button size="sm" isLoading={busyId === call.id} disabled={busyId === call.id} onClick={() => claim(call.id)}>
                                                        Claim
                                                    </Button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
}

type MyCampaign = { id: string; name: string; description: string | null; module: string; assignedTeamName: string | null; dueNow: number };

// Campaigns this person can take calls from (UI/UX plan §5.14): they were reachable only from
// admin Settings before. Reloads with the rest of the page.
function MyCampaignsCard({ refreshToken }: { refreshToken: number }) {
    const [campaigns, setCampaigns] = useState<MyCampaign[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        apiFetch<MyCampaign[]>("/call-campaigns?mine=1")
            .then((data) => { setCampaigns(Array.isArray(data) ? data : []); setFailed(false); })
            .catch(() => setFailed(true));
    }, [refreshToken]);

    return (
        <Card className="overflow-hidden py-0 lg:col-span-2">
            <div className="flex items-center gap-2 border-b p-3">
                <PhoneOutgoing className="size-4 text-primary" aria-hidden />
                <h3 className="font-semibold">My campaigns</h3>
                {campaigns ? <Badge variant="outline">{campaigns.length}</Badge> : null}
            </div>
            {failed && !campaigns ? (
                <ErrorState variant="inline" description="Your campaigns couldn't be loaded." className="m-3" />
            ) : !campaigns ? (
                <p className="p-3 text-sm text-muted-foreground">Loading your campaigns…</p>
            ) : campaigns.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No active calling campaigns for you right now.</p>
            ) : (
                <ul className="divide-y">
                    {campaigns.map((campaign) => (
                        <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                            <div className="min-w-0 flex-1 basis-56">
                                <p className="font-medium">{campaign.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {campaign.dueNow === 0 ? "No calls due now" : `${campaign.dueNow} call${campaign.dueNow === 1 ? "" : "s"} due now`}
                                    {campaign.assignedTeamName ? ` · ${campaign.assignedTeamName}` : ""}
                                </p>
                            </div>
                            <Button size="sm" variant={campaign.dueNow ? "default" : "outline"} asChild>
                                <Link href={`/dashboard/call-center/campaigns/${campaign.id}`}>Start calling</Link>
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function CallCenterWorkspacePageContent() {
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [loading, setLoading] = useState(true);
    const [logOutcomeFor, setLogOutcomeFor] = useState<CallbackRow | null>(null);
    const [now, setNow] = useState<number | null>(null);
    // Gap checklist Module 10's "performance UX polish" item, "background refresh indicators"
    // -- this page already auto-refreshes silently every 20s (POLL_INTERVAL_MS) with zero visual
    // cue that anything just happened; `refreshing` drives the same spin-icon treatment the
    // manual "Refresh" button already had, for both manual and automatic ticks.
    const [refreshing, setRefreshing] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);

    const load = useCallback(() => {
        setNow(Date.now());
        setRefreshing(true);
        setRefreshToken((token) => token + 1);
        apiFetch<Workspace>("/call-center/workspace")
            .then(data => { setWorkspace(data); setFetchError(null); })
            .catch(() => setFetchError("Could not refresh the call center workspace. Any displayed data is from the last successful refresh."))
            .finally(() => {
                setLoading(false);
                setRefreshing(false);
            });
    }, []);

    useEffect(() => { load(); }, [load]);
    // Paused while the tab is hidden (round-2 plan P9).
    useVisibleInterval(load, POLL_INTERVAL_MS);

    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading the call center…</p>;
    }

    if (!workspace || now === null) return <ErrorState title="Call center unavailable" description={fetchError || "Workspace data is unavailable."} onRetry={load} />;

    return (
        <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
            <PageHeader title="Call center" description="Calls, callbacks and assigned records. Refreshes every 20 seconds." actions={
                <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
                    <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />Refresh
                </Button>
            } />
            {fetchError && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm"><p className="min-w-0 flex-1 basis-60">{fetchError}</p><Button variant="outline" size="sm" onClick={load} disabled={refreshing}>Try again</Button></div>}

            <div>
                <h2 className="mb-2 text-base font-semibold">My work</h2>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <MyCampaignsCard refreshToken={refreshToken} />
                    <CallListCard title="Live calls" icon={PhoneCall} calls={workspace.myLiveCalls} emptyText="No calls in progress." />
                    <CallListCard title="Missed calls today" icon={PhoneMissed} calls={workspace.myMissedCallsToday} emptyText="No missed calls today." />
                    <CallbacksCard title="Callbacks due" callbacks={workspace.myCallbacksDue} onLog={setLogOutcomeFor} now={now} />
                    <DispositionsCard title="Recent outcomes" dispositions={workspace.myRecentDispositions} />
                    <OpenRecordsCard title="My open leads" records={workspace.myOpenLeads} hrefBase="/dashboard/leads" />
                    <OpenRecordsCard title="My open opportunities" records={workspace.myOpenOpportunities} hrefBase="/dashboard/opportunities" />
                </div>
            </div>

            {workspace.team && (
                <div>
                    <h2 className="mb-2 text-base font-semibold">Team</h2>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <CallListCard title="Team live calls" icon={PhoneCall} calls={workspace.team.liveCalls} emptyText="No calls in progress." />
                        <CallListCard title="Team missed calls today" icon={PhoneMissed} calls={workspace.team.missedCallsToday} emptyText="No missed calls today." />
                        <CallbacksCard title="Team callbacks due" callbacks={workspace.team.callbacksDue} onLog={setLogOutcomeFor} now={now} />
                        <AgentAvailabilityCard agents={workspace.team.agentAvailability} />
                        <QueueBacklogCard queues={workspace.team.queueHealth} agents={workspace.team.agentAvailability} onChanged={load} />
                        <DispositionsCard title="Team recent outcomes" dispositions={workspace.team.recentDispositions} />
                    </div>
                </div>
            )}

            <LogCallOutcomeDialog
                open={!!logOutcomeFor}
                onClose={() => setLogOutcomeFor(null)}
                leadId={logOutcomeFor?.leadId}
                opportunityId={logOutcomeFor?.opportunityId}
                onLogged={load}
            />
        </div>
    );
}

export default function CallCenterWorkspacePage() {
    return <ModuleGate moduleKey="TELEPHONY" name="Telephony"><CallCenterWorkspacePageContent /></ModuleGate>;
}

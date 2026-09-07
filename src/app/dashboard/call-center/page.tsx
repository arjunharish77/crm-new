"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PhoneCall, PhoneMissed, CalendarClock, Users, RefreshCw, Circle, Coffee, CircleOff, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatWorkspaceDateTime } from "@/lib/date-format";
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
    ONLINE: { label: "Online", icon: Circle, className: "text-emerald-600" },
    BREAK: { label: "On Break", icon: Coffee, className: "text-amber-600" },
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
                            <div key={call.id} className="flex items-center justify-between gap-2 p-3">
                                <div className="min-w-0">
                                    {href ? (
                                        <Link href={href} className="truncate text-sm font-medium text-primary hover:underline">
                                            {label}
                                        </Link>
                                    ) : (
                                        <span className="truncate text-sm font-medium">{label}</span>
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
                            <div key={row.id} className="flex items-center justify-between gap-2 p-3">
                                <div className="min-w-0">
                                    {href ? (
                                        <Link href={href} className="truncate text-sm font-medium text-primary hover:underline">
                                            {label}
                                        </Link>
                                    ) : (
                                        <span className="truncate text-sm font-medium">{label}</span>
                                    )}
                                    <p className="text-xs text-muted-foreground">{row.nextAction || "Callback"} · {row.leadPhone || "—"}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
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
                            <div key={row.id} className="flex items-center justify-between gap-2 p-3">
                                <div className="min-w-0">
                                    {href ? (
                                        <Link href={href} className="truncate text-sm font-medium text-primary hover:underline">
                                            {label}
                                        </Link>
                                    ) : (
                                        <span className="truncate text-sm font-medium">{label}</span>
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
                            <p className="font-medium text-primary">{row.name || row.title}</p>
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
                        <div key={agent.userId} className="flex items-center justify-between gap-2 p-3">
                            <span className="text-sm font-medium">{agent.name}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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

function QueueBacklogCard({ queues, onClaimed }: { queues: QueueHealthRow[]; onClaimed: () => void }) {
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [queuedCalls, setQueuedCalls] = useState<QueuedCallRow[]>([]);
    const [loadingCalls, setLoadingCalls] = useState(false);
    const [claimingId, setClaimingId] = useState<string | null>(null);

    const toggleTeam = async (teamId: string) => {
        if (expandedTeamId === teamId) {
            setExpandedTeamId(null);
            return;
        }
        setExpandedTeamId(teamId);
        setLoadingCalls(true);
        try {
            const data = await apiFetch<QueuedCallRow[]>(`/call-queues/team/${teamId}/calls`);
            setQueuedCalls(Array.isArray(data) ? data : []);
        } catch {
            setQueuedCalls([]);
        } finally {
            setLoadingCalls(false);
        }
    };

    const claim = async (callId: string) => {
        setClaimingId(callId);
        try {
            await apiFetch(`/call-queues/${callId}/claim`, { method: "POST" });
            setQueuedCalls((current) => current.filter((call) => call.id !== callId));
            onClaimed();
        } catch (error: any) {
            toast.error(error?.message || "Failed to claim call");
        } finally {
            setClaimingId(null);
        }
    };

    return (
        <Card className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b p-3">
                <ListOrdered className="size-4 text-primary" />
                <h3 className="font-bold">Queue Backlog</h3>
                <Badge variant="outline">{queues.length}</Badge>
            </div>
            <div className="divide-y">
                {queues.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No queued calls. Configure a default call queue team in Telephony settings.</p>
                ) : (
                    queues.map((queue) => (
                        <div key={queue.teamId}>
                            <button
                                type="button"
                                onClick={() => toggleTeam(queue.teamId)}
                                className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-accent/50"
                            >
                                <span className="text-sm font-medium">{queue.teamName}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant={queue.unclaimed > 0 ? "destructive" : "outline"}>{queue.unclaimed} unclaimed</Badge>
                                    <span>oldest {queue.oldestAgeMinutes}m</span>
                                </div>
                            </button>
                            {expandedTeamId === queue.teamId && (
                                <div className="divide-y border-t bg-muted/20">
                                    {loadingCalls ? (
                                        <p className="p-3 text-sm text-muted-foreground">Loading...</p>
                                    ) : queuedCalls.length === 0 ? (
                                        <p className="p-3 text-sm text-muted-foreground">Nothing queued right now.</p>
                                    ) : (
                                        queuedCalls.map((call) => (
                                            <div key={call.id} className="flex items-center justify-between gap-2 p-3 pl-6">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">
                                                        {call.leadName || call.opportunityTitle || call.fromNumber || call.toNumber || "Unknown"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {call.queueType} · {call.priority} · queued {formatWorkspaceDateTime(call.queuedAt)}
                                                    </p>
                                                </div>
                                                {call.claimedBy ? (
                                                    <Badge variant="outline">Claimed</Badge>
                                                ) : (
                                                    <Button size="sm" disabled={claimingId === call.id} onClick={() => claim(call.id)}>
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

export default function CallCenterWorkspacePage() {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [loading, setLoading] = useState(true);
    const [logOutcomeFor, setLogOutcomeFor] = useState<CallbackRow | null>(null);
    const [now, setNow] = useState<number | null>(null);
    // Gap checklist Module 10's "performance UX polish" item, "background refresh indicators"
    // -- this page already auto-refreshes silently every 20s (POLL_INTERVAL_MS) with zero visual
    // cue that anything just happened; `refreshing` drives the same spin-icon treatment the
    // manual "Refresh" button already had, for both manual and automatic ticks.
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(() => {
        setNow(Date.now());
        setRefreshing(true);
        apiFetch<Workspace>("/call-center/workspace")
            .then(setWorkspace)
            .catch(() => undefined)
            .finally(() => {
                setLoading(false);
                setRefreshing(false);
            });
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [load]);

    if (loading || !workspace || now === null) {
        return <p className="text-sm text-muted-foreground">Loading call center workspace...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold">Call Center Workspace</h1>
                    <p className="text-sm text-muted-foreground">Auto-refreshes every 20 seconds.</p>
                </div>
                <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
                    <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div>
                <h2 className="mb-2 text-base font-bold">My Workspace</h2>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <CallListCard title="Live Calls" icon={PhoneCall} calls={workspace.myLiveCalls} emptyText="No calls in progress." />
                    <CallListCard title="Missed Calls Today" icon={PhoneMissed} calls={workspace.myMissedCallsToday} emptyText="No missed calls today." />
                    <CallbacksCard title="Callbacks Due" callbacks={workspace.myCallbacksDue} onLog={setLogOutcomeFor} now={now} />
                    <DispositionsCard title="Recent Dispositions" dispositions={workspace.myRecentDispositions} />
                    <OpenRecordsCard title="My Open Leads" records={workspace.myOpenLeads} hrefBase="/dashboard/leads" />
                    <OpenRecordsCard title="My Open Opportunities" records={workspace.myOpenOpportunities} hrefBase="/dashboard/opportunities" />
                </div>
            </div>

            {workspace.team && (
                <div>
                    <h2 className="mb-2 text-base font-bold">Team Overview</h2>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <CallListCard title="Team Live Calls" icon={PhoneCall} calls={workspace.team.liveCalls} emptyText="No calls in progress." />
                        <CallListCard title="Team Missed Calls Today" icon={PhoneMissed} calls={workspace.team.missedCallsToday} emptyText="No missed calls today." />
                        <CallbacksCard title="Team Callbacks Due" callbacks={workspace.team.callbacksDue} onLog={setLogOutcomeFor} now={now} />
                        <AgentAvailabilityCard agents={workspace.team.agentAvailability} />
                        <QueueBacklogCard queues={workspace.team.queueHealth} onClaimed={load} />
                        <DispositionsCard title="Team Recent Dispositions" dispositions={workspace.team.recentDispositions} />
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

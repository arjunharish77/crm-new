"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { useUrlState } from "@/hooks/use-url-state";
import { humanizeEnum } from "@/lib/display/status";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { Inbox, Scale, Timer, TriangleAlert, UserCheck, UserMinus } from "lucide-react";

type Team = { id: string; name: string; leadId: string | null };
type UserOption = { id: string; name?: string | null; email?: string | null; teamId?: string | null };
type QueueHealth = {
    teamId: string;
    teamName: string;
    totalQueued: number;
    unclaimed: number;
    slaBreaches: number;
    avgAgeMinutes: number;
    oldestAgeMinutes: number;
};
type QueueTask = {
    id: string;
    title: string;
    status: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueAt: string | null;
    queuedAt: string | null;
    claimedBy: string | null;
    slaStatus?: "PENDING" | "MET" | "BREACHED" | null;
    owner?: { name?: string | null; email?: string | null } | null;
};

function formatAge(minutes: number) {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
}

export default function TaskQueuesPage() {
    const { user } = useAuth();
    const [teams, setTeams] = useState<Team[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [health, setHealth] = useState<QueueHealth[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [tasksError, setTasksError] = useState(false);
    // The chosen queue is in the URL (?queue=), so a reload or shared link keeps it.
    const [queueParam, setQueueParam] = useUrlState<string>("queue", "");
    const selectedQueueId = queueParam || null;
    const setSelectedQueueId = (id: string) => setQueueParam(id);
    const [queueTasks, setQueueTasks] = useState<QueueTask[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [autoBalancing, setAutoBalancing] = useState(false);

    const loadQueues = useCallback(() => {
        setLoading(true);
        setLoadError(false);
        Promise.all([apiFetch("/teams"), apiFetch("/users"), apiFetch("/task-queues/health")])
            .then(([teamsData, usersData, healthData]) => {
                setTeams(Array.isArray(teamsData) ? teamsData : []);
                setUsers(Array.isArray(usersData) ? usersData : []);
                setHealth(Array.isArray(healthData) ? healthData : []);
            })
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => { loadQueues(); }, [loadQueues]);

    const fetchQueueTasks = useCallback((queueId: string) => {
        setLoadingTasks(true);
        setTasksError(false);
        apiFetch(`/task-queues/${queueId}/tasks`)
            .then((data) => setQueueTasks(Array.isArray(data) ? data : []))
            .catch(() => setTasksError(true))
            .finally(() => setLoadingTasks(false));
    }, []);

    useEffect(() => {
        if (selectedQueueId) fetchQueueTasks(selectedQueueId);
        else setQueueTasks([]);
    }, [selectedQueueId, fetchQueueTasks]);

    const selectedTeam = teams.find((team) => team.id === selectedQueueId) ?? null;
    const recordAccess = user?.role && typeof user.role === "object" ? (user.role as any).permissions?.recordAccess : null;
    const isSupervisor = recordAccess === "ALL" || recordAccess === "TEAM" || (!!selectedTeam?.leadId && selectedTeam.leadId === user?.id);
    const teamMembers = users.filter((member) => member.teamId && selectedQueueId && String(member.teamId) === String(selectedQueueId));

    const claim = async (taskId: string) => {
        try {
            await apiFetch(`/tasks/${taskId}/claim`, { method: "POST" });
            toast.success("Task claimed");
            if (selectedQueueId) fetchQueueTasks(selectedQueueId);
        } catch (error: any) {
            toast.error(error?.message || "Failed to claim task");
        }
    };

    const unclaim = async (taskId: string) => {
        try {
            await apiFetch(`/tasks/${taskId}/unclaim`, { method: "POST" });
            toast.success("Task unclaimed");
            if (selectedQueueId) fetchQueueTasks(selectedQueueId);
        } catch (error: any) {
            toast.error(error?.message || "Failed to unclaim task");
        }
    };

    const reassign = async (taskId: string, targetUserId: string) => {
        try {
            await apiFetch(`/tasks/${taskId}/reassign`, { method: "POST", body: JSON.stringify({ targetUserId }) });
            toast.success("Task reassigned");
            if (selectedQueueId) fetchQueueTasks(selectedQueueId);
        } catch (error: any) {
            toast.error(error?.message || "Failed to reassign task");
        }
    };

    const autoBalance = async () => {
        if (!selectedQueueId) return;
        setAutoBalancing(true);
        try {
            const result = await apiFetch(`/task-queues/${selectedQueueId}/auto-assign`, { method: "POST" });
            toast.success(`Assigned ${result.assigned?.length ?? 0} task(s)${result.remainingUnclaimed ? `, ${result.remainingUnclaimed} left unclaimed (no active team members)` : ""}`);
            fetchQueueTasks(selectedQueueId);
        } catch (error: any) {
            toast.error(error?.message || "Failed to auto-assign queue");
        } finally {
            setAutoBalancing(false);
        }
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Team queues"
                description="Shared task backlogs any team member can claim from."
                backHref="/dashboard/tasks"
                backLabel="Tasks"
            />

            {loading ? (
                <TableSkeleton rows={3} columns={4} />
            ) : loadError ? (
                <ErrorState description="The team queues couldn't be loaded." onRetry={loadQueues} />
            ) : (
                <>
                    {health.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {health.map((stat) => (
                                <Card key={stat.teamId} className="p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="font-semibold">{stat.teamName}</p>
                                        {stat.unclaimed > 0 && (
                                            <Badge variant="secondary" className="rounded-md text-xs">{stat.unclaimed} unclaimed</Badge>
                                        )}
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1"><Inbox className="size-3" />{stat.totalQueued} queued</span>
                                        <span className="inline-flex items-center gap-1"><Timer className="size-3" />avg age {formatAge(stat.avgAgeMinutes)}</span>
                                        <span className="inline-flex items-center gap-1"><Timer className="size-3" />oldest {formatAge(stat.oldestAgeMinutes)}</span>
                                        {stat.slaBreaches > 0 && (
                                            <span className="inline-flex items-center gap-1 text-destructive"><TriangleAlert className="size-3" />{stat.slaBreaches} SLA breached</span>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <Select value={selectedQueueId ?? undefined} onValueChange={setSelectedQueueId}>
                            <SelectTrigger className="w-64" aria-label="Team queue"><SelectValue placeholder="Choose a team queue" /></SelectTrigger>
                            <SelectContent>
                                {teams.map((team) => (
                                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedQueueId && isSupervisor && (
                            <Button variant="outline" size="sm" disabled={autoBalancing} onClick={autoBalance}>
                                <Scale className="size-4" />
                                {autoBalancing ? "Balancing..." : "Auto-balance"}
                            </Button>
                        )}
                    </div>

                    {!selectedQueueId ? (
                        <EmptyState title="Pick a team queue" description="Select a team above to view and manage its shared task backlog." />
                    ) : loadingTasks ? (
                        <TableSkeleton rows={4} columns={3} />
                    ) : tasksError ? (
                        <ErrorState description="This queue's tasks couldn't be loaded." onRetry={() => selectedQueueId && fetchQueueTasks(selectedQueueId)} />
                    ) : queueTasks.length === 0 ? (
                        <EmptyState title="Queue is empty" description="No open tasks are routed to this team's queue right now." />
                    ) : (
                        <div className="space-y-2">
                            {queueTasks.map((task) => (
                                <div key={task.id} className="rounded-xl border bg-card p-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Link href={`/dashboard/tasks?taskId=${task.id}`} className="text-sm font-medium hover:underline">{task.title}</Link>
                                                <Badge tone="neutral">{humanizeEnum(task.status)}</Badge>
                                                <Badge tone={task.priority === "HIGH" || task.priority === "URGENT" ? "danger" : "neutral"}>{humanizeEnum(task.priority)}</Badge>
                                                {task.claimedBy ? (
                                                    <Badge variant="outline" className="rounded-md text-xs">Claimed by {task.owner?.name || task.owner?.email || "someone"}</Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="rounded-md text-xs">Unclaimed</Badge>
                                                )}
                                                {task.slaStatus === "BREACHED" && (
                                                    <Badge variant="destructive" className="rounded-md text-xs font-semibold">
                                                        <TriangleAlert className="size-3" />
                                                        SLA Breached
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                                {task.queuedAt ? <span>In queue {formatAge((Date.now() - new Date(task.queuedAt).getTime()) / 60000)}</span> : null}
                                                {task.dueAt ? <span>Due {formatWorkspaceDateTime(task.dueAt)}</span> : null}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                                            {task.claimedBy ? (
                                                (task.claimedBy === user?.id || isSupervisor) && (
                                                    <Button size="sm" variant="outline" onClick={() => unclaim(task.id)}>
                                                        <UserMinus className="size-4" />
                                                        Unclaim
                                                    </Button>
                                                )
                                            ) : (
                                                <Button size="sm" variant="outline" onClick={() => claim(task.id)}>
                                                    <UserCheck className="size-4" />
                                                    Claim
                                                </Button>
                                            )}
                                            {isSupervisor && teamMembers.length > 0 && (
                                                <Select onValueChange={(targetUserId) => reassign(task.id, targetUserId)}>
                                                    <SelectTrigger className="w-40" size="sm" aria-label={`Reassign ${task.title}`}><SelectValue placeholder="Reassign to…" /></SelectTrigger>
                                                    <SelectContent>
                                                        {teamMembers.map((member) => (
                                                            <SelectItem key={member.id} value={member.id}>{member.name || member.email}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

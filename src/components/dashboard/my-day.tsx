"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useModuleAccess } from "@/hooks/use-module-access";
import { useAuth } from "@/providers/auth-provider";
import { useFeature } from "@/components/auth/feature-gate";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconButton } from "@/components/ui/icon-button";
import { ErrorState } from "@/components/common/error-state";
import { useRecordsChanged } from "@/lib/records-events";
import { formatWorkspaceDate, formatWorkspaceDateParts, formatWorkspaceRelativeTime, formatWorkspaceTime, isPastDate } from "@/lib/date-format";
import { formatCount, formatMoney } from "@/lib/display/format";
import { cn } from "@/lib/utils";

type Row = { id: string; href: string; title: string; detail?: string; meta?: string; urgent?: boolean; taskId?: string };
type Section = { total: number; rows: Row[] } | null;

const LIMIT = 5;

function encodeFilters(conditions: unknown[]) {
    return encodeURIComponent(JSON.stringify([{ logic: "AND", conditions }]));
}

// "My day" (UI/UX plan §10.3, decision 21): what the signed-in person should do today -- overdue
// and due-today tasks, follow-ups, their newest leads and their open pipeline. Each card shows
// the real total and the first five, with a link to the full, already-filtered list.
export function MyDay() {
    const { user } = useAuth();
    const userId = user?.id;
    // Only what the role may see (lib/module-access.ts); each card's module is checked.
    const can = useModuleAccess();
    const showTasks = can("tasks");
    const showActivities = can("activities");
    const showLeads = can("leads");
    const opportunitiesEnabled = useFeature("opportunityEnabled") && can("opportunities");
    const [overdue, setOverdue] = useState<Section>(null);
    const [today, setToday] = useState<Section>(null);
    const [followUps, setFollowUps] = useState<Section>(null);
    const [newLeads, setNewLeads] = useState<Section>(null);
    const [pipeline, setPipeline] = useState<Section>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        if (!userId) return;
        setFailed(false);
        const me = userId;
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const taskRows = (rows: any[]): Row[] => rows.map((task) => ({
            id: task.id,
            taskId: task.id,
            href: `/dashboard/tasks?taskId=${task.id}`,
            title: task.title,
            detail: task.opportunity?.title || task.lead?.name || undefined,
            meta: task.dueAt ? (isPastDate(task.dueAt) ? `Due ${formatWorkspaceRelativeTime(task.dueAt)}` : `Due ${formatWorkspaceTime(task.dueAt)}`) : undefined,
            urgent: !!task.dueAt && isPastDate(task.dueAt),
        }));
        const section = async (url: string, map: (rows: any[]) => Row[]): Promise<Section> => {
            const response: any = await apiFetch(url);
            return { total: Number(response?.meta?.total ?? 0), rows: map(Array.isArray(response?.data) ? response.data : []) };
        };
        try {
            const [overdueTasks, todayTasks, dueFollowUps, leads, opportunities] = await Promise.all([
                showTasks ? section(`/tasks?ownerId=me&due=overdue&page=1&limit=${LIMIT}`, taskRows) : Promise.resolve(null),
                showTasks ? section(`/tasks?ownerId=me&due=today&open=1&page=1&limit=${LIMIT}`, taskRows) : Promise.resolve(null),
                // Activities I logged that are due by the end of today and not completed.
                !showActivities ? Promise.resolve(null) : section(`/activities?page=1&limit=${LIMIT}&filters=${encodeFilters([
                    { field: "createdBy", operator: "equals", value: me },
                    { field: "completedAt", operator: "is_empty" },
                    { field: "dueAt", operator: "lte", value: endOfToday.toISOString() },
                ])}`, (rows) => rows.map((activity) => ({
                    id: activity.id,
                    href: activity.opportunityId ? `/dashboard/opportunities/${activity.opportunityId}?tab=activity` : activity.leadId ? `/dashboard/leads/${activity.leadId}?tab=activity` : "/dashboard/activities",
                    title: activity.type?.name ? `${activity.type.name}${activity.notes ? ` · ${activity.notes}` : ""}` : activity.notes || "Activity",
                    detail: activity.opportunity?.title || activity.lead?.name || undefined,
                    meta: activity.dueAt ? `Due ${formatWorkspaceRelativeTime(activity.dueAt)}` : undefined,
                    urgent: !!activity.dueAt && isPastDate(activity.dueAt),
                }))),
                !showLeads ? Promise.resolve(null) : section(`/leads?page=1&limit=${LIMIT}&sort=createdAt&dir=desc&filters=${encodeFilters([
                    { field: "ownerId", operator: "equals", value: me },
                    { field: "createdAt", operator: "gte", value: weekAgo.toISOString() },
                ])}`, (rows) => rows.map((lead) => ({
                    id: lead.id,
                    href: `/dashboard/leads/${lead.id}`,
                    title: lead.name,
                    detail: [lead.company, lead.source].filter(Boolean).join(" · ") || undefined,
                    meta: formatWorkspaceRelativeTime(lead.createdAt),
                }))),
                opportunitiesEnabled
                    ? section(`/opportunities?page=1&limit=${LIMIT}&sort=expectedCloseDate&dir=asc&filters=${encodeFilters([
                        { field: "ownerId", operator: "equals", value: me },
                        { field: "stageCategory", operator: "equals", value: "OPEN" },
                    ])}`, (rows) => rows.map((opportunity) => ({
                        id: opportunity.id,
                        href: `/dashboard/opportunities/${opportunity.id}`,
                        title: opportunity.title,
                        detail: [opportunity.stage?.label || opportunity.stage?.name, formatMoney(opportunity.amount ?? 0)].filter(Boolean).join(" · "),
                        meta: opportunity.expectedCloseDate ? `Closes ${formatWorkspaceDate(opportunity.expectedCloseDate)}` : undefined,
                        urgent: !!opportunity.expectedCloseDate && isPastDate(opportunity.expectedCloseDate),
                    })))
                    : Promise.resolve(null),
            ]);
            setOverdue(overdueTasks);
            setToday(todayTasks);
            setFollowUps(dueFollowUps);
            setNewLeads(leads);
            setPipeline(opportunities);
        } catch {
            setFailed(true);
        }
    }, [userId, opportunitiesEnabled, showTasks, showActivities, showLeads]);
    useEffect(() => { load(); }, [load]);
    useRecordsChanged(["task", "activity", "lead", "opportunity"], load);

    const completeTask = async (taskId: string, title: string) => {
        try {
            await apiFetch(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) });
            toast.success(`Completed: ${title}`, {
                duration: 6000,
                action: {
                    label: "Undo",
                    onClick: async () => {
                        try {
                            await apiFetch(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "OPEN" }) });
                            load();
                        } catch {
                            toast.error("Couldn't undo");
                        }
                    },
                },
            });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Couldn't complete the task");
        }
    };

    if (failed) return <ErrorState description="Your day couldn't be loaded." onRetry={load} />;

    const firstName = (user?.name || "").split(" ")[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold">{greeting}{firstName ? `, ${firstName}` : ""}</h2>
                <p className="text-sm text-muted-foreground">{formatWorkspaceDateParts(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {showTasks ? <DayCard title="Overdue tasks" section={overdue} tone="danger" empty="Nothing overdue." viewAll="/dashboard/tasks?view=overdue" onComplete={completeTask} /> : null}
                {showTasks ? <DayCard title="Due today" section={today} empty="Nothing else due today." viewAll="/dashboard/tasks?view=today" onComplete={completeTask} /> : null}
                {showActivities ? <DayCard title="Follow-ups due" section={followUps} empty="No follow-ups due." viewAll="/dashboard/activities?by=me" /> : null}
                {showLeads ? <DayCard title="New leads this week" section={newLeads} empty="No new leads assigned to you this week." viewAll={`/dashboard/leads?sort=-createdAt&filters=${encodeFilters([{ field: "ownerId", operator: "equals", value: user?.id ?? "" }])}`} /> : null}
                {opportunitiesEnabled ? (
                    <DayCard title="My open pipeline" section={pipeline} empty="No open opportunities." viewAll={`/dashboard/opportunities?view=OPEN&sort=expectedCloseDate&filters=${encodeFilters([{ field: "ownerId", operator: "equals", value: user?.id ?? "" }])}`} />
                ) : null}
            </div>
        </div>
    );
}

function DayCard({ title, section, empty, viewAll, tone, onComplete }: {
    title: string;
    section: Section;
    empty: string;
    viewAll: string;
    tone?: "danger";
    onComplete?: (taskId: string, title: string) => void;
}) {
    const headingId = `my-day-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
    return (
        <Card className="gap-0 py-0" aria-labelledby={headingId}>
            <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
                <h3 id={headingId} className="text-sm font-semibold">{title}</h3>
                {section ? <span className={cn("text-sm tabular-nums", tone === "danger" && section.total > 0 ? "text-destructive" : "text-muted-foreground")}>{formatCount(section.total)}</span> : null}
            </div>
            {section === null ? (
                <div className="space-y-2 p-4" aria-busy="true">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-9" />)}</div>
            ) : section.rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
            ) : (
                <ul className="divide-y">
                    {section.rows.map((row) => (
                        <li key={row.id} className="flex min-w-0 items-center gap-1 px-2">
                            {row.taskId && onComplete ? (
                                <IconButton label={`Complete ${row.title}`} className="shrink-0 text-muted-foreground" onClick={() => onComplete(row.taskId!, row.title)}>
                                    <CheckCircle2 className="size-4" />
                                </IconButton>
                            ) : null}
                            <Link href={row.href} className={cn("block min-w-0 flex-1 rounded-sm py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !row.taskId && "px-2")}>
                                <span className="block truncate text-sm font-medium">{row.title}</span>
                                <span className="flex min-w-0 gap-2 text-xs text-muted-foreground">
                                    {row.detail ? <span className="truncate">{row.detail}</span> : null}
                                    {row.meta ? <span className={cn("ml-auto shrink-0", row.urgent && "text-destructive")}>{row.meta}</span> : null}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            {section && section.total > section.rows.length ? (
                <Link href={viewAll} className="flex items-center justify-center gap-1 border-t px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    View all {formatCount(section.total)}<ArrowRight className="size-3.5" aria-hidden />
                </Link>
            ) : null}
        </Card>
    );
}

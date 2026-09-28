"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useRetainedEditorDraft } from "@/providers/editor-draft-provider";
import { useEditorDismissGuard } from "@/hooks/use-editor-dismiss-guard";
import { StandardDialog } from "@/components/common/standard-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { formatWorkspaceDateTime, formatWorkspaceDateTimeInput, workspaceDateTimeInputToIso } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit3, Inbox, ListChecks, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { TaskChecklistDependenciesPanel } from "@/components/tasks/task-checklist-dependencies-panel";
import { TaskRecurrenceEscalationFields, type RecurrenceRule } from "@/components/tasks/task-recurrence-escalation-fields";
import { NextBestActionPanel } from "@/components/next-best-action/nba-panel";
import { getFavoriteRecords, recordRecentView, toggleFavoriteRecord } from "@/lib/recent-records";
import { getSavedViewMode, saveViewMode } from "@/lib/workspace-layout";
import { RecordPreviewPopover } from "@/components/common/record-preview-popover";

type Task = {
    id: string;
    title: string;
    description: string | null;
    status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    ownerId: string;
    leadId: string | null;
    opportunityId: string | null;
    activityId: string | null;
    dueAt: string | null;
    reminderAt: string | null;
    completedAt: string | null;
    metadata?: { comments?: Array<{ body: string; createdAt: string }> } | null;
    owner?: { name?: string | null; email?: string | null } | null;
    lead?: { name?: string | null; email?: string | null; company?: string | null } | null;
    opportunity?: { title?: string | null } | null;
    activity?: { notes?: string | null; outcome?: string | null } | null;
    parentTaskId?: string | null;
    requireCompletionNote?: boolean;
    completionNote?: string | null;
    checklist?: Array<{ id: string; title: string; isDone: boolean }>;
    blockedBy?: Array<{ taskId: string; title: string; status: string }>;
    isBlocked?: boolean;
    subtaskCount?: number;
    recurrenceRule?: RecurrenceRule | null;
    seriesId?: string | null;
    escalateAfterMinutes?: number | null;
    escalateToUserId?: string | null;
    slaTarget?: string | null;
    slaStatus?: "PENDING" | "MET" | "BREACHED" | null;
    queueId?: string | null;
    queuedAt?: string | null;
    claimedBy?: string | null;
};

function taskSlaBadge(task: Task) {
    const isOpen = task.status !== "COMPLETED" && task.status !== "CANCELLED";
    const breached = task.slaStatus === "BREACHED" || (isOpen && !!task.slaTarget && new Date(task.slaTarget).getTime() < Date.now());
    if (breached) {
        return (
            <Badge variant="destructive" className="rounded-md text-[0.65rem] font-semibold">
                <AlertTriangle className="size-3" />
                SLA Breached
            </Badge>
        );
    }
    if (task.slaStatus === "MET") {
        return <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">SLA Met</Badge>;
    }
    return null;
}

type UserOption = { id: string; name?: string | null; email?: string | null };
type LeadOption = { id: string; name?: string | null; email?: string | null; company?: string | null };
type OpportunityOption = { id: string; title?: string | null; leadId?: string | null };
type ActivityOption = {
    id: string;
    typeId?: string | null;
    leadId?: string | null;
    opportunityId?: string | null;
    outcome?: string | null;
    notes?: string | null;
    createdAt?: string | null;
    type?: { name?: string | null } | null;
    lead?: { name?: string | null; email?: string | null } | null;
    opportunity?: { title?: string | null } | null;
};

const EMPTY_FORM = {
    title: "",
    description: "",
    status: "OPEN" as Task["status"],
    priority: "MEDIUM" as Task["priority"],
    ownerId: "",
    leadId: "",
    opportunityId: "",
    activityId: "",
    dueAt: "",
    reminderAt: "",
    comment: "",
    recurrenceRule: null as RecurrenceRule | null,
    escalateAfterMinutes: null as number | null,
    escalateToUserId: null as string | null,
};

const STATUS_OPTIONS = [
    { value: "OPEN", label: "Open" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "URGENT", label: "Urgent" },
];

const QUICK_FILTERS = [
    { value: "ALL", label: "All" },
    { value: "today", label: "Today" },
    { value: "overdue", label: "Overdue" },
    { value: "upcoming", label: "Upcoming" },
    { value: "completed", label: "Completed" },
];

function toLocalInputValue(value: string | null) {
    return formatWorkspaceDateTimeInput(value);
}

function fromLocalInputValue(value: string) {
    return workspaceDateTimeInputToIso(value);
}

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
    const [leads, setLeads] = useState<LeadOption[]>([]);
    const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
    const [activities, setActivities] = useState<ActivityOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [quickFilter, setQuickFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [priorityFilter, setPriorityFilter] = useState("ALL");
    const [ownerFilter, setOwnerFilter] = useState("ALL");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [initialForm, setInitialForm] = useState(EMPTY_FORM);
    const draftKey = editingTask ? `task:edit:${editingTask.id}` : `task:new:${JSON.stringify([initialForm.leadId, initialForm.opportunityId])}`;
    const { draft: taskDraft, current: currentTaskDraft, update: updateTaskDraft } = useRetainedEditorDraft(draftKey);
    const form: typeof EMPTY_FORM = taskDraft.values?.form ?? initialForm;
    const setForm = (action: React.SetStateAction<typeof EMPTY_FORM>) => {
        const previous = currentTaskDraft().values?.form ?? initialForm;
        const next = typeof action === "function" ? action(previous) : action;
        const dirty = JSON.stringify(next) !== JSON.stringify(initialForm);
        updateTaskDraft({ values: dirty ? { form: next } : null, dirty });
    };
    const taskVersion = useRef(0);
    useEffect(() => { taskVersion.current += 1; return () => { taskVersion.current += 1; }; }, [draftKey]);
    const canCloseEditor = useEditorDismissGuard(dialogOpen && taskDraft.dirty, dialogOpen && taskDraft.pending, () => updateTaskDraft({ values: null, dirty: false, error: "" }));
    const closeEditor = () => { if (canCloseEditor()) setDialogOpen(false); };
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [viewMode, setViewModeState] = useState<"list" | "calendar">(() => {
        const saved = getSavedViewMode("tasks");
        return saved === "calendar" ? "calendar" : "list";
    });
    const setViewMode = (mode: "list" | "calendar") => {
        setViewModeState(mode);
        saveViewMode("tasks", mode);
    };
    const [favoriteTaskIds, setFavoriteTaskIds] = useState<string[]>([]);

    useEffect(() => {
        setFavoriteTaskIds(getFavoriteRecords().filter((record) => record.type === "task").map((record) => record.id));
    }, []);

    const toggleFavoriteTask = (task: Task) => {
        const updated = toggleFavoriteRecord("task", task.id, task.title);
        setFavoriteTaskIds(updated.filter((record) => record.type === "task").map((record) => record.id));
    };
    const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("week");
    const [bulkOwnerId, setBulkOwnerId] = useState("");
    const [bulkDueAt, setBulkDueAt] = useState("");

    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams();
            if (quickFilter !== "ALL") params.set("due", quickFilter);
            if (statusFilter !== "ALL") params.set("status", statusFilter);
            if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
            if (ownerFilter !== "ALL") params.set("ownerId", ownerFilter);
            const data = await apiFetch<Task[]>(`/tasks${params.toString() ? `?${params.toString()}` : ""}`);
            setTasks(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load tasks");
            setFetchError(error.message || "Failed to load tasks.");
        } finally {
            setLoading(false);
        }
    }, [ownerFilter, priorityFilter, quickFilter, statusFilter]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Keep the open edit dialog's task snapshot in sync whenever the list refetches (e.g.
    // after toggling a checklist item or saving dependencies from within the dialog itself).
    useEffect(() => {
        if (!editingTask) return;
        const fresh = tasks.find((task) => task.id === editingTask.id);
        if (fresh && fresh !== editingTask) setEditingTask(fresh);
    }, [tasks, editingTask]);

    const siblingTasksForEditingTask = useMemo(() => {
        if (!editingTask) return [];
        return tasks.filter((task) =>
            task.id !== editingTask.id &&
            ((editingTask.leadId && task.leadId === editingTask.leadId) ||
                (editingTask.opportunityId && task.opportunityId === editingTask.opportunityId))
        );
    }, [tasks, editingTask]);

    useEffect(() => {
        apiFetch<UserOption[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any>("/teams").then((data) => setTeams(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any>("/leads?limit=200")
            .then((response) => setLeads(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []))
            .catch(() => setLeads([]));
        apiFetch<any>("/opportunities?limit=200")
            .then((response) => setOpportunities(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []))
            .catch(() => setOpportunities([]));
        apiFetch<any>("/activities?limit=300")
            .then((response) => setActivities(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []))
            .catch(() => setActivities([]));
    }, []);

    const activityOptions = useMemo(() => {
        return activities.filter((activity) => {
            if (form.opportunityId && activity.opportunityId !== form.opportunityId) return false;
            if (!form.opportunityId && form.leadId && activity.leadId !== form.leadId) return false;
            return true;
        });
    }, [activities, form.leadId, form.opportunityId]);

    const formatActivityLabel = (activity: ActivityOption) => {
        const type = activity.type?.name || "Activity";
        const related = activity.opportunity?.title || activity.lead?.name || activity.lead?.email;
        const date = activity.createdAt ? formatWorkspaceDateTime(activity.createdAt) : "";
        return [type, related, date].filter(Boolean).join(" - ");
    };

    const stats = useMemo(() => {
        const now = Date.now();
        return {
            open: tasks.filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED").length,
            overdue: tasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < now && task.status !== "COMPLETED").length,
            completed: tasks.filter((task) => task.status === "COMPLETED").length,
        };
    }, [tasks]);

    const totalPages = Math.max(1, Math.ceil(tasks.length / paginationModel.pageSize));
    const pageStart = paginationModel.page * paginationModel.pageSize;
    const pageEnd = pageStart + paginationModel.pageSize;
    const currentPageTasks = useMemo(
        () => tasks.slice(pageStart, pageEnd),
        [pageEnd, pageStart, tasks]
    );
    const currentPageIds = useMemo(() => currentPageTasks.map((task) => task.id), [currentPageTasks]);

    useEffect(() => {
        setPaginationModel((current) => ({ ...current, page: 0 }));
        setSelectedTaskIds([]);
    }, [ownerFilter, priorityFilter, quickFilter, statusFilter]);

    const toggleTaskSelection = (taskId: string, checked: boolean) => {
        setSelectedTaskIds((current) => {
            if (checked) return Array.from(new Set([...current, taskId]));
            return current.filter((id) => id !== taskId);
        });
    };

    const openCreate = () => {
        setEditingTask(null);
        setInitialForm(EMPTY_FORM);
        setDialogOpen(true);
    };

    // Lets the global command palette's "Create Task" command, and the global create menu's
    // contextual "New Task" (header.tsx, from a Lead/Opportunity detail page), open the real
    // creation dialog pre-linked to that record -- read via window.location, not next/
    // navigation's useSearchParams, matching this app's existing convention (views/page.tsx)
    // since this page isn't wrapped in a Suspense boundary.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("create") === "1") {
            openCreate();
            const leadId = params.get("leadId");
            const opportunityId = params.get("opportunityId");
            if (leadId || opportunityId) {
                setInitialForm((current) => ({ ...current, leadId: leadId ?? current.leadId, opportunityId: opportunityId ?? current.opportunityId }));
            }
        }
        // "Quick-open from command palette" / recent-records deep link (gap checklist's
        // "recent/favorite records" item) -- Tasks has no per-record detail route, so opening a
        // specific task means fetching it and opening the existing edit dialog, same as the
        // Edit button on each row already does.
        const taskId = params.get("taskId");
        if (taskId) {
            apiFetch<Task>(`/tasks/${taskId}`).then(openEdit).catch(() => toast.error("Failed to load task"));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openEdit = (task: Task) => {
        recordRecentView("task", task.id, task.title);
        setEditingTask(task);
        setInitialForm({
            title: task.title,
            description: task.description ?? "",
            status: task.status,
            priority: task.priority,
            ownerId: task.ownerId,
            leadId: task.leadId ?? "",
            opportunityId: task.opportunityId ?? "",
            activityId: task.activityId ?? "",
            dueAt: toLocalInputValue(task.dueAt),
            reminderAt: toLocalInputValue(task.reminderAt),
            comment: "",
            recurrenceRule: task.recurrenceRule ?? null,
            escalateAfterMinutes: task.escalateAfterMinutes ?? null,
            escalateToUserId: task.escalateToUserId ?? null,
        });
        setDialogOpen(true);
    };

    useEffect(() => {
        if (!taskDraft.savedValues || taskDraft.pending) return;
        updateTaskDraft({ savedValues: null, values: null, dirty: false, error: "" });
        setDialogOpen(false);
        toast.success("Your previous task save completed successfully");
        fetchTasks();
    }, [taskDraft.savedValues, taskDraft.pending, updateTaskDraft, fetchTasks]);

    const saveTask = async () => {
        if (currentTaskDraft().pending || !form.title.trim()) return;
        const version = taskVersion.current;
        updateTaskDraft({ pending: true, error: "" });
        try {
            const payload = {
                ...form,
                ownerId: form.ownerId || undefined,
                leadId: form.leadId || null,
                opportunityId: form.opportunityId || null,
                activityId: form.activityId || null,
                dueAt: fromLocalInputValue(form.dueAt),
                reminderAt: fromLocalInputValue(form.reminderAt),
                metadata: form.comment.trim()
                    ? {
                        ...(editingTask?.metadata ?? {}),
                        comments: [
                            ...(editingTask?.metadata?.comments ?? []),
                            { body: form.comment.trim(), createdAt: new Date().toISOString() },
                        ],
                    }
                    : editingTask?.metadata,
            };
            const saved = await apiFetch<Task>(editingTask ? `/tasks/${editingTask.id}` : "/tasks", {
                method: editingTask ? "PATCH" : "POST",
                body: JSON.stringify(payload),
            });
            updateTaskDraft({ values: null, dirty: false, error: "", savedValues: version === taskVersion.current ? null : saved });
            if (version !== taskVersion.current) return;
            toast.success(editingTask ? "Task updated" : "Task created");
            setDialogOpen(false);
            fetchTasks();
        } catch (error: any) {
            updateTaskDraft({ error: error.message || "Failed to save task. Your draft is still here." });
        } finally {
            updateTaskDraft({ pending: false });
        }
    };

    const skipTaskOccurrence = async (task: Task) => {
        try {
            const result = await apiFetch<{ nextTask?: Task | null }>(`/tasks/${task.id}/skip`, { method: "POST" });
            toast.success(result.nextTask ? "Skipped -- next occurrence created" : "Task skipped");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to skip task");
        }
    };

    const updateTaskStatus = async (task: Task, status: Task["status"]) => {
        try {
            await apiFetch(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            toast.success(status === "COMPLETED" ? "Task completed" : "Task updated");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to update task");
        }
    };

    const updateTaskDueAt = async (task: Task, dueAt: string | null) => {
        try {
            await apiFetch(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ dueAt }) });
            toast.success("Task rescheduled");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to reschedule task");
        }
    };

    const handleBulkDelete = async () => {
        if (!selectedTaskIds.length) return;
        if (!confirm(`Are you sure you want to delete ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? "" : "s"}?`)) return;
        try {
            await Promise.all(selectedTaskIds.map((id) => apiFetch(`/tasks/${id}`, { method: "DELETE" })));
            toast.success(`${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? "" : "s"} deleted`);
            setSelectedTaskIds([]);
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete selected tasks");
        }
    };

    const bulkUpdateTasks = async (patch: { status?: Task["status"]; ownerId?: string | null; dueAt?: string | null }) => {
        if (!selectedTaskIds.length) return;
        try {
            const result = await apiFetch<{ updated?: Task[]; skipped?: number }>("/tasks", {
                method: "PATCH",
                body: JSON.stringify({ ids: selectedTaskIds, ...patch }),
            });
            toast.success(`${result.updated?.length ?? 0} task${(result.updated?.length ?? 0) === 1 ? "" : "s"} updated`);
            setSelectedTaskIds([]);
            setBulkOwnerId("");
            setBulkDueAt("");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to update selected tasks");
        }
    };

    const deleteTask = async (task: Task) => {
        if (!confirm(`Delete task "${task.title}"?`)) return;
        try {
            await apiFetch(`/tasks/${task.id}`, { method: "DELETE" });
            toast.success("Task deleted");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete task");
        }
    };

    const sendTaskToQueue = async (task: Task, queueId: string) => {
        try {
            await apiFetch(`/tasks/${task.id}/queue`, { method: "POST", body: JSON.stringify({ queueId }) });
            toast.success("Task sent to queue");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to send task to queue");
        }
    };

    const claimTask = async (task: Task) => {
        try {
            await apiFetch(`/tasks/${task.id}/claim`, { method: "POST" });
            toast.success("Task claimed");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to claim task");
        }
    };

    const unclaimTask = async (task: Task) => {
        try {
            await apiFetch(`/tasks/${task.id}/unclaim`, { method: "POST" });
            toast.success("Task unclaimed");
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to unclaim task");
        }
    };

    return (
        <div className="mx-auto min-w-0 max-w-[1400px]">
            <PageHeader title="Tasks" description="Manage follow-ups, reminders, and work linked to your CRM records." actions={<>

                    <QueueExportButton
                        moduleName="TASKS"
                        filters={{
                            due: quickFilter !== "ALL" ? quickFilter : null,
                            status: statusFilter !== "ALL" ? statusFilter : null,
                            priority: priorityFilter !== "ALL" ? priorityFilter : null,
                            ownerId: ownerFilter !== "ALL" ? ownerFilter : null,
                        }}
                        selectedIds={selectedTaskIds}
                        currentPageIds={currentPageIds}
                        totalItems={tasks.length}
                    />
                    <Button variant="outline" onClick={fetchTasks}>
                        <RefreshCw className="size-4" />
                        Refresh
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/tasks/queues">
                            <Inbox className="size-4" />
                            Team Queues
                        </Link>
                    </Button>
                    <Button onClick={openCreate}>
                        <Plus className="size-4" />
                        New Task
                    </Button>
                            </>} />

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-3">
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Open Work</p>
                    <p className="mt-2 text-2xl font-extrabold">{loading || fetchError ? "—" : stats.open}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Overdue</p>
                    <p className="mt-2 text-2xl font-extrabold text-destructive">{loading || fetchError ? "—" : stats.overdue}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Completed</p>
                    <p className="mt-2 text-2xl font-extrabold text-primary">{loading || fetchError ? "—" : stats.completed}</p>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
                <div className="flex max-w-full flex-wrap rounded-md border bg-background p-1">
                    <Button
                        type="button"
                        size="sm"
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        aria-pressed={viewMode === "list"}
                        onClick={() => setViewMode("list")}
                    >
                        <ListChecks className="size-4" />
                        List
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={viewMode === "calendar" ? "secondary" : "ghost"}
                        aria-pressed={viewMode === "calendar"}
                        onClick={() => setViewMode("calendar")}
                    >
                        <CalendarDays className="size-4" />
                        Calendar
                    </Button>
                </div>
                <div className="min-w-0 flex-1 basis-52 space-y-1">
                    <Label htmlFor="task-filter-quickFilter">Due range</Label>
                <Select value={quickFilter} onValueChange={setQuickFilter}>
                    <SelectTrigger id="task-filter-quickFilter" className="w-full min-h-9 h-auto data-[size=default]:h-auto whitespace-normal text-left [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:break-words [&_[data-slot=select-value]]:whitespace-normal"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {QUICK_FILTERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
                <div className="min-w-0 flex-1 basis-52 space-y-1">
                    <Label htmlFor="task-filter-statusFilter">Task status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="task-filter-statusFilter" className="w-full min-h-9 h-auto data-[size=default]:h-auto whitespace-normal text-left [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:break-words [&_[data-slot=select-value]]:whitespace-normal"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All statuses</SelectItem>
                        {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
                <div className="min-w-0 flex-1 basis-52 space-y-1">
                    <Label htmlFor="task-filter-priorityFilter">Task priority</Label>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger id="task-filter-priorityFilter" className="w-full min-h-9 h-auto data-[size=default]:h-auto whitespace-normal text-left [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:break-words [&_[data-slot=select-value]]:whitespace-normal"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All priorities</SelectItem>
                        {PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
                <div className="min-w-0 flex-1 basis-52 space-y-1">
                    <Label htmlFor="task-filter-ownerFilter">Task owner</Label>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger id="task-filter-ownerFilter" className="w-full min-h-9 h-auto data-[size=default]:h-auto whitespace-normal text-left [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:break-words [&_[data-slot=select-value]]:whitespace-normal"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All owners</SelectItem>
                        {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                </div>
            </div>

            {selectedTaskIds.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm">
                        <span className="font-extrabold">{selectedTaskIds.length}</span>
                        <span className="text-muted-foreground"> selected</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => bulkUpdateTasks({ status: "COMPLETED" })}>
                            <CheckCircle2 className="size-4" />
                            Complete
                        </Button>
                        <Select value={bulkOwnerId || "__none__"} onValueChange={(value) => setBulkOwnerId(value === "__none__" ? "" : value)}>
                            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Reassign owner" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">Choose owner</SelectItem>
                                {users.map((user) => (
                                    <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" disabled={!bulkOwnerId} onClick={() => bulkUpdateTasks({ ownerId: bulkOwnerId })}>Reassign</Button>
                        <Input aria-label="Bulk due date" className="h-9 w-[210px]" type="datetime-local" value={bulkDueAt} onChange={(event) => setBulkDueAt(event.target.value)} />
                        <Button size="sm" variant="outline" disabled={!bulkDueAt} onClick={() => bulkUpdateTasks({ dueAt: fromLocalInputValue(bulkDueAt) })}>Reschedule</Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleBulkDelete}>
                            <Trash2 className="size-4" />
                            Delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedTaskIds([])}>Clear</Button>
                    </div>
                </div>
            ) : null}

            <div className="mt-4">
                {loading ? (
                    <TableSkeleton rows={5} columns={4} />
                ) : fetchError ? (
                    <ErrorState description={fetchError} onRetry={fetchTasks} />
                ) : tasks.length === 0 ? (
                    <EmptyState
                        icon={<CheckCircle2 className="size-12 text-muted-foreground opacity-50" />}
                        title="No tasks found"
                        description="Create a task or adjust filters to see upcoming work."
                        action={<Button onClick={openCreate}><Plus className="size-4" />New Task</Button>}
                    />
                ) : viewMode === "calendar" ? (
                    <TaskCalendar
                        tasks={tasks}
                        mode={calendarMode}
                        onModeChange={setCalendarMode}
                        onEdit={openEdit}
                        onComplete={(task) => updateTaskStatus(task, "COMPLETED")}
                        onReschedule={updateTaskDueAt}
                    />
                ) : (
                    <div className="space-y-2">
                        {currentPageTasks.map((task) => (
                            <div key={task.id} className="rounded-xl border bg-card p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="flex min-w-0 gap-3">
                                        <Checkbox
                                            className="mt-0.5"
                                            checked={selectedTaskIds.includes(task.id)}
                                            onCheckedChange={(value) => toggleTaskSelection(task.id, !!value)}
                                            aria-label={`Select ${task.title}`}
                                        />
                                        <div className="min-w-0 break-words">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className={cn("min-w-0 max-w-full break-words text-sm font-bold", task.status === "COMPLETED" && "text-muted-foreground line-through")}>{task.title}</h2>
                                            <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">{task.status.replace("_", " ")}</Badge>
                                            <Badge variant={task.priority === "URGENT" || task.priority === "HIGH" ? "destructive" : "secondary"} className="rounded-md text-[0.65rem] font-semibold">
                                                {task.priority}
                                            </Badge>
                                            {task.isBlocked && (
                                                <Badge variant="destructive" className="rounded-md text-[0.65rem] font-semibold">
                                                    <AlertTriangle className="size-3" />
                                                    Blocked
                                                </Badge>
                                            )}
                                            {task.checklist?.length ? (
                                                <Badge variant="outline" className="rounded-md text-[0.65rem]">
                                                    {task.checklist.filter((item) => item.isDone).length}/{task.checklist.length}
                                                </Badge>
                                            ) : null}
                                            {taskSlaBadge(task)}
                                            {task.queueId && !task.claimedBy ? (
                                                <Badge variant="secondary" className="rounded-md text-[0.65rem]">Unclaimed in queue</Badge>
                                            ) : null}
                                        </div>
                                        {task.description ? <p className="mt-1 text-xs text-muted-foreground">{task.description}</p> : null}
                                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span>Owner: {task.owner?.name || task.owner?.email || "Unknown user"}</span>
                                            {task.dueAt ? <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{formatWorkspaceDateTime(task.dueAt)}</span> : null}
                                            {task.reminderAt ? <span className="inline-flex items-center gap-1"><Clock className="size-3" />Reminder {formatWorkspaceDateTime(task.reminderAt)}</span> : null}
                                            {task.lead && task.leadId ? (
                                                <RecordPreviewPopover entityType="lead" entityId={task.leadId}>
                                                    <button type="button" className="min-w-0 max-w-full break-all text-left underline decoration-dotted underline-offset-2 hover:text-foreground">
                                                        Lead: {task.lead.name}
                                                    </button>
                                                </RecordPreviewPopover>
                                            ) : null}
                                            {task.opportunity && task.opportunityId ? (
                                                <RecordPreviewPopover entityType="opportunity" entityId={task.opportunityId}>
                                                    <button type="button" className="min-w-0 max-w-full break-all text-left underline decoration-dotted underline-offset-2 hover:text-foreground">
                                                        Opportunity: {task.opportunity.title}
                                                    </button>
                                                </RecordPreviewPopover>
                                            ) : null}
                                        </div>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                                        {task.status !== "COMPLETED" ? (
                                            <Button size="sm" variant="outline" onClick={() => updateTaskStatus(task, "COMPLETED")}>
                                                <CheckCircle2 className="size-4" />
                                                Complete
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="outline" onClick={() => updateTaskStatus(task, "OPEN")}>Reopen</Button>
                                        )}
                                        {task.recurrenceRule && task.status !== "COMPLETED" && task.status !== "CANCELLED" && (
                                            <Button size="sm" variant="ghost" onClick={() => skipTaskOccurrence(task)}>Skip</Button>
                                        )}
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            onClick={() => toggleFavoriteTask(task)}
                                            aria-label={favoriteTaskIds.includes(task.id) ? `Unfavorite ${task.title}` : `Favorite ${task.title}`}
                                        >
                                            <Star className={cn("size-4", favoriteTaskIds.includes(task.id) ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                                        </Button>
                                        <Button size="icon-sm" variant="ghost" onClick={() => openEdit(task)} aria-label={`Edit ${task.title}`}>
                                            <Edit3 className="size-4" />
                                        </Button>
                                        <Button size="icon-sm" variant="ghost" onClick={() => deleteTask(task)} aria-label={`Delete ${task.title}`}>
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="flex flex-col gap-3 rounded-xl border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>Rows per page</span>
                                <Select
                                    value={String(paginationModel.pageSize)}
                                    onValueChange={(value) => setPaginationModel({ page: 0, pageSize: Number(value) })}
                                >
                                    <SelectTrigger size="sm" className="w-[72px]" aria-label="Rows per page">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[10, 25, 50, 100].map((size) => (
                                            <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedTaskIds.length > 0 ? (
                                    <span className="text-primary">{selectedTaskIds.length} selected</span>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span>{tasks.length ? `${pageStart + 1}-${Math.min(pageEnd, tasks.length)} of ${tasks.length}` : ""}</span>
                                <div className="flex gap-1">
                                    <Button
                                        variant="outline"
                                        size="icon-sm"
                                        disabled={paginationModel.page === 0}
                                        onClick={() => setPaginationModel((current) => ({ ...current, page: Math.max(0, current.page - 1) }))}
                                        aria-label="Previous page"
                                    >
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon-sm"
                                        disabled={paginationModel.page + 1 >= totalPages}
                                        onClick={() => setPaginationModel((current) => ({ ...current, page: current.page + 1 }))}
                                        aria-label="Next page"
                                    >
                                        <ChevronRight className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <StandardDialog
                open={dialogOpen}
                onClose={closeEditor}
                title={editingTask ? "Edit Task" : "Create Task"}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" disabled={taskDraft.pending} onClick={closeEditor}>Cancel</Button>
                        <Button onClick={saveTask} disabled={taskDraft.pending || !form.title.trim()}>{taskDraft.pending ? "Saving…" : "Save Task"}</Button>
                    </>
                }
            >
                {taskDraft.dirty && <p role="status" className="mb-3 text-xs text-muted-foreground">This task draft is kept while you navigate in the app. Refreshing or signing out clears it.</p>}
                {taskDraft.error && <p role="alert" className="mb-3 break-words text-sm text-destructive">{taskDraft.error}</p>}
                <fieldset disabled={taskDraft.pending} className="min-w-0">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="task-edit-title">Title</Label>
                        <Input id="task-edit-title" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="task-edit-description">Description</Label>
                        <Input id="task-edit-description" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="task-edit-status">Status</Label>
                            <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as Task["status"] }))}>
                                <SelectTrigger id="task-edit-status" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="task-edit-priority">Priority</Label>
                            <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value as Task["priority"] }))}>
                                <SelectTrigger id="task-edit-priority" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="task-edit-owner">Owner</Label>
                            <Select value={form.ownerId || "__me__"} onValueChange={(value) => setForm((current) => ({ ...current, ownerId: value === "__me__" ? "" : value }))}>
                                <SelectTrigger id="task-edit-owner" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__me__">Me</SelectItem>
                                    {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="task-edit-due">Due</Label>
                            <Input id="task-edit-due" type="datetime-local" value={form.dueAt} onChange={(e) => setForm((current) => ({ ...current, dueAt: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="task-edit-reminder">Reminder</Label>
                            <Input id="task-edit-reminder" type="datetime-local" value={form.reminderAt} onChange={(e) => setForm((current) => ({ ...current, reminderAt: e.target.value }))} />
                        </div>
                    </div>
                    <TaskRecurrenceEscalationFields
                        value={{ recurrenceRule: form.recurrenceRule, escalateAfterMinutes: form.escalateAfterMinutes, escalateToUserId: form.escalateToUserId }}
                        onChange={(next) => setForm((current) => ({ ...current, ...next }))}
                        users={users}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="task-edit-lead">Lead</Label>
                            <Select
                                value={form.leadId || "__none__"}
                                onValueChange={(value) => setForm((current) => ({ ...current, leadId: value === "__none__" ? "" : value, activityId: "" }))}
                            >
                                <SelectTrigger id="task-edit-lead" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No lead</SelectItem>
                                    {leads.map((lead) => (
                                        <SelectItem key={lead.id} value={lead.id}>
                                            {lead.name || lead.email || lead.company || "Lead"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="task-edit-opportunity">Opportunity</Label>
                            <Select
                                value={form.opportunityId || "__none__"}
                                onValueChange={(value) => {
                                    const opportunity = opportunities.find((item) => item.id === value);
                                    setForm((current) => ({
                                        ...current,
                                        opportunityId: value === "__none__" ? "" : value,
                                        leadId: opportunity?.leadId || current.leadId,
                                        activityId: "",
                                    }));
                                }}
                            >
                                <SelectTrigger id="task-edit-opportunity" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No opportunity</SelectItem>
                                    {opportunities.map((opportunity) => (
                                        <SelectItem key={opportunity.id} value={opportunity.id}>
                                            {opportunity.title || "Opportunity"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="task-edit-activity">Related Activity</Label>
                        <Select
                            value={form.activityId || "__none__"}
                            onValueChange={(value) => setForm((current) => ({ ...current, activityId: value === "__none__" ? "" : value }))}
                        >
                            <SelectTrigger id="task-edit-activity" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">No activity</SelectItem>
                                {activityOptions.map((activity) => (
                                    <SelectItem key={activity.id} value={activity.id}>
                                        {formatActivityLabel(activity)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {editingTask ? (
                        <div className="rounded-xl border bg-surface-container-low p-3">
                            <p className="text-sm font-extrabold">Related Record Preview</p>
                            <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                                <span>Lead: {editingTask.lead?.name || editingTask.lead?.email || "None"}</span>
                                <span>Opportunity: {editingTask.opportunity?.title || "None"}</span>
                                <span>Activity: {editingTask.activity?.notes || editingTask.activity?.outcome || "None"}</span>
                            </div>
                            {editingTask.completedAt ? (
                                <p className="mt-2 text-xs text-muted-foreground">Completed {formatWorkspaceDateTime(editingTask.completedAt)}</p>
                            ) : null}
                            {editingTask.metadata?.comments?.length ? (
                                <div className="mt-3 space-y-1">
                                    <p className="text-xs font-bold uppercase text-muted-foreground">Comments</p>
                                    {editingTask.metadata.comments.slice(-3).map((comment, index) => (
                                        <p key={`${comment.createdAt}-${index}`} className="rounded-md bg-background px-2 py-1 text-xs">
                                            {comment.body}
                                        </p>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {editingTask && (editingTask.opportunityId || editingTask.leadId) ? (
                        // Prefer the Opportunity's recommendations when the task is linked to both
                        // -- more specific than the parent Lead's.
                        <NextBestActionPanel
                            recordType={editingTask.opportunityId ? "OPPORTUNITY" : "LEAD"}
                            recordId={(editingTask.opportunityId || editingTask.leadId) as string}
                            title="Recommended Next Actions"
                        />
                    ) : null}
                    <div className="space-y-2">
                        <Label htmlFor="task-edit-comment">{editingTask ? "Add Comment" : "Initial Comment"}</Label>
                        <Input id="task-edit-comment" value={form.comment} onChange={(e) => setForm((current) => ({ ...current, comment: e.target.value }))} />
                    </div>
                    {editingTask && (
                        <TaskChecklistDependenciesPanel task={editingTask} siblingTasks={siblingTasksForEditingTask} onRefresh={fetchTasks} />
                    )}
                    {editingTask && (
                        <div className="rounded-xl border p-3">
                            <p className="text-sm font-extrabold">Team Queue</p>
                            {editingTask.queueId ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Badge variant={editingTask.claimedBy ? "outline" : "secondary"} className="rounded-md text-[0.65rem]">
                                        {teams.find((team) => team.id === editingTask.queueId)?.name || "Queue"}
                                        {editingTask.claimedBy ? " - Claimed" : " - Unclaimed"}
                                    </Badge>
                                    {editingTask.claimedBy ? (
                                        <Button size="sm" variant="outline" onClick={() => unclaimTask(editingTask)}>Unclaim</Button>
                                    ) : (
                                        <Button size="sm" variant="outline" onClick={() => claimTask(editingTask)}>Claim</Button>
                                    )}
                                </div>
                            ) : (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <p className="text-xs text-muted-foreground">Not in a queue yet.</p>
                                    <Select onValueChange={(queueId) => sendTaskToQueue(editingTask, queueId)}>
                                        <SelectTrigger aria-label="Send task to queue" className="w-48" size="sm"><SelectValue placeholder="Send to queue..." /></SelectTrigger>
                                        <SelectContent>
                                            {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                </fieldset>
            </StandardDialog>
        </div>
    );
}

function TaskCalendar({
    tasks,
    mode,
    onModeChange,
    onEdit,
    onComplete,
    onReschedule,
}: {
    tasks: Task[];
    mode: "day" | "week" | "month";
    onModeChange: (mode: "day" | "week" | "month") => void;
    onEdit: (task: Task) => void;
    onComplete: (task: Task) => void;
    onReschedule: (task: Task, dueAt: string | null) => void;
}) {
    const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
    const lanes = useMemo(() => calendarLanes(tasks, mode), [mode, tasks]);
    const draggingTask = draggingTaskId ? tasks.find((task) => task.id === draggingTaskId) ?? null : null;
    return (
        <div className="@container/task-calendar min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
                <div>
                    <p className="text-sm font-extrabold">Calendar</p>
                    <p className="text-xs text-muted-foreground">Overdue tasks stay visible while current due work is grouped by the selected period.</p>
                </div>
                <div className="flex max-w-full flex-wrap rounded-md border bg-background p-1">
                    {(["day", "week", "month"] as const).map((item) => (
                        <Button
                            key={item}
                            type="button"
                            size="sm"
                            variant={mode === item ? "secondary" : "ghost"}
                            aria-pressed={mode === item}
                            onClick={() => onModeChange(item)}
                        >
                            {item[0].toUpperCase() + item.slice(1)}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 @min-[640px]/task-calendar:grid-cols-2 @min-[1100px]/task-calendar:grid-cols-4">
                {lanes.map((lane) => (
                    <div
                        key={lane.key}
                        className={cn("min-w-0 min-h-[220px] rounded-xl border bg-card p-3", lane.key === "overdue" && "border-destructive/35 bg-destructive/5")}
                        onDragOver={(event) => {
                            if (lane.startAt && draggingTask) event.preventDefault();
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            if (!lane.startAt || !draggingTask) return;
                            onReschedule(draggingTask, lane.startAt);
                            setDraggingTaskId(null);
                        }}
                    >
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-extrabold">{lane.label}</p>
                                <p className="text-xs text-muted-foreground">{lane.tasks.length} task{lane.tasks.length === 1 ? "" : "s"}</p>
                            </div>
                            {lane.key === "overdue" ? <Badge variant="destructive" className="rounded-md">Overdue</Badge> : null}
                        </div>
                        <div className="space-y-2">
                            {lane.tasks.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No tasks in this lane.</div>
                            ) : lane.tasks.map((task) => (
                                <div
                                    key={task.id}
                                    draggable={task.status !== "COMPLETED"}
                                    onDragStart={() => setDraggingTaskId(task.id)}
                                    onDragEnd={() => setDraggingTaskId(null)}
                                    className="min-w-0 w-full break-words rounded-lg border bg-background p-3 text-left transition-colors hover:bg-surface-container-low"
                                >
                                    <button type="button" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)} className="block w-full min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                        <p className={cn("min-w-0 max-w-full break-words text-sm font-bold", task.status === "COMPLETED" && "line-through text-muted-foreground")}>{task.title}</p>
                                        <Badge variant={task.priority === "URGENT" || task.priority === "HIGH" ? "destructive" : "secondary"} className="rounded-md text-[0.65rem]">
                                            {task.priority}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">{task.owner?.name || task.owner?.email || "Unassigned"}</p>
                                    {task.dueAt ? <p className="mt-1 text-xs text-muted-foreground">{formatWorkspaceDateTime(task.dueAt)}</p> : null}
                                    </button>
                                    {task.status !== "COMPLETED" ? (
                                        <Button type="button" variant="outline" size="sm" className="mt-2" aria-label={`Complete ${task.title}`} onClick={() => onComplete(task)}>Complete</Button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function calendarLanes(tasks: Task[], mode: "day" | "week" | "month") {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const activeTasks = tasks.filter((task) => task.status !== "CANCELLED");
    const overdue = activeTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < startToday.getTime() && task.status !== "COMPLETED");
    const upcoming = activeTasks.filter((task) => !overdue.some((item) => item.id === task.id));
    const periods = mode === "day" ? 3 : mode === "week" ? 4 : 4;
    const lanes = [{
        key: "overdue",
        label: "Overdue",
        tasks: overdue,
        startAt: null as string | null,
    }];
    for (let index = 0; index < periods; index += 1) {
        const start = new Date(startToday);
        if (mode === "day") start.setDate(start.getDate() + index);
        if (mode === "week") start.setDate(start.getDate() + index * 7);
        if (mode === "month") start.setMonth(start.getMonth() + index, 1);
        const end = new Date(start);
        if (mode === "day") end.setDate(end.getDate() + 1);
        if (mode === "week") end.setDate(end.getDate() + 7);
        if (mode === "month") end.setMonth(end.getMonth() + 1, 1);
        lanes.push({
            key: `${mode}-${index}`,
            label: mode === "day"
                ? start.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })
                : mode === "week"
                    ? `${start.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} - ${new Date(end.getTime() - 1).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}`
                    : start.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
            tasks: upcoming.filter((task) => {
                if (!task.dueAt) return index === periods - 1;
                const due = new Date(task.dueAt).getTime();
                return due >= start.getTime() && due < end.getTime();
            }),
            startAt: start.toISOString(),
        });
    }
    return lanes;
}

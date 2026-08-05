"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StandardDialog } from "@/components/common/standard-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { formatWorkspaceDateTime, formatWorkspaceDateTimeInput, workspaceDateTimeInputToIso } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit3, ListChecks, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QueueExportButton } from "@/components/exports/queue-export-button";

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
};

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
    const [form, setForm] = useState(EMPTY_FORM);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
    const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("week");
    const [bulkOwnerId, setBulkOwnerId] = useState("");
    const [bulkDueAt, setBulkDueAt] = useState("");

    const fetchTasks = useCallback(async () => {
        setLoading(true);
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
        } finally {
            setLoading(false);
        }
    }, [ownerFilter, priorityFilter, quickFilter, statusFilter]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    useEffect(() => {
        apiFetch<UserOption[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => undefined);
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
        setForm(EMPTY_FORM);
        setDialogOpen(true);
    };

    const openEdit = (task: Task) => {
        setEditingTask(task);
        setForm({
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
        });
        setDialogOpen(true);
    };

    const saveTask = async () => {
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
            await apiFetch(editingTask ? `/tasks/${editingTask.id}` : "/tasks", {
                method: editingTask ? "PATCH" : "POST",
                body: JSON.stringify(payload),
            });
            toast.success(editingTask ? "Task updated" : "Task created");
            setDialogOpen(false);
            fetchTasks();
        } catch (error: any) {
            toast.error(error.message || "Failed to save task");
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

    return (
        <div className="mx-auto max-w-[1400px] p-4 md:p-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                    <h1 className="text-lg font-extrabold tracking-tight">Tasks</h1>
                    <p className="mt-1 text-xs text-muted-foreground">Manage follow-ups, reminders, and CRM work linked to leads, opportunities, and activities.</p>
                </div>
                <div className="flex items-center gap-2">
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
                    <Button onClick={openCreate}>
                        <Plus className="size-4" />
                        New Task
                    </Button>
                </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Open Work</p>
                    <p className="mt-2 text-2xl font-extrabold">{stats.open}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Overdue</p>
                    <p className="mt-2 text-2xl font-extrabold text-destructive">{stats.overdue}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Completed</p>
                    <p className="mt-2 text-2xl font-extrabold text-primary">{stats.completed}</p>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
                <div className="flex rounded-md border bg-background p-1">
                    <Button
                        type="button"
                        size="sm"
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        onClick={() => setViewMode("list")}
                    >
                        <ListChecks className="size-4" />
                        List
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={viewMode === "calendar" ? "secondary" : "ghost"}
                        onClick={() => setViewMode("calendar")}
                    >
                        <CalendarDays className="size-4" />
                        Calendar
                    </Button>
                </div>
                <Select value={quickFilter} onValueChange={setQuickFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {QUICK_FILTERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All statuses</SelectItem>
                        {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All priorities</SelectItem>
                        {PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All owners</SelectItem>
                        {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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
                        <Input className="h-9 w-[210px]" type="datetime-local" value={bulkDueAt} onChange={(event) => setBulkDueAt(event.target.value)} />
                        <Button size="sm" variant="outline" disabled={!bulkDueAt} onClick={() => bulkUpdateTasks({ dueAt: fromLocalInputValue(bulkDueAt) })}>Reschedule</Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedTaskIds([])}>Clear</Button>
                    </div>
                </div>
            ) : null}

            <div className="mt-4">
                {loading ? (
                    <TableSkeleton rows={5} columns={4} />
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
                                        <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className={cn("text-sm font-bold", task.status === "COMPLETED" && "text-muted-foreground line-through")}>{task.title}</h2>
                                            <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">{task.status.replace("_", " ")}</Badge>
                                            <Badge variant={task.priority === "URGENT" || task.priority === "HIGH" ? "destructive" : "secondary"} className="rounded-md text-[0.65rem] font-semibold">
                                                {task.priority}
                                            </Badge>
                                        </div>
                                        {task.description ? <p className="mt-1 text-xs text-muted-foreground">{task.description}</p> : null}
                                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span>Owner: {task.owner?.name || task.owner?.email || "Unknown user"}</span>
                                            {task.dueAt ? <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{formatWorkspaceDateTime(task.dueAt)}</span> : null}
                                            {task.reminderAt ? <span className="inline-flex items-center gap-1"><Clock className="size-3" />Reminder {formatWorkspaceDateTime(task.reminderAt)}</span> : null}
                                            {task.lead ? <span>Lead: {task.lead.name}</span> : null}
                                            {task.opportunity ? <span>Opportunity: {task.opportunity.title}</span> : null}
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
                                    <SelectTrigger size="sm" className="w-[72px]">
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
                onClose={() => setDialogOpen(false)}
                title={editingTask ? "Edit Task" : "Create Task"}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={saveTask} disabled={!form.title.trim()}>Save Task</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as Task["status"] }))}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Priority</Label>
                            <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value as Task["priority"] }))}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Owner</Label>
                            <Select value={form.ownerId || "__me__"} onValueChange={(value) => setForm((current) => ({ ...current, ownerId: value === "__me__" ? "" : value }))}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__me__">Me</SelectItem>
                                    {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Due</Label>
                            <Input type="datetime-local" value={form.dueAt} onChange={(e) => setForm((current) => ({ ...current, dueAt: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Reminder</Label>
                            <Input type="datetime-local" value={form.reminderAt} onChange={(e) => setForm((current) => ({ ...current, reminderAt: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Lead</Label>
                            <Select
                                value={form.leadId || "__none__"}
                                onValueChange={(value) => setForm((current) => ({ ...current, leadId: value === "__none__" ? "" : value, activityId: "" }))}
                            >
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                            <Label>Opportunity</Label>
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
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                        <Label>Related Activity</Label>
                        <Select
                            value={form.activityId || "__none__"}
                            onValueChange={(value) => setForm((current) => ({ ...current, activityId: value === "__none__" ? "" : value }))}
                        >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                    <div className="space-y-2">
                        <Label>{editingTask ? "Add Comment" : "Initial Comment"}</Label>
                        <Input value={form.comment} onChange={(e) => setForm((current) => ({ ...current, comment: e.target.value }))} />
                    </div>
                </div>
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
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
                <div>
                    <p className="text-sm font-extrabold">Calendar</p>
                    <p className="text-xs text-muted-foreground">Overdue tasks stay visible while current due work is grouped by the selected period.</p>
                </div>
                <div className="flex rounded-md border bg-background p-1">
                    {(["day", "week", "month"] as const).map((item) => (
                        <Button
                            key={item}
                            type="button"
                            size="sm"
                            variant={mode === item ? "secondary" : "ghost"}
                            onClick={() => onModeChange(item)}
                        >
                            {item[0].toUpperCase() + item.slice(1)}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="grid gap-3 xl:grid-cols-4">
                {lanes.map((lane) => (
                    <div
                        key={lane.key}
                        className={cn("min-h-[220px] rounded-xl border bg-card p-3", lane.key === "overdue" && "border-destructive/35 bg-destructive/5")}
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
                                <button
                                    key={task.id}
                                    type="button"
                                    draggable={task.status !== "COMPLETED"}
                                    onDragStart={() => setDraggingTaskId(task.id)}
                                    onDragEnd={() => setDraggingTaskId(null)}
                                    onClick={() => onEdit(task)}
                                    className="w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-surface-container-low"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className={cn("text-sm font-bold", task.status === "COMPLETED" && "line-through text-muted-foreground")}>{task.title}</p>
                                        <Badge variant={task.priority === "URGENT" || task.priority === "HIGH" ? "destructive" : "secondary"} className="rounded-md text-[0.65rem]">
                                            {task.priority}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">{task.owner?.name || task.owner?.email || "Unassigned"}</p>
                                    {task.dueAt ? <p className="mt-1 text-xs text-muted-foreground">{formatWorkspaceDateTime(task.dueAt)}</p> : null}
                                    {task.status !== "COMPLETED" ? (
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            className="mt-2 inline-flex h-8 items-center rounded-md border px-2 text-xs font-semibold"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onComplete(task);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    onComplete(task);
                                                }
                                            }}
                                        >
                                            Complete
                                        </span>
                                    ) : null}
                                </button>
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

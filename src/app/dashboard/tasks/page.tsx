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
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit3, Plus, RefreshCw, Trash2 } from "lucide-react";
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
                </div>
            </StandardDialog>
        </div>
    );
}

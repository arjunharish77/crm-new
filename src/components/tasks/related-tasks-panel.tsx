"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { formatWorkspaceDateTime, formatWorkspaceDateTimeInput, workspaceDateTimeInputToIso } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { CalendarDays, CheckCircle2, Clock, Edit3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Task = {
    id: string;
    title: string;
    description: string | null;
    status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    ownerId: string;
    dueAt: string | null;
    reminderAt: string | null;
    leadId: string | null;
    opportunityId: string | null;
    activityId: string | null;
    owner?: { name?: string | null; email?: string | null } | null;
};

type UserOption = { id: string; name?: string | null; email?: string | null };

type RelatedTasksPanelProps = {
    leadId?: string | null;
    opportunityId?: string | null;
    activityId?: string | null;
    currentUserId?: string | null;
    title?: string;
};

const EMPTY_FORM = {
    title: "",
    description: "",
    status: "OPEN" as Task["status"],
    priority: "MEDIUM" as Task["priority"],
    ownerId: "",
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

function toLocalInputValue(value: string | null) {
    return formatWorkspaceDateTimeInput(value);
}

function fromLocalInputValue(value: string) {
    return workspaceDateTimeInputToIso(value);
}

export function RelatedTasksPanel({ leadId, opportunityId, activityId, currentUserId, title = "Tasks" }: RelatedTasksPanelProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);

    const queryString = useMemo(() => {
        const params = new URLSearchParams();
        if (leadId) params.set("leadId", leadId);
        if (opportunityId) params.set("opportunityId", opportunityId);
        if (activityId) params.set("activityId", activityId);
        return params.toString();
    }, [activityId, leadId, opportunityId]);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<Task[]>(`/tasks${queryString ? `?${queryString}` : ""}`);
            setTasks(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load tasks");
        } finally {
            setLoading(false);
        }
    }, [queryString]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    useEffect(() => {
        apiFetch<UserOption[]>("/users")
            .then((data) => setUsers(Array.isArray(data) ? data : []))
            .catch(() => setUsers([]));
    }, []);

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
                leadId: leadId || null,
                opportunityId: opportunityId || null,
                activityId: activityId || null,
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

    const openTasks = tasks.filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED").length;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-primary" />
                    <h3 className="text-base font-bold">{title}</h3>
                    <Badge variant="secondary" className="rounded-md text-[0.7rem]">{openTasks} open</Badge>
                </div>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    Task
                </Button>
            </div>

            {loading ? (
                <TableSkeleton rows={3} columns={2} />
            ) : tasks.length === 0 ? (
                <EmptyState title="No tasks yet" description="Create a follow-up task for this record." />
            ) : (
                <div className="space-y-2">
                    {tasks.map((task) => (
                        <div key={task.id} className="rounded-xl border bg-card p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className={cn("text-sm font-bold", task.status === "COMPLETED" && "text-muted-foreground line-through")}>{task.title}</p>
                                        <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">{task.status.replace("_", " ")}</Badge>
                                        <Badge variant={task.priority === "HIGH" || task.priority === "URGENT" ? "destructive" : "secondary"} className="rounded-md text-[0.65rem] font-semibold">{task.priority}</Badge>
                                    </div>
                                    {task.description ? <p className="mt-1 text-xs text-muted-foreground">{task.description}</p> : null}
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                        <span>Owner: {task.owner?.name || task.owner?.email || (task.ownerId === currentUserId ? "Me" : task.ownerId)}</span>
                                        {task.dueAt ? <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{formatWorkspaceDateTime(task.dueAt)}</span> : null}
                                        {task.reminderAt ? <span className="inline-flex items-center gap-1"><Clock className="size-3" />{formatWorkspaceDateTime(task.reminderAt)}</span> : null}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    {task.status !== "COMPLETED" ? (
                                        <Button size="sm" variant="outline" onClick={() => updateTaskStatus(task, "COMPLETED")}>Complete</Button>
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
                </div>
            )}

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
                        <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
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
                                    {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email || user.id}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Due</Label>
                            <Input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Reminder</Label>
                            <Input type="datetime-local" value={form.reminderAt} onChange={(event) => setForm((current) => ({ ...current, reminderAt: event.target.value }))} />
                        </div>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}

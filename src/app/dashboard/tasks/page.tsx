"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, CalendarDays, CheckCircle2, Inbox, ListChecks, MoreHorizontal, Pencil, Plus, RotateCcw, SkipForward, Star, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconButton } from "@/components/ui/icon-button";
import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRetainedEditorDraft } from "@/providers/editor-draft-provider";
import { useEditorDismissGuard } from "@/hooks/use-editor-dismiss-guard";
import { useUrlState } from "@/hooks/use-url-state";
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";
import { useAuth } from "@/providers/auth-provider";
import { StandardDialog } from "@/components/common/standard-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListToolbar } from "@/components/common/list-toolbar";
import { SelectionBar } from "@/components/common/selection-bar";
import { SegmentedControl } from "@/components/common/page-tabs";
import { RecordPicker } from "@/components/common/record-picker";
import { useConfirm } from "@/components/common/dialogs-provider";
import { formatWorkspaceDateParts, formatWorkspaceDateTime, formatWorkspaceDateTimeInput, formatWorkspaceTime, isPastDate, isWorkspaceToday, workspaceDateTimeInputToIso, workspaceDayStart } from "@/lib/date-format";
import { statusDisplay } from "@/lib/display/status";
import { formatCount } from "@/lib/display/format";
import { plural } from "@/lib/bulk-selection";
import { useRecordsChanged } from "@/lib/records-events";
import { cn } from "@/lib/utils";
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

type UserOption = { id: string; name?: string | null; email?: string | null };
type ActivityOption = {
    id: string;
    leadId?: string | null;
    opportunityId?: string | null;
    outcome?: string | null;
    notes?: string | null;
    createdAt?: string | null;
    type?: { name?: string | null } | null;
    lead?: { name?: string | null; email?: string | null } | null;
    opportunity?: { title?: string | null } | null;
};
type Paged<T> = { data: T[]; meta: { total: number; page: number; limit: number; last_page: number } };

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
    { value: "IN_PROGRESS", label: "In progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "URGENT", label: "Urgent" },
];

// Quick views (UI/UX plan §10.4): open work first, then due-based views.
const VIEWS = ["open", "overdue", "today", "upcoming", "completed", "all"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { open: "Open", overdue: "Overdue", today: "Due today", upcoming: "Upcoming", completed: "Completed", all: "All" };
const PRIORITIES = ["all", "URGENT", "HIGH", "MEDIUM", "LOW"] as const;

function isClosedTask(task: Task) {
    return task.status === "COMPLETED" || task.status === "CANCELLED";
}

function viewParams(view: View, params: URLSearchParams) {
    if (view === "open") params.set("open", "1");
    else if (view !== "all") params.set("due", view);
}

// Due as people read it: "Overdue · date", "Today, time", or the date and time.
function DueText({ task }: { task: Task }) {
    if (!task.dueAt) return <span className="text-muted-foreground">No due date</span>;
    if (!isClosedTask(task) && isPastDate(task.dueAt) && !isWorkspaceToday(task.dueAt)) {
        return <span className="text-destructive">Overdue · {formatWorkspaceDateTime(task.dueAt)}</span>;
    }
    if (isWorkspaceToday(task.dueAt)) {
        return <span className={cn(!isClosedTask(task) && isPastDate(task.dueAt) ? "text-destructive" : "text-foreground")}>Today, {formatWorkspaceTime(task.dueAt)}</span>;
    }
    return <span className="text-muted-foreground">{formatWorkspaceDateTime(task.dueAt)}</span>;
}

// Small flags next to the title, only when they matter.
function TaskFlags({ task }: { task: Task }) {
    const breached = task.slaStatus === "BREACHED" || (!isClosedTask(task) && !!task.slaTarget && isPastDate(task.slaTarget));
    const done = task.checklist?.filter((item) => item.isDone).length ?? 0;
    return (
        <>
            {task.isBlocked ? <Badge tone="danger">Blocked</Badge> : null}
            {breached ? <Badge tone="danger">SLA breached</Badge> : null}
            {task.checklist?.length ? <span className="text-xs tabular-nums text-muted-foreground">{done}/{task.checklist.length}</span> : null}
            {task.queueId && !task.claimedBy ? <Badge tone="neutral">Unclaimed</Badge> : null}
            {task.recurrenceRule ? <span className="text-xs text-muted-foreground">Repeats</span> : null}
        </>
    );
}

const TASK_SORTABLE = ["title", "dueAt", "priority", "owner", "status"];

export default function TasksPage() {
    const { user } = useAuth();
    const confirm = useConfirm();
    // An older list or count request can't land after a newer one.
    const nextListSignal = useAbortableRequest();
    const nextCountSignal = useAbortableRequest();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [counts, setCounts] = useState<Record<View, number | null>>({ open: null, overdue: null, today: null, upcoming: null, completed: null, all: null });
    const [users, setUsers] = useState<UserOption[]>([]);
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [search, setSearch] = useUrlState<string>("q", "");
    // Column sort, on the server (?sort=title or ?sort=-dueAt).
    const [sortParam, setSortParam] = useUrlState<string>("sort", "");
    const sort = useMemo(() => {
        const id = sortParam.replace(/^-/, "");
        return TASK_SORTABLE.includes(id) ? { id, desc: sortParam.startsWith("-") } : null;
    }, [sortParam]);
    const [view, setView] = useUrlState<View>("view", "open", { allowed: VIEWS });
    // "me" by default: the page opens on "My open tasks".
    const [owner, setOwner] = useUrlState<string>("owner", "me");
    const [priority, setPriority] = useUrlState<(typeof PRIORITIES)[number]>("priority", "all", { allowed: PRIORITIES });
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [viewMode, setViewModeState] = useState<"list" | "calendar">(() => (getSavedViewMode("tasks") === "calendar" ? "calendar" : "list"));
    const setViewMode = (mode: "list" | "calendar") => { setViewModeState(mode); saveViewMode("tasks", mode); };
    const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("week");
    const [favoriteTaskIds, setFavoriteTaskIds] = useState<string[]>([]);

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

    const [assignOpen, setAssignOpen] = useState(false);
    const [assignUserId, setAssignUserId] = useState<string | null>(null);
    const [rescheduleOpen, setRescheduleOpen] = useState(false);
    const [rescheduleAt, setRescheduleAt] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);

    useEffect(() => {
        setFavoriteTaskIds(getFavoriteRecords().filter((record) => record.type === "task").map((record) => record.id));
        apiFetch<UserOption[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any>("/teams").then((data) => setTeams(Array.isArray(data) ? data : [])).catch(() => undefined);
    }, []);

    const baseParams = useCallback(() => {
        const params = new URLSearchParams();
        if (owner !== "all") params.set("ownerId", owner);
        if (priority !== "all") params.set("priority", priority);
        if (search.trim()) params.set("q", search.trim());
        return params;
    }, [owner, priority, search]);
    const listParams = useCallback(() => {
        const params = baseParams();
        if (sort) {
            params.set("sort", sort.id);
            params.set("dir", sort.desc ? "desc" : "asc");
        }
        return params;
    }, [baseParams, sort]);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        const signal = nextListSignal();
        try {
            const params = listParams();
            // The calendar shows overdue and upcoming open work, so it always asks for open tasks.
            if (viewMode === "calendar") {
                params.set("open", "1");
                params.set("page", "1");
                params.set("limit", "200");
            } else {
                viewParams(view, params);
                params.set("page", String(paginationModel.page + 1));
                params.set("limit", String(paginationModel.pageSize));
            }
            const response = await apiFetch<Paged<Task>>(`/tasks?${params.toString()}`, { signal });
            setTasks(Array.isArray(response?.data) ? response.data : []);
            setTotalItems(Number(response?.meta?.total ?? 0));
        } catch (error: any) {
            if (isAbortError(error)) return;
            setFetchError(error?.message || "Tasks couldn't be loaded.");
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, [listParams, view, viewMode, paginationModel, nextListSignal]);

    const fetchCounts = useCallback(async () => {
        const signal = nextCountSignal();
        const entries = await Promise.all(VIEWS.map(async (value) => {
            try {
                const params = baseParams();
                viewParams(value, params);
                params.set("page", "1");
                params.set("limit", "1");
                const response = await apiFetch<Paged<Task>>(`/tasks?${params.toString()}`, { signal });
                return [value, Number(response?.meta?.total ?? 0)] as const;
            } catch {
                return [value, null] as const;
            }
        }));
        if (!signal.aborted) setCounts(Object.fromEntries(entries) as Record<View, number | null>);
    }, [baseParams, nextCountSignal]);

    const refresh = useCallback(() => { fetchTasks(); fetchCounts(); }, [fetchTasks, fetchCounts]);
    useEffect(() => { fetchTasks(); }, [fetchTasks]);
    useEffect(() => { fetchCounts(); }, [fetchCounts]);
    useRecordsChanged(["task"], refresh);

    const resetPaging = () => {
        setPaginationModel((current) => ({ ...current, page: 0 }));
        setSelectedTaskIds([]);
    };

    // Keep the open edit dialog's task snapshot in sync whenever the list refetches (e.g.
    // after toggling a checklist item or saving dependencies from within the dialog itself).
    useEffect(() => {
        if (!editingTask) return;
        const fresh = tasks.find((task) => task.id === editingTask.id);
        if (fresh && fresh !== editingTask) setEditingTask(fresh);
    }, [tasks, editingTask]);

    // The editor's sibling tasks (for dependencies) and activity options come from the server
    // for the linked record, not from whatever page of the list happens to be loaded.
    const [siblingTasks, setSiblingTasks] = useState<Task[]>([]);
    const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
    useEffect(() => {
        if (!dialogOpen) return;
        const field = form.opportunityId ? "opportunityId" : form.leadId ? "leadId" : null;
        const id = form.opportunityId || form.leadId;
        if (!field || !id) { setActivityOptions([]); setSiblingTasks([]); return; }
        let cancelled = false;
        const filters = JSON.stringify([{ logic: "AND", conditions: [{ field, operator: "equals", value: id }] }]);
        apiFetch<any>(`/activities?limit=50&filters=${encodeURIComponent(filters)}`)
            .then((response) => { if (!cancelled) setActivityOptions(Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []); })
            .catch(() => { if (!cancelled) setActivityOptions([]); });
        apiFetch<Task[]>(`/tasks?${field}=${encodeURIComponent(id)}`)
            .then((rows) => { if (!cancelled) setSiblingTasks(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (!cancelled) setSiblingTasks([]); });
        return () => { cancelled = true; };
    }, [dialogOpen, form.leadId, form.opportunityId]);
    const siblingTasksForEditingTask = useMemo(() => (editingTask ? siblingTasks.filter((task) => task.id !== editingTask.id) : []), [siblingTasks, editingTask]);

    const formatActivityLabel = (activity: ActivityOption) => {
        const type = activity.type?.name || "Activity";
        const related = activity.opportunity?.title || activity.lead?.name || activity.lead?.email;
        const date = activity.createdAt ? formatWorkspaceDateTime(activity.createdAt) : "";
        return [type, related, date].filter(Boolean).join(" · ");
    };

    const openCreate = () => {
        setEditingTask(null);
        setInitialForm(EMPTY_FORM);
        setDialogOpen(true);
    };

    const openEdit = useCallback((task: Task) => {
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
            dueAt: formatWorkspaceDateTimeInput(task.dueAt),
            reminderAt: formatWorkspaceDateTimeInput(task.reminderAt),
            comment: "",
            recurrenceRule: task.recurrenceRule ?? null,
            escalateAfterMinutes: task.escalateAfterMinutes ?? null,
            escalateToUserId: task.escalateToUserId ?? null,
        });
        setDialogOpen(true);
    }, []);

    // Deep links: the command palette's and the header Create menu's "?create=1" (optionally
    // pre-linked to a lead or opportunity), and "?taskId=" from recent records and
    // notifications, which opens that task's editor. Read via window.location, matching this
    // app's convention, since this page isn't wrapped in a Suspense boundary.
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
        const taskId = params.get("taskId");
        if (taskId) {
            apiFetch<Task>(`/tasks/${taskId}`).then(openEdit).catch(() => toast.error("That task couldn't be opened"));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!taskDraft.savedValues || taskDraft.pending) return;
        updateTaskDraft({ savedValues: null, values: null, dirty: false, error: "" });
        setDialogOpen(false);
        toast.success("Your earlier task save finished");
        refresh();
    }, [taskDraft.savedValues, taskDraft.pending, updateTaskDraft, refresh]);

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
                dueAt: workspaceDateTimeInputToIso(form.dueAt),
                reminderAt: workspaceDateTimeInputToIso(form.reminderAt),
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
            toast.success(editingTask ? "Task saved" : "Task created");
            setDialogOpen(false);
            refresh();
        } catch (error: any) {
            updateTaskDraft({ error: error.message || "The task couldn't be saved. Your draft is still here." });
        } finally {
            updateTaskDraft({ pending: false });
        }
    };

    const skipTaskOccurrence = async (task: Task) => {
        try {
            const result = await apiFetch<{ nextTask?: Task | null }>(`/tasks/${task.id}/skip`, { method: "POST" });
            toast.success(result.nextTask ? "Skipped; the next one is created" : "Task skipped");
            refresh();
        } catch (error: any) {
            toast.error(error.message || "Couldn't skip the task");
        }
    };

    // Complete with Undo (reopen), since it is one click from the list.
    // The row changes at once and goes back if saving fails; only the tab counts are reloaded
    // (round-2 plan P7: it used to wait for the server and then reload the whole list).
    const setTaskStatus = async (task: Task, status: Task["status"]) => {
        const optimistic = { status, completedAt: status === "COMPLETED" ? new Date().toISOString() : null };
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...optimistic } : item));
        try {
            await apiFetch(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            fetchCounts();
            toast.success(status === "COMPLETED" ? `Completed: ${task.title}` : `Reopened: ${task.title}`, {
                duration: 6000,
                action: status === "COMPLETED" ? {
                    label: "Undo",
                    onClick: async () => {
                        try {
                            await apiFetch(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: task.status }) });
                            refresh();
                        } catch {
                            toast.error("Couldn't undo");
                        }
                    },
                } : undefined,
            });
        } catch (error: any) {
            setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: task.status, completedAt: task.completedAt } : item));
            toast.error(error.message || "Couldn't update the task");
        }
    };

    const updateTaskDueAt = async (task: Task, dueAt: string | null) => {
        try {
            await apiFetch(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ dueAt }) });
            toast.success("Task rescheduled");
            refresh();
        } catch (error: any) {
            toast.error(error.message || "Couldn't reschedule the task");
        }
    };

    const deleteTasks = async (ids: string[], label: string) => {
        const ok = await confirm({
            title: `Delete ${label}?`,
            description: "Checklist items and comments go with it. This can't be undone.",
            confirmLabel: "Delete",
            destructive: true,
            typedConfirmation: ids.length > 25 ? `DELETE ${ids.length}` : undefined,
        });
        if (!ok) return;
        const results = await Promise.allSettled(ids.map((id) => apiFetch(`/tasks/${id}`, { method: "DELETE" })));
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed) toast.warning(`${plural(ids.length - failed, "task", "tasks")} deleted; ${failed.toLocaleString()} couldn't be deleted`);
        else toast.success(`${ids.length === 1 ? "Task" : plural(ids.length, "task", "tasks")} deleted`);
        setSelectedTaskIds([]);
        refresh();
    };

    const bulkUpdateTasks = async (patch: { status?: Task["status"]; ownerId?: string | null; dueAt?: string | null }) => {
        if (!selectedTaskIds.length) return false;
        setBulkBusy(true);
        try {
            const result = await apiFetch<{ updated?: Task[]; skipped?: number }>("/tasks", { method: "PATCH", body: JSON.stringify({ ids: selectedTaskIds, ...patch }) });
            const updated = result.updated?.length ?? 0;
            const skipped = Number(result.skipped ?? 0);
            const message = `${plural(updated, "task", "tasks")} updated${skipped ? `; ${skipped.toLocaleString()} skipped` : ""}`;
            if (skipped) toast.warning(message); else toast.success(message);
            setSelectedTaskIds([]);
            refresh();
            return true;
        } catch (error: any) {
            toast.error(error.message || "Couldn't update the selected tasks");
            return false;
        } finally {
            setBulkBusy(false);
        }
    };

    const sendTaskToQueue = async (task: Task, queueId: string) => {
        try {
            await apiFetch(`/tasks/${task.id}/queue`, { method: "POST", body: JSON.stringify({ queueId }) });
            toast.success("Task sent to the queue");
            refresh();
        } catch (error: any) {
            toast.error(error.message || "Couldn't send the task to the queue");
        }
    };

    const claimTask = async (task: Task, claim: boolean) => {
        try {
            await apiFetch(`/tasks/${task.id}/${claim ? "claim" : "unclaim"}`, { method: "POST" });
            toast.success(claim ? "Task claimed" : "Task released");
            refresh();
        } catch (error: any) {
            toast.error(error.message || (claim ? "Couldn't claim the task" : "Couldn't release the task"));
        }
    };

    const toggleFavoriteTask = (task: Task) => {
        const updated = toggleFavoriteRecord("task", task.id, task.title);
        setFavoriteTaskIds(updated.filter((record) => record.type === "task").map((record) => record.id));
    };

    const pickOpportunity = async (opportunityId: string | null) => {
        setForm((current) => ({ ...current, opportunityId: opportunityId ?? "", activityId: "" }));
        if (!opportunityId) return;
        try {
            const opportunity = await apiFetch<{ leadId?: string | null }>(`/opportunities/${opportunityId}`);
            if (opportunity?.leadId) setForm((current) => ({ ...current, leadId: current.leadId || opportunity.leadId || "" }));
        } catch {
            // The link to the opportunity is enough; its lead can be chosen by hand.
        }
    };

    // The columns are built once; their buttons call the latest handler through this ref, not
    // the first render's (which would refresh with the first render's filters).
    const setTaskStatusRef = useRef(setTaskStatus);
    useEffect(() => { setTaskStatusRef.current = setTaskStatus; });

    const columns = useMemo<ColumnDef<Task, any>[]>(() => [
        {
            id: "done", header: () => <span className="sr-only">Complete</span>, size: 44,
            cell: ({ row }) => {
                const task = row.original;
                const closed = isClosedTask(task);
                return (
                    <IconButton
                        label={closed ? `Reopen ${task.title}` : `Complete ${task.title}`}
                        onClick={(event) => { event.stopPropagation(); setTaskStatusRef.current(task, closed ? "OPEN" : "COMPLETED"); }}
                        className={closed ? "text-status-success-foreground" : "text-muted-foreground"}
                    >
                        <CheckCircle2 className={cn("size-5", closed && "fill-status-success")} />
                    </IconButton>
                );
            },
        },
        {
            accessorKey: "title", id: "title", header: "Task", size: 320, enableSorting: true,
            cell: ({ row }) => {
                const task = row.original;
                return (
                    <div className="min-w-0 max-w-[26rem]">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className={cn("truncate font-medium", isClosedTask(task) && "text-muted-foreground line-through")}>{task.title}</span>
                            <TaskFlags task={task} />
                        </div>
                        {task.description ? <span className="block truncate text-xs text-muted-foreground">{task.description}</span> : null}
                    </div>
                );
            },
        },
        {
            id: "related", header: "Related to", size: 200,
            cell: ({ row }) => {
                const task = row.original;
                if (task.opportunityId && task.opportunity) {
                    return (
                        <RecordPreviewPopover entityType="opportunity" entityId={task.opportunityId}>
                            <button type="button" onClick={(event) => event.stopPropagation()} className="block max-w-48 truncate text-left hover:underline">{task.opportunity.title}</button>
                        </RecordPreviewPopover>
                    );
                }
                if (task.leadId && task.lead) {
                    return (
                        <RecordPreviewPopover entityType="lead" entityId={task.leadId}>
                            <button type="button" onClick={(event) => event.stopPropagation()} className="block max-w-48 truncate text-left hover:underline">{task.lead.name || task.lead.email}</button>
                        </RecordPreviewPopover>
                    );
                }
                return <span className="text-muted-foreground">—</span>;
            },
        },
        { accessorKey: "dueAt", id: "dueAt", header: "Due", size: 190, enableSorting: true, cell: ({ row }) => <DueText task={row.original} /> },
        {
            accessorKey: "priority", id: "priority", header: "Priority", size: 100, enableSorting: true,
            cell: ({ row }) => {
                const shown = statusDisplay("priority", row.original.priority);
                return <span className={cn(shown.tone === "danger" ? "text-destructive" : shown.tone === "warning" ? "text-status-warning-foreground" : "text-muted-foreground")}>{shown.label}</span>;
            },
        },
        { id: "owner", header: "Owner", size: 140, enableSorting: true, cell: ({ row }) => <span className="block max-w-32 truncate">{row.original.owner?.name || row.original.owner?.email || "—"}</span> },
        { accessorKey: "status", id: "status", header: "Status", size: 110, enableSorting: true, cell: ({ row }) => <span className="text-muted-foreground">{statusDisplay("taskStatus", row.original.status).label}</span> },
    ], []);

    const ownerLabel = owner === "me" ? "Me" : owner === "all" ? "Anyone" : users.find((item) => item.id === owner)?.name || "Someone";
    const selectedCount = selectedTaskIds.length;
    const hasNarrowing = !!search.trim() || view !== "all" || owner !== "all" || priority !== "all";

    const toolbar = (
        <ListToolbar
            search={{ value: search, onChange: (value) => { setSearch(value); resetPaging(); }, placeholder: "Search tasks", label: "Search tasks", inputId: "tasks-search" }}
            quickFilters={viewMode === "list" ? VIEWS.map((value) => ({ value, label: VIEW_LABEL[value], count: counts[value] ?? undefined })) : undefined}
            quickFilter={view}
            onQuickFilterChange={(value) => { setView(value as View); resetPaging(); }}
            actions={<>
                <Select value={owner} onValueChange={(value) => { setOwner(value); resetPaging(); }}>
                    <SelectTrigger size="sm" aria-label="Owner" className="w-40"><span className="truncate">Owner: {ownerLabel}</span></SelectTrigger>
                    {/* popper: the trigger shows its own text, so the menu can't align to an item. */}
                    <SelectContent position="popper">
                        <SelectItem value="me">Me</SelectItem>
                        <SelectItem value="all">Anyone</SelectItem>
                        {users.filter((item) => item.id !== user?.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.name || item.email || "User"}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={priority} onValueChange={(value) => { setPriority(value as (typeof PRIORITIES)[number]); resetPaging(); }}>
                    <SelectTrigger size="sm" aria-label="Priority" className="w-36"><span className="truncate">{priority === "all" ? "Any priority" : statusDisplay("priority", priority).label}</span></SelectTrigger>
                    <SelectContent position="popper">
                        <SelectItem value="all">Any priority</SelectItem>
                        {PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </>}
        />
    );

    return (
        <div className="mx-auto min-w-0 max-w-[1400px]">
            <PageHeader
                title="Tasks"
                meta={counts.open != null ? <span className="tabular-nums">{owner === "me" ? "You have " : ""}{plural(counts.open, "open task", "open tasks")}{counts.overdue ? <>, <span className="text-destructive">{formatCount(counts.overdue)} overdue</span></> : null}</span> : undefined}
                primaryAction={<Button onClick={openCreate}><Plus className="size-4" />Create task</Button>}
                secondaryActions={<>
                    <SegmentedControl
                        label="View"
                        value={viewMode}
                        onChange={(mode) => { setViewMode(mode); resetPaging(); }}
                        options={[{ value: "list", label: "List", icon: <ListChecks /> }, { value: "calendar", label: "Calendar", icon: <CalendarDays /> }]}
                    />
                    <QueueExportButton
                        moduleName="TASKS"
                        filters={{
                            due: view !== "all" && view !== "open" ? view : null,
                            open: view === "open" || null,
                            priority: priority !== "all" ? priority : null,
                            ownerId: owner === "me" ? user?.id ?? null : owner !== "all" ? owner : null,
                            q: search.trim() || null,
                        }}
                        selectedIds={selectedTaskIds}
                        currentPageIds={tasks.map((task) => task.id)}
                        totalItems={totalItems}
                    />
                    <Button variant="outline" asChild><Link href="/dashboard/tasks/queues"><Inbox className="size-4" />Team queues</Link></Button>
                </>}
            />

            {viewMode === "calendar" ? (
                <div className="space-y-3">
                    <div className="rounded-xl border bg-card px-3 py-1.5">{toolbar}</div>
                    {loading ? (
                        <div className="h-80 animate-pulse rounded-xl bg-muted" aria-busy="true" />
                    ) : fetchError ? (
                        <ErrorState description={fetchError} onRetry={fetchTasks} />
                    ) : tasks.length === 0 ? (
                        <EmptyState icon={<CalendarClock />} title="No open tasks" description={hasNarrowing ? "Nothing open matches this owner, priority or search." : "Open tasks with a due date show here."} action={<Button onClick={openCreate}><Plus className="size-4" />Create task</Button>} />
                    ) : (
                        <>
                            {totalItems > tasks.length ? <p role="status" className="rounded-lg border border-status-warning-foreground/30 bg-status-warning px-3 py-2 text-sm text-status-warning-foreground">Showing the first {tasks.length.toLocaleString()} of {totalItems.toLocaleString()} open tasks. Narrow the owner or priority, or use the list for the rest.</p> : null}
                            <TaskCalendar tasks={tasks} mode={calendarMode} onModeChange={setCalendarMode} onEdit={openEdit} onComplete={(task) => setTaskStatus(task, "COMPLETED")} onReschedule={updateTaskDueAt} />
                        </>
                    )}
                </div>
            ) : (
                <DataTable
                    storageKey="tasks-table"
                    data={tasks}
                    columns={columns}
                    loading={loading}
                    error={fetchError}
                    onRetry={fetchTasks}
                    getRowId={(row) => row.id}
                    onRowClick={openEdit}
                    enableRowSelection
                    rowSelectionIds={selectedTaskIds}
                    onRowSelectionIdsChange={setSelectedTaskIds}
                    totalItems={totalItems}
                    sort={sort}
                    onSortChange={(next) => { setSortParam(next ? `${next.desc ? "-" : ""}${next.id}` : ""); setPaginationModel((current) => ({ ...current, page: 0 })); }}
                    pageIndex={paginationModel.page}
                    pageSize={paginationModel.pageSize}
                    pageSizeOptions={[25, 50, 100]}
                    onPaginationChange={({ pageIndex, pageSize }) => { setPaginationModel({ page: pageIndex, pageSize }); setSelectedTaskIds([]); }}
                    toolbarActions={toolbar}
                    rowActions={(task) => (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${task.title}`}><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => openEdit(task)}><Pencil className="size-4" />Edit</DropdownMenuItem>
                                {isClosedTask(task)
                                    ? <DropdownMenuItem onSelect={() => setTaskStatus(task, "OPEN")}><RotateCcw className="size-4" />Reopen</DropdownMenuItem>
                                    : <DropdownMenuItem onSelect={() => setTaskStatus(task, "COMPLETED")}><CheckCircle2 className="size-4" />Complete</DropdownMenuItem>}
                                {task.recurrenceRule && !isClosedTask(task) ? <DropdownMenuItem onSelect={() => skipTaskOccurrence(task)}><SkipForward className="size-4" />Skip this one</DropdownMenuItem> : null}
                                <DropdownMenuItem onSelect={() => toggleFavoriteTask(task)}>
                                    <Star className={cn("size-4", favoriteTaskIds.includes(task.id) && "fill-amber-500 text-amber-500")} />
                                    {favoriteTaskIds.includes(task.id) ? "Remove from favorites" : "Add to favorites"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => deleteTasks([task.id], "this task")}><Trash2 className="size-4" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    mobileCard={(task) => (
                        <div className="space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className={cn("min-w-0 truncate font-medium", isClosedTask(task) && "text-muted-foreground line-through")}>{task.title}</span>
                                <TaskFlags task={task} />
                            </div>
                            <div className="text-sm"><DueText task={task} /></div>
                            <div className="truncate text-xs text-muted-foreground">
                                {[task.opportunity?.title || task.lead?.name, statusDisplay("priority", task.priority).label, task.owner?.name].filter(Boolean).join(" · ")}
                            </div>
                        </div>
                    )}
                    emptyState={hasNarrowing && view !== "open" ? {
                        title: "No tasks match", description: "Try another view, owner, priority or search.", kind: "no-match",
                        action: <Button variant="outline" onClick={() => { setSearch(""); setView("open"); setOwner("me"); setPriority("all"); resetPaging(); }}>Back to my open tasks</Button>,
                    } : view === "open" && owner === "me" && !search.trim() ? {
                        title: "You're all caught up", description: "No open tasks. Create one, or add a task from a lead or opportunity.",
                        action: <Button onClick={openCreate}><Plus className="size-4" />Create task</Button>,
                    } : {
                        title: "No open tasks match", description: "Try another owner, priority or search.", kind: "no-match",
                    }}
                />
            )}

            <SelectionBar
                count={selectedCount}
                onClear={() => setSelectedTaskIds([])}
                actions={[
                    { label: "Complete", icon: <CheckCircle2 className="size-4" />, onClick: () => bulkUpdateTasks({ status: "COMPLETED" }), disabled: bulkBusy },
                    { label: "Assign", icon: <UserCog className="size-4" />, onClick: () => { setAssignUserId(null); setAssignOpen(true); } },
                    { label: "Reschedule", icon: <CalendarClock className="size-4" />, onClick: () => { setRescheduleAt(""); setRescheduleOpen(true); } },
                    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: () => deleteTasks(selectedTaskIds, plural(selectedCount, "task", "tasks")), destructive: true },
                ]}
            />

            <StandardDialog
                open={assignOpen}
                onClose={() => setAssignOpen(false)}
                title={`Assign ${plural(selectedCount, "task", "tasks")}`}
                maxWidth="xs"
                actions={<>
                    <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                    <Button isLoading={bulkBusy} disabled={!assignUserId} onClick={async () => { if (await bulkUpdateTasks({ ownerId: assignUserId })) setAssignOpen(false); }}>Assign</Button>
                </>}
            >
                <div className="space-y-1.5 pb-1">
                    <Label htmlFor="tasks-bulk-owner">New owner</Label>
                    <RecordPicker id="tasks-bulk-owner" entity="user" value={assignUserId} allowClear={false} onChange={(id) => setAssignUserId(id)} placeholder="Choose a person" />
                </div>
            </StandardDialog>

            <StandardDialog
                open={rescheduleOpen}
                onClose={() => setRescheduleOpen(false)}
                title={`Reschedule ${plural(selectedCount, "task", "tasks")}`}
                maxWidth="xs"
                actions={<>
                    <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
                    <Button isLoading={bulkBusy} disabled={!rescheduleAt} onClick={async () => { if (await bulkUpdateTasks({ dueAt: workspaceDateTimeInputToIso(rescheduleAt) })) setRescheduleOpen(false); }}>Reschedule</Button>
                </>}
            >
                <div className="space-y-1.5 pb-1">
                    <Label htmlFor="tasks-bulk-due">New due date</Label>
                    <Input id="tasks-bulk-due" type="datetime-local" value={rescheduleAt} onChange={(event) => setRescheduleAt(event.target.value)} />
                </div>
            </StandardDialog>

            <StandardDialog
                open={dialogOpen}
                onClose={closeEditor}
                title={editingTask ? "Edit task" : "Create task"}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" disabled={taskDraft.pending} onClick={closeEditor}>Cancel</Button>
                        <Button onClick={saveTask} disabled={!form.title.trim()} isLoading={taskDraft.pending}>{editingTask ? "Save changes" : "Create task"}</Button>
                    </>
                }
            >
                {taskDraft.dirty && <p role="status" className="mb-3 text-xs text-muted-foreground">This draft is kept while you move around the app. Refreshing or signing out clears it.</p>}
                {taskDraft.error && <p role="alert" className="mb-3 break-words text-sm text-destructive">{taskDraft.error}</p>}
                <fieldset disabled={taskDraft.pending} className="min-w-0">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="task-edit-title">Title <span aria-hidden className="text-destructive">*</span></Label>
                            <Input id="task-edit-title" aria-required value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="task-edit-description">Description</Label>
                            <Input id="task-edit-description" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="task-edit-status">Status</Label>
                                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as Task["status"] }))}>
                                    <SelectTrigger id="task-edit-status" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="task-edit-priority">Priority</Label>
                                <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value as Task["priority"] }))}>
                                    <SelectTrigger id="task-edit-priority" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>{PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="task-edit-owner">Owner</Label>
                                <Select value={form.ownerId || "__me__"} onValueChange={(value) => setForm((current) => ({ ...current, ownerId: value === "__me__" ? "" : value }))}>
                                    <SelectTrigger id="task-edit-owner" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__me__">Me</SelectItem>
                                        {users.filter((item) => item.id !== user?.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.name || item.email || "User"}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="task-edit-due">Due</Label>
                                <Input id="task-edit-due" type="datetime-local" value={form.dueAt} onChange={(e) => setForm((current) => ({ ...current, dueAt: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
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
                            <div className="space-y-1.5">
                                <Label htmlFor="task-edit-lead">Lead</Label>
                                <RecordPicker id="task-edit-lead" entity="lead" value={form.leadId || null} onChange={(id) => setForm((current) => ({ ...current, leadId: id ?? "", activityId: "" }))} placeholder="No lead" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="task-edit-opportunity">Opportunity</Label>
                                <RecordPicker id="task-edit-opportunity" entity="opportunity" value={form.opportunityId || null} onChange={(id) => { pickOpportunity(id); }} placeholder="No opportunity" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="task-edit-activity">Related activity</Label>
                            <Select
                                value={form.activityId || "__none__"}
                                disabled={!form.leadId && !form.opportunityId}
                                onValueChange={(value) => setForm((current) => ({ ...current, activityId: value === "__none__" ? "" : value }))}
                            >
                                <SelectTrigger id="task-edit-activity" className="w-full"><SelectValue placeholder={form.leadId || form.opportunityId ? "No activity" : "Choose a lead or opportunity first"} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No activity</SelectItem>
                                    {activityOptions.map((activity) => <SelectItem key={activity.id} value={activity.id}>{formatActivityLabel(activity)}</SelectItem>)}
                                    {form.activityId && !activityOptions.some((activity) => activity.id === form.activityId) ? <SelectItem value={form.activityId}>{editingTask?.activity?.notes || editingTask?.activity?.outcome || "Linked activity"}</SelectItem> : null}
                                </SelectContent>
                            </Select>
                        </div>
                        {editingTask?.completedAt ? <p className="text-xs text-muted-foreground">Completed {formatWorkspaceDateTime(editingTask.completedAt)}</p> : null}
                        {editingTask?.metadata?.comments?.length ? (
                            <section aria-labelledby="task-comments-heading" className="space-y-1">
                                <h3 id="task-comments-heading" className="text-sm font-semibold">Recent comments</h3>
                                <ul className="divide-y rounded-lg border text-sm">
                                    {editingTask.metadata.comments.slice(-3).map((comment, index) => (
                                        <li key={`${comment.createdAt}-${index}`} className="px-3 py-2">
                                            <p className="break-words">{comment.body}</p>
                                            <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(comment.createdAt)}</p>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}
                        <div className="space-y-1.5">
                            <Label htmlFor="task-edit-comment">{editingTask ? "Add a comment" : "Comment"}</Label>
                            <Input id="task-edit-comment" value={form.comment} onChange={(e) => setForm((current) => ({ ...current, comment: e.target.value }))} />
                        </div>
                        {editingTask && (editingTask.opportunityId || editingTask.leadId) ? (
                            // Prefer the opportunity's recommendations when the task is linked to
                            // both -- more specific than the parent lead's.
                            <NextBestActionPanel
                                recordType={editingTask.opportunityId ? "OPPORTUNITY" : "LEAD"}
                                recordId={(editingTask.opportunityId || editingTask.leadId) as string}
                                title="Recommended next actions"
                            />
                        ) : null}
                        {editingTask && <TaskChecklistDependenciesPanel task={editingTask} siblingTasks={siblingTasksForEditingTask} onRefresh={refresh} />}
                        {editingTask && (
                            <section aria-labelledby="task-queue-heading" className="rounded-lg border p-3">
                                <h3 id="task-queue-heading" className="text-sm font-semibold">Team queue</h3>
                                {editingTask.queueId ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                        <span>{teams.find((team) => team.id === editingTask.queueId)?.name || "Queue"} · {editingTask.claimedBy ? "claimed" : "unclaimed"}</span>
                                        <Button size="sm" variant="outline" onClick={() => claimTask(editingTask, !editingTask.claimedBy)}>{editingTask.claimedBy ? "Release" : "Claim"}</Button>
                                    </div>
                                ) : (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <p className="text-sm text-muted-foreground">Not in a queue.</p>
                                        <Select onValueChange={(queueId) => sendTaskToQueue(editingTask, queueId)}>
                                            <SelectTrigger aria-label="Send task to queue" className="w-48" size="sm"><SelectValue placeholder="Send to a queue…" /></SelectTrigger>
                                            <SelectContent>{teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </section>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Overdue work stays in its own column. Drag a task to another column to reschedule it, or open it to change the date.</p>
                <SegmentedControl
                    label="Calendar range"
                    value={mode}
                    onChange={onModeChange}
                    options={[{ value: "day", label: "Days" }, { value: "week", label: "Weeks" }, { value: "month", label: "Months" }]}
                />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 @min-[640px]/task-calendar:grid-cols-2 @min-[1100px]/task-calendar:grid-cols-5">
                {lanes.map((lane) => (
                    <section
                        key={lane.key}
                        aria-label={`${lane.label}, ${plural(lane.tasks.length, "task", "tasks")}`}
                        className={cn("min-h-[220px] min-w-0 rounded-xl border bg-card p-3", lane.key === "overdue" && "border-status-danger-foreground/30")}
                        onDragOver={(event) => { if (lane.startAt && draggingTask) event.preventDefault(); }}
                        onDrop={(event) => {
                            event.preventDefault();
                            if (!lane.startAt || !draggingTask) return;
                            onReschedule(draggingTask, lane.startAt);
                            setDraggingTaskId(null);
                        }}
                    >
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                            <h3 className={cn("text-sm font-semibold", lane.key === "overdue" && "text-destructive")}>{lane.label}</h3>
                            <span className="text-xs tabular-nums text-muted-foreground">{lane.tasks.length}</span>
                        </div>
                        <ul className="space-y-1.5">
                            {lane.tasks.length === 0 ? (
                                <li className="py-4 text-center text-xs text-muted-foreground">Nothing due</li>
                            ) : lane.tasks.map((task) => (
                                <li
                                    key={task.id}
                                    draggable={!isClosedTask(task)}
                                    onDragStart={() => setDraggingTaskId(task.id)}
                                    onDragEnd={() => setDraggingTaskId(null)}
                                    className="flex min-w-0 items-start gap-1 rounded-lg border bg-background p-2"
                                >
                                    <IconButton label={`Complete ${task.title}`} className="-ml-1 shrink-0 text-muted-foreground" onClick={() => onComplete(task)}><CheckCircle2 className="size-4" /></IconButton>
                                    <button type="button" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)} className="block min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        <span className="block break-words text-sm font-medium">{task.title}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {[task.dueAt ? formatWorkspaceDateTime(task.dueAt) : "No due date", statusDisplay("priority", task.priority).label].join(" · ")}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}

function calendarLanes(tasks: Task[], mode: "day" | "week" | "month") {
    // Lanes start at the workspace's midnight, not the browser's.
    const startToday = workspaceDayStart();
    const activeTasks = tasks.filter((task) => task.status !== "CANCELLED");
    const overdue = activeTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < startToday.getTime() && task.status !== "COMPLETED");
    const upcoming = activeTasks.filter((task) => !overdue.some((item) => item.id === task.id));
    const periods = mode === "day" ? 3 : 4;
    const lanes = [{ key: "overdue", label: "Overdue", tasks: overdue, startAt: null as string | null }];
    for (let index = 0; index < periods; index += 1) {
        const start = mode === "month" ? workspaceDayStart({ months: index }) : workspaceDayStart({ days: mode === "week" ? index * 7 : index });
        const end = mode === "month" ? workspaceDayStart({ months: index + 1 }) : workspaceDayStart({ days: mode === "week" ? (index + 1) * 7 : index + 1 });
        // Headings in the workspace's date style and time zone, not the browser's locale.
        const label = mode === "day"
            ? index === 0 ? "Today" : index === 1 ? "Tomorrow" : formatWorkspaceDateParts(start, { weekday: "short", day: "2-digit", month: "short" })
            : mode === "week"
                ? index === 0 ? "Next 7 days" : `${formatWorkspaceDateParts(start, { day: "2-digit", month: "short" })} – ${formatWorkspaceDateParts(new Date(end.getTime() - 1), { day: "2-digit", month: "short" })}`
                : formatWorkspaceDateParts(start, { month: "long", year: "numeric" });
        lanes.push({
            key: `${mode}-${index}`,
            label,
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

"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, X, ListTree } from "lucide-react";

type ChecklistItem = { id: string; title: string; isDone: boolean };
type BlockedByEntry = { taskId: string; title: string; status: string };
type SiblingTask = { id: string; title: string; status: string; parentTaskId?: string | null };

type PanelTask = {
    id: string;
    parentTaskId?: string | null;
    requireCompletionNote?: boolean;
    completionNote?: string | null;
    checklist?: ChecklistItem[];
    blockedBy?: BlockedByEntry[];
    isBlocked?: boolean;
    subtaskCount?: number;
};

interface TaskChecklistDependenciesPanelProps {
    task: PanelTask;
    /** Other tasks on the same Lead/Opportunity -- candidates for "parent task" and "blocked by". */
    siblingTasks: SiblingTask[];
    onRefresh: () => void;
}

export function TaskChecklistDependenciesPanel({ task, siblingTasks, onRefresh }: TaskChecklistDependenciesPanelProps) {
    const [newItemTitle, setNewItemTitle] = useState("");
    const [requireNote, setRequireNote] = useState(task.requireCompletionNote ?? false);
    const [completionNote, setCompletionNote] = useState(task.completionNote ?? "");
    const [savingNoteSettings, setSavingNoteSettings] = useState(false);
    const [selectedBlockers, setSelectedBlockers] = useState<string[]>((task.blockedBy ?? []).map((b) => b.taskId));
    const [savingDependencies, setSavingDependencies] = useState(false);
    const [parentTaskId, setParentTaskId] = useState(task.parentTaskId ?? "");
    const [savingParent, setSavingParent] = useState(false);

    useEffect(() => {
        setRequireNote(task.requireCompletionNote ?? false);
        setCompletionNote(task.completionNote ?? "");
        setSelectedBlockers((task.blockedBy ?? []).map((b) => b.taskId));
        setParentTaskId(task.parentTaskId ?? "");
    }, [task.id, task.requireCompletionNote, task.completionNote, task.blockedBy, task.parentTaskId]);

    const candidateTasks = siblingTasks.filter((sibling) => sibling.id !== task.id);
    const checklist = task.checklist ?? [];
    const doneCount = checklist.filter((item) => item.isDone).length;

    const toggleChecklistItem = async (itemId: string, isDone: boolean) => {
        try {
            await apiFetch(`/tasks/${task.id}/checklist/${itemId}`, { method: "PATCH", body: JSON.stringify({ isDone }) });
            onRefresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update checklist item");
        }
    };

    const addChecklistItem = async () => {
        if (!newItemTitle.trim()) return;
        try {
            const items = [...checklist.map((item) => ({ title: item.title, isDone: item.isDone })), { title: newItemTitle.trim(), isDone: false }];
            await apiFetch(`/tasks/${task.id}/checklist`, { method: "PUT", body: JSON.stringify({ items }) });
            setNewItemTitle("");
            onRefresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to add checklist item");
        }
    };

    const removeChecklistItem = async (itemId: string) => {
        try {
            const items = checklist.filter((item) => item.id !== itemId).map((item) => ({ title: item.title, isDone: item.isDone }));
            await apiFetch(`/tasks/${task.id}/checklist`, { method: "PUT", body: JSON.stringify({ items }) });
            onRefresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to remove checklist item");
        }
    };

    const saveDependencies = async () => {
        setSavingDependencies(true);
        try {
            await apiFetch(`/tasks/${task.id}/dependencies`, { method: "PUT", body: JSON.stringify({ blockedByTaskIds: selectedBlockers }) });
            toast.success("Dependencies updated");
            onRefresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update dependencies");
        } finally {
            setSavingDependencies(false);
        }
    };

    const saveNoteSettings = async () => {
        setSavingNoteSettings(true);
        try {
            await apiFetch(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ requireCompletionNote: requireNote, completionNote }) });
            toast.success("Completion settings updated");
            onRefresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update completion settings");
        } finally {
            setSavingNoteSettings(false);
        }
    };

    const saveParentTask = async (value: string) => {
        setParentTaskId(value);
        setSavingParent(true);
        try {
            await apiFetch(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ parentTaskId: value || null }) });
            onRefresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update parent task");
        } finally {
            setSavingParent(false);
        }
    };

    return (
        <div className="space-y-4 rounded-xl border bg-surface-container-low p-3">
            {task.isBlocked && (
                <Alert variant="destructive">
                    <AlertTriangle className="size-4" />
                    <AlertDescription>
                        Blocked by: {(task.blockedBy ?? []).filter((b) => b.status !== "COMPLETED" && b.status !== "CANCELLED").map((b) => b.title).join(", ")}
                    </AlertDescription>
                </Alert>
            )}

            <div className="space-y-1.5">
                <Label className="text-xs">Parent Task {task.subtaskCount ? <span className="text-muted-foreground">({task.subtaskCount} subtask{task.subtaskCount === 1 ? "" : "s"})</span> : null}</Label>
                <Select value={parentTaskId || "__none__"} onValueChange={(value) => saveParentTask(value === "__none__" ? "" : value)} disabled={savingParent}>
                    <SelectTrigger className="w-full" size="sm"><SelectValue placeholder="No parent task" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">No parent task</SelectItem>
                        {candidateTasks.map((sibling) => (
                            <SelectItem key={sibling.id} value={sibling.id}>{sibling.title}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-xs">Checklist {checklist.length ? <span className="text-muted-foreground">({doneCount}/{checklist.length})</span> : null}</Label>
                </div>
                <div className="space-y-1">
                    {checklist.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                            <Checkbox checked={item.isDone} onCheckedChange={(checked) => toggleChecklistItem(item.id, checked === true)} />
                            <span className={item.isDone ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>{item.title}</span>
                            <Button variant="ghost" size="icon" className="size-6" onClick={() => removeChecklistItem(item.id)}>
                                <X className="size-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Input
                        placeholder="Add checklist item"
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                    />
                    <Button variant="outline" size="sm" onClick={addChecklistItem} disabled={!newItemTitle.trim()}>
                        <Plus className="size-4" />
                    </Button>
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs">Blocked by (must complete first)</Label>
                {candidateTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No other tasks on this record to depend on yet.</p>
                ) : (
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                        {candidateTasks.map((sibling) => (
                            <label key={sibling.id} className="flex items-center gap-2 text-xs">
                                <Checkbox
                                    checked={selectedBlockers.includes(sibling.id)}
                                    onCheckedChange={(checked) => setSelectedBlockers((current) =>
                                        checked ? [...current, sibling.id] : current.filter((id) => id !== sibling.id)
                                    )}
                                />
                                <span className="flex-1">{sibling.title}</span>
                                <Badge variant="outline" className="text-[0.6rem]">{sibling.status}</Badge>
                            </label>
                        ))}
                    </div>
                )}
                <Button variant="outline" size="sm" onClick={saveDependencies} disabled={savingDependencies}>
                    <ListTree className="size-4" />
                    Save Dependencies
                </Button>
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <Switch checked={requireNote} onCheckedChange={setRequireNote} />
                    <Label className="text-xs">Require a note before this task can be completed</Label>
                </div>
                {requireNote && (
                    <Textarea
                        placeholder="Completion note"
                        rows={2}
                        value={completionNote}
                        onChange={(e) => setCompletionNote(e.target.value)}
                    />
                )}
                <Button variant="outline" size="sm" onClick={saveNoteSettings} disabled={savingNoteSettings}>Save Completion Settings</Button>
            </div>
        </div>
    );
}

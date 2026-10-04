"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ListPlus, NotebookPen } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StandardDialog } from "@/components/common/standard-dialog";
import { cn } from "@/lib/utils";

export type ComposerMode = "note" | "task";
type Due = "today" | "tomorrow" | "week" | "none";

const DUE_LABEL: Record<Due, string> = { today: "Today", tomorrow: "Tomorrow", week: "In a week", none: "No date" };

function dueDate(option: Due) {
    if (option === "none") return null;
    const date = new Date();
    if (option === "tomorrow") date.setDate(date.getDate() + 1);
    if (option === "week") date.setDate(date.getDate() + 7);
    date.setHours(17, 0, 0, 0);
    return date.toISOString();
}

// Add a note or a task to a lead or opportunity, in a dialog (it used to be a form inline above
// the activity history). A note in one step; a task as a title plus a due chip.
export function RecordAddDialog({ entityType, entityId, mode, onClose, onCreated }: {
    entityType: "lead" | "opportunity";
    entityId: string;
    // null = closed.
    mode: ComposerMode | null;
    onClose: () => void;
    onCreated: (kind: ComposerMode) => void;
}) {
    const [text, setText] = useState("");
    const [due, setDue] = useState<Due>("tomorrow");
    const [saving, setSaving] = useState(false);
    const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

    useEffect(() => {
        if (!mode) return;
        setText("");
        setDue("tomorrow");
        const timer = window.setTimeout(() => fieldRef.current?.focus(), 30);
        return () => window.clearTimeout(timer);
    }, [mode]);

    const submit = async () => {
        const value = text.trim();
        if (!mode || !value || saving) return;
        setSaving(true);
        try {
            if (mode === "note") {
                await apiFetch("/notes", { method: "POST", body: JSON.stringify({ entityType, entityId, content: value }) });
                toast.success("Note added");
            } else {
                await apiFetch("/tasks", {
                    method: "POST",
                    body: JSON.stringify({ title: value, dueAt: dueDate(due), ...(entityType === "lead" ? { leadId: entityId } : { opportunityId: entityId }) }),
                });
                toast.success(`Task added${due !== "none" ? `, due ${DUE_LABEL[due].toLowerCase()}` : ""}`);
            }
            onCreated(mode);
            onClose();
        } catch (error: any) {
            toast.error(error?.message || (mode === "note" ? "Couldn't add the note" : "Couldn't add the task"));
        } finally {
            setSaving(false);
        }
    };

    const isNote = mode === "note";
    return (
        <StandardDialog
            open={mode !== null}
            onClose={() => { if (!saving) onClose(); }}
            title={isNote ? "Add note" : "Add task"}
            icon={isNote ? <NotebookPen className="size-4" /> : <ListPlus className="size-4" />}
            maxWidth="sm"
            actions={
                <>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button onClick={submit} disabled={!text.trim()} isLoading={saving}>{isNote ? "Add note" : "Add task"}</Button>
                </>
            }
        >
            <div className="space-y-4">
                {isNote ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="record-add-note">Note</Label>
                        <Textarea
                            id="record-add-note"
                            ref={fieldRef}
                            placeholder="What happened, or what should others know?"
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }}
                            rows={5}
                        />
                        <p className="text-xs text-muted-foreground">Ctrl or ⌘ + Enter to save.</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-1.5">
                            <Label htmlFor="record-add-task">Task</Label>
                            <Input
                                id="record-add-task"
                                ref={fieldRef}
                                placeholder="What needs doing?"
                                value={text}
                                onChange={(event) => setText(event.target.value)}
                                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <span id="record-add-task-due" className="text-sm font-medium">Due</span>
                            <div role="radiogroup" aria-labelledby="record-add-task-due" className="flex flex-wrap gap-1.5">
                                {(Object.keys(DUE_LABEL) as Due[]).map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        role="radio"
                                        aria-checked={due === option}
                                        onClick={() => setDue(option)}
                                        className={cn(
                                            "h-8 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            due === option ? "border-transparent bg-selected text-primary" : "border-border-strong text-muted-foreground hover:bg-muted",
                                        )}
                                    >
                                        {DUE_LABEL[option]}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Due at 5 pm. Change the time, owner or details later on the Tasks page.</p>
                        </div>
                    </>
                )}
            </div>
        </StandardDialog>
    );
}

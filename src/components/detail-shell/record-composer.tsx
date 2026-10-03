"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/common/page-tabs";
import { cn } from "@/lib/utils";

type Mode = "note" | "task";
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

// The record's composer (UI/UX plan §10.5 and §11.4): a note in one step, a task as "title +
// due chip → Enter". Calls and other activities use the "Log activity" action next to it.
export function RecordComposer({ entityType, entityId, onCreated, logActivity, focusRequest }: {
    entityType: "lead" | "opportunity";
    entityId: string;
    onCreated: (kind: Mode) => void;
    logActivity?: React.ReactNode;
    // "Add note" / "Add task" in the record header: switch to that mode and focus the field.
    focusRequest?: { mode: Mode; at: number } | null;
}) {
    const [mode, setMode] = useState<Mode>("note");
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const taskRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!focusRequest) return;
        setMode(focusRequest.mode);
        const timer = window.setTimeout(() => {
            const target = focusRequest.mode === "note" ? noteRef.current : taskRef.current;
            target?.scrollIntoView({ block: "center", behavior: "smooth" });
            target?.focus();
        }, 30);
        return () => window.clearTimeout(timer);
    }, [focusRequest]);
    const [text, setText] = useState("");
    const [due, setDue] = useState<Due>("tomorrow");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        const value = text.trim();
        if (!value || saving) return;
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
            setText("");
            onCreated(mode);
        } catch (error: any) {
            toast.error(error?.message || (mode === "note" ? "Couldn't add the note" : "Couldn't add the task"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5">
                <SegmentedControl
                    label="What to add"
                    value={mode}
                    onChange={setMode}
                    options={[{ value: "note", label: "Note" }, { value: "task", label: "Task" }]}
                />
                {logActivity}
            </div>
            <div className="p-2">
                {mode === "note" ? (
                    <Textarea
                        ref={noteRef}
                        aria-label="New note"
                        placeholder="Add a note…"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }}
                        rows={2}
                        className="min-h-14 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                ) : (
                    <Input
                        ref={taskRef}
                        aria-label="New task"
                        placeholder="What needs doing? Press Enter to add"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }}
                        className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                )}
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    {mode === "task" ? (
                        <div role="radiogroup" aria-label="Due" className="flex flex-wrap gap-1">
                            {(Object.keys(DUE_LABEL) as Due[]).map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    role="radio"
                                    aria-checked={due === option}
                                    onClick={() => setDue(option)}
                                    className={cn(
                                        "h-7 rounded-full border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        due === option ? "border-transparent bg-selected text-primary" : "border-border-strong text-muted-foreground hover:bg-muted",
                                    )}
                                >
                                    {DUE_LABEL[option]}
                                </button>
                            ))}
                        </div>
                    ) : <span className="text-xs text-muted-foreground">Ctrl or ⌘ + Enter to save</span>}
                    <Button size="sm" onClick={submit} disabled={!text.trim()} isLoading={saving}>
                        {mode === "note" ? "Add note" : "Add task"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

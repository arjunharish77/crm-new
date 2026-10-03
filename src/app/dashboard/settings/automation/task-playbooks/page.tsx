"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ClipboardList, ArrowUp, ArrowDown, X, BarChart3 } from "lucide-react";
import Link from "next/link";
import { formatWorkspaceDate, formatWorkspaceDateTime } from "@/lib/date-format";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Info } from "lucide-react";
import { useConfirm } from "@/components/common/dialogs-provider";

type TargetModule = "LEAD" | "OPPORTUNITY" | "BOTH";
type PlaybookUsage = {
    total: number;
    last30: number;
    manual: number;
    automatic: number;
    lastAppliedAt: string | null;
    recent: Array<{
        id: string; appliedAt: string; source: string; leadId: string | null; opportunityId: string | null;
        leadName: string | null; opportunityTitle: string | null; appliedByName: string | null; taskCount: number; completedCount: number;
    }>;
};
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface PlaybookItemDraft {
    title: string;
    description: string;
    priority: Priority;
    dueInDays: number;
    assignToRecordOwner: boolean;
}

interface Playbook {
    id: string;
    name: string;
    description: string | null;
    targetModule: TargetModule;
    isActive: boolean;
    itemCount: number;
}

const TARGET_MODULE_LABELS: Record<TargetModule, string> = {
    LEAD: "Leads",
    OPPORTUNITY: "Opportunities",
    BOTH: "Leads & Opportunities",
};

const EMPTY_ITEM: PlaybookItemDraft = {
    title: "",
    description: "",
    priority: "MEDIUM",
    dueInDays: 1,
    assignToRecordOwner: true,
};

export default function TaskPlaybooksSettingsPage() {
    const confirm = useConfirm();
    const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [targetModule, setTargetModule] = useState<TargetModule>("BOTH");
    const [isActive, setIsActive] = useState(true);
    const [items, setItems] = useState<PlaybookItemDraft[]>([{ ...EMPTY_ITEM }]);
    const [saving, setSaving] = useState(false);

    const fetchPlaybooks = () => {
        setLoading(true);
        setLoadError(null);
        apiFetch("/settings/task-playbooks")
            .then((data) => setPlaybooks(Array.isArray(data) ? data : []))
            .catch(() => setLoadError("Failed to load task playbooks."))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchPlaybooks();
    }, []);

    const openCreate = () => {
        setEditingId(null);
        setName("");
        setDescription("");
        setTargetModule("BOTH");
        setIsActive(true);
        setItems([{ ...EMPTY_ITEM }]);
        setDialogOpen(true);
    };

    // Where the playbook has been used (counts and the latest 20 applications).
    const [usageFor, setUsageFor] = useState<Playbook | null>(null);
    const [usage, setUsage] = useState<PlaybookUsage | null>(null);
    const [usageError, setUsageError] = useState(false);
    const openUsage = async (playbook: Playbook) => {
        setUsageFor(playbook);
        setUsage(null);
        setUsageError(false);
        try {
            setUsage(await apiFetch<PlaybookUsage>(`/settings/task-playbooks/${playbook.id}/usage`));
        } catch {
            setUsageError(true);
        }
    };

    const openEdit = async (playbook: Playbook) => {
        try {
            const full = await apiFetch(`/settings/task-playbooks/${playbook.id}`);
            setEditingId(playbook.id);
            setName(full.name);
            setDescription(full.description || "");
            setTargetModule(full.targetModule);
            setIsActive(full.isActive);
            setItems(
                (full.items || []).map((item: any) => ({
                    title: item.title,
                    description: item.description || "",
                    priority: item.priority,
                    dueInDays: item.dueInDays,
                    assignToRecordOwner: item.assignToRecordOwner,
                }))
            );
            setDialogOpen(true);
        } catch {
            toast.error("Failed to load playbook");
        }
    };

    const updateItem = (index: number, patch: Partial<PlaybookItemDraft>) => {
        setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
    };

    const addItem = () => setItems((current) => [...current, { ...EMPTY_ITEM }]);
    const removeItem = (index: number) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    const moveItem = (index: number, direction: -1 | 1) => {
        setItems((current) => {
            const target = index + direction;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("Playbook name is required");
            return;
        }
        const validItems = items.filter((item) => item.title.trim());
        if (validItems.length === 0) {
            toast.error("Add at least one task to the playbook");
            return;
        }
        setSaving(true);
        try {
            const payload = { name, description, targetModule, isActive, items: validItems };
            if (editingId) {
                await apiFetch(`/settings/task-playbooks/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
            } else {
                await apiFetch("/settings/task-playbooks", { method: "POST", body: JSON.stringify(payload) });
            }
            toast.success("Playbook saved");
            setDialogOpen(false);
            fetchPlaybooks();
        } catch (error: any) {
            toast.error(error?.message || "Failed to save playbook");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (playbook: Playbook) => {
        if (!(await confirm({ title: `Delete ${playbook.name}?`, description: "Tasks already created from it aren't affected.", confirmLabel: "Delete playbook", destructive: true }))) return;
        try {
            await apiFetch(`/settings/task-playbooks/${playbook.id}`, { method: "DELETE" });
            setPlaybooks((current) => current.filter((item) => item.id !== playbook.id));
            toast.success("Playbook deleted");
        } catch {
            toast.error("Failed to delete playbook");
        }
    };

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="Task playbooks" description="Create reusable sets of follow-up tasks for leads and opportunities." actions={
                <Button onClick={openCreate}>
                    <Plus className="size-4" />
                    New Playbook
                </Button>
            } />

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : loadError ? (
                <ErrorState description={loadError} onRetry={fetchPlaybooks} />
            ) : playbooks.length === 0 ? (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>No task playbooks yet. Create one to bundle standard follow-up tasks together.</AlertDescription>
                </Alert>
            ) : (
                <Card className="overflow-hidden py-0">
                    <div className="divide-y">
                        {playbooks.map((playbook) => (
                            <div key={playbook.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                                <div className="flex items-start gap-3">
                                    <ClipboardList className="mt-0.5 size-5 text-primary" />
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2 font-medium">
                                            {playbook.name}
                                            <Badge variant={playbook.isActive ? "default" : "outline"}>{playbook.isActive ? "Active" : "Off"}</Badge>
                                        </div>
                                        {playbook.description && <div className="text-xs text-muted-foreground">{playbook.description}</div>}
                                        <div className="mt-1 flex gap-1">
                                            <Badge variant="outline">{TARGET_MODULE_LABELS[playbook.targetModule]}</Badge>
                                            <Badge variant="outline">{playbook.itemCount} task{playbook.itemCount === 1 ? "" : "s"}</Badge>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => openUsage(playbook)}>
                                        <BarChart3 className="size-4" />Usage
                                    </Button>
                                    <Button variant="ghost" size="icon" aria-label={`Edit ${playbook.name}`} onClick={() => openEdit(playbook)}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" aria-label={`Delete ${playbook.name}`} onClick={() => handleDelete(playbook)}>
                                        <Trash2 className="size-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <StandardDialog
                open={!!usageFor}
                onClose={() => setUsageFor(null)}
                title={usageFor ? `Usage: ${usageFor.name}` : "Usage"}
                subtitle="Where this playbook was applied, and how many of the tasks it created are done."
                maxWidth="md"
                actions={<Button variant="ghost" onClick={() => setUsageFor(null)}>Close</Button>}
            >
                {usageError ? (
                    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">Usage couldn&apos;t be loaded. <Button variant="outline" size="sm" onClick={() => usageFor && openUsage(usageFor)}>Try again</Button></div>
                ) : !usage ? (
                    <p role="status" className="text-sm text-muted-foreground">Loading usage…</p>
                ) : usage.total === 0 ? (
                    <p className="text-sm text-muted-foreground">This playbook hasn&apos;t been applied yet.</p>
                ) : (
                    <div className="space-y-4">
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div><dt className="text-xs text-muted-foreground">Applied</dt><dd className="text-lg font-semibold">{usage.total.toLocaleString()}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Last 30 days</dt><dd className="text-lg font-semibold">{usage.last30.toLocaleString()}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">By hand / automatically</dt><dd className="text-lg font-semibold">{usage.manual.toLocaleString()} / {usage.automatic.toLocaleString()}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Last applied</dt><dd className="text-sm font-semibold">{usage.lastAppliedAt ? formatWorkspaceDate(usage.lastAppliedAt) : "—"}</dd></div>
                        </dl>
                        <div>
                            <h3 className="mb-2 text-sm font-semibold">Latest {usage.recent.length === usage.total ? "" : `${usage.recent.length} of ${usage.total.toLocaleString()} `}applications</h3>
                            <ul className="divide-y rounded-lg border">
                                {usage.recent.map((row) => {
                                    const href = row.opportunityId ? `/dashboard/opportunities/${row.opportunityId}` : row.leadId ? `/dashboard/leads/${row.leadId}` : null;
                                    const label = row.opportunityTitle || row.leadName || (href ? "Deleted record" : "No record");
                                    return (
                                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                                            <div className="min-w-0 flex-1 basis-56">
                                                {href && (row.opportunityTitle || row.leadName) ? <Link href={href} className="font-medium hover:underline">{label}</Link> : <span className="font-medium">{label}</span>}
                                                <p className="text-xs text-muted-foreground">
                                                    {formatWorkspaceDateTime(row.appliedAt)} · {row.source === "MANUAL" ? (row.appliedByName ? `by ${row.appliedByName}` : "by hand") : "by an automation"}
                                                </p>
                                            </div>
                                            <Badge variant="outline">{row.completedCount} of {row.taskCount} task{row.taskCount === 1 ? "" : "s"} done</Badge>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
                )}
            </StandardDialog>

            <StandardDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                title={editingId ? "Edit Playbook" : "New Playbook"}
                maxWidth="lg"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button disabled={saving} onClick={handleSave}>{saving ? "Saving..." : "Save Playbook"}</Button>
                    </>
                }
            >
                <div className="space-y-4 py-2">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Playbook Name</Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Enquiry Follow-up" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Applies To</Label>
                            <Select value={targetModule} onValueChange={(value) => setTargetModule(value as TargetModule)}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BOTH">Leads &amp; Opportunities</SelectItem>
                                    <SelectItem value="LEAD">Leads only</SelectItem>
                                    <SelectItem value="OPPORTUNITY">Opportunities only</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Description (optional)</Label>
                        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                        <Label>Playbook enabled</Label>
                    </div>

                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between">
                            <p className="text-sm font-semibold">Tasks in this playbook</p>
                            <Button variant="outline" size="sm" onClick={addItem}>
                                <Plus className="size-4" />
                                Add Task
                            </Button>
                        </div>
                        <div className="space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="space-y-2 rounded-lg border p-3">
                                    <div className="flex flex-wrap items-center justify-between">
                                        <span className="text-xs font-semibold text-muted-foreground">Task {index + 1}</span>
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="size-6" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                                                <ArrowUp className="size-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="size-6" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>
                                                <ArrowDown className="size-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="size-6" onClick={() => removeItem(index)}>
                                                <X className="size-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <Input
                                        placeholder="Task title (e.g. Call to introduce course options)"
                                        value={item.title}
                                        onChange={(e) => updateItem(index, { title: e.target.value })}
                                    />
                                    <Textarea
                                        placeholder="Description (optional)"
                                        rows={2}
                                        value={item.description}
                                        onChange={(e) => updateItem(index, { description: e.target.value })}
                                    />
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Priority</Label>
                                            <Select value={item.priority} onValueChange={(value) => updateItem(index, { priority: value as Priority })}>
                                                <SelectTrigger className="w-full" size="sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="LOW">Low</SelectItem>
                                                    <SelectItem value="MEDIUM">Medium</SelectItem>
                                                    <SelectItem value="HIGH">High</SelectItem>
                                                    <SelectItem value="URGENT">Urgent</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Due (days after apply)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                value={item.dueInDays}
                                                onChange={(e) => updateItem(index, { dueInDays: Number(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="flex items-end gap-2 pb-1.5">
                                            <Switch
                                                checked={item.assignToRecordOwner}
                                                onCheckedChange={(checked) => updateItem(index, { assignToRecordOwner: checked })}
                                            />
                                            <Label className="text-xs">Assign to record owner</Label>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            If &quot;Assign to record owner&quot; is off (or the record has no owner), the task goes to whoever applies the playbook.
                        </p>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}

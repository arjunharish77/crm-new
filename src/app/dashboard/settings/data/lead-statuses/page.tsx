"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { StandardSheet } from "@/components/common/standard-sheet";
import { FormField } from "@/components/common/form-field";
import { ErrorState } from "@/components/common/error-state";
import { useConfirm } from "@/components/common/dialogs-provider";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeadStatuses } from "@/hooks/use-lead-statuses";
import type { StatusTone } from "@/lib/display/status";

type Category = "OPEN" | "CONVERTED" | "LOST";
type Status = { id: string; key: string; label: string; tone: StatusTone; category: Category; order: number; isActive: boolean; leadCount?: number };

const CATEGORIES: Array<{ value: Category; label: string; help: string }> = [
    { value: "OPEN", label: "Open", help: "Still being worked: shows in call queues, recommendations and open-lead views." },
    { value: "CONVERTED", label: "Converted", help: "Became a customer or applicant. Counts as converted in reports." },
    { value: "LOST", label: "Lost", help: "Won't convert, including disqualified. Leaves work queues." },
];
const TONES: Array<{ value: StatusTone; label: string }> = [
    { value: "info", label: "Blue" },
    { value: "accent", label: "Purple" },
    { value: "success", label: "Green" },
    { value: "warning", label: "Amber" },
    { value: "danger", label: "Red" },
    { value: "neutral", label: "Grey" },
];
const categoryLabel = (value: Category) => CATEGORIES.find((item) => item.value === value)?.label ?? value;

// Settings › Lead statuses (UI/UX plan decision 6). Each status has a name, a colour, an order and
// a category; the category decides whether a lead counts as open, converted or lost everywhere
// in the app.
export default function LeadStatusesPage() {
    const confirm = useConfirm();
    const { refresh } = useLeadStatuses();
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<Partial<Status> | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            setStatuses(await apiFetch<Status[]>("/lead-statuses?all=1"));
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const afterChange = async () => { await load(); refresh(); };

    const save = async () => {
        if (!editing) return;
        const label = String(editing.label ?? "").trim();
        if (!label) { setError("Enter a name"); return; }
        setBusy(true);
        setError(null);
        try {
            const body = JSON.stringify({ label, tone: editing.tone ?? "neutral", category: editing.category ?? "OPEN" });
            if (editing.id) await apiFetch(`/lead-statuses/${editing.id}`, { method: "PATCH", body });
            else await apiFetch("/lead-statuses", { method: "POST", body });
            toast.success(editing.id ? "Status updated" : "Status added");
            setEditing(null);
            await afterChange();
        } catch (err: any) {
            setError(err?.message || "Couldn't save the status");
        } finally {
            setBusy(false);
        }
    };

    const toggleActive = async (status: Status, isActive: boolean) => {
        setStatuses((current) => current.map((item) => (item.id === status.id ? { ...item, isActive } : item)));
        try {
            await apiFetch(`/lead-statuses/${status.id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
            toast.success(isActive ? `${status.label} can be chosen again` : `${status.label} turned off; leads that have it keep it`);
            refresh();
        } catch (err: any) {
            setStatuses((current) => current.map((item) => (item.id === status.id ? { ...item, isActive: !isActive } : item)));
            toast.error(err?.message || "Couldn't change the status");
        }
    };

    const move = async (index: number, direction: -1 | 1) => {
        const next = [...statuses];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setStatuses(next);
        try {
            await apiFetch("/lead-statuses/reorder", { method: "POST", body: JSON.stringify({ ids: next.map((item) => item.id) }) });
            refresh();
        } catch (err: any) {
            toast.error(err?.message || "Couldn't reorder");
            load();
        }
    };

    const remove = async (status: Status) => {
        const ok = await confirm({ title: `Delete "${status.label}"?`, description: "No leads have this status. It will be removed from the list.", confirmLabel: "Delete status", destructive: true });
        if (!ok) return;
        try {
            await apiFetch(`/lead-statuses/${status.id}`, { method: "DELETE" });
            toast.success("Status deleted");
            await afterChange();
        } catch (err: any) {
            toast.error(err?.message || "Couldn't delete the status");
        }
    };

    return (
        <div className="min-w-0">
            <PageHeader
                title="Lead statuses"
                description="The stages a lead moves through. The category decides whether a lead counts as open, converted or lost in queues, recommendations, reports and data retention."
                primaryAction={<Button onClick={() => { setError(null); setEditing({ tone: "neutral", category: "OPEN" }); }}><Plus className="size-4" />Add status</Button>}
            />
            <Card className="gap-0 overflow-hidden py-0">
                {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-10" />)}</div>
                ) : failed ? (
                    <ErrorState description="Lead statuses couldn't be loaded." onRetry={load} />
                ) : (
                    <ol aria-label="Lead statuses in order" className="divide-y">
                        {statuses.map((status, index) => (
                            <li key={status.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                                <div className="flex shrink-0 flex-col">
                                    <IconButton label={`Move ${status.label} up`} size="icon-xs" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></IconButton>
                                    <IconButton label={`Move ${status.label} down`} size="icon-xs" disabled={index === statuses.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></IconButton>
                                </div>
                                <div className="min-w-40 flex-1">
                                    <StatusBadge tone={status.tone} label={status.label} className={status.isActive ? undefined : "opacity-60"} />
                                </div>
                                <span className="w-24 text-sm text-muted-foreground">{categoryLabel(status.category)}</span>
                                <span className="w-24 text-sm tabular-nums text-muted-foreground">{(status.leadCount ?? 0).toLocaleString()} lead{status.leadCount === 1 ? "" : "s"}</span>
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Switch checked={status.isActive} onCheckedChange={(checked) => toggleActive(status, checked)} aria-label={`${status.label} can be chosen`} />
                                    {status.isActive ? "In use" : "Off"}
                                </label>
                                <div className="flex items-center gap-0.5">
                                    <IconButton label={`Edit ${status.label}`} onClick={() => { setError(null); setEditing(status); }}><Pencil className="size-4" /></IconButton>
                                    {!status.leadCount ? (
                                        <IconButton label={`Delete ${status.label}`} onClick={() => remove(status)} className="text-destructive"><Trash2 className="size-4" /></IconButton>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </Card>
            <p className="mt-3 text-sm text-muted-foreground">
                A status with leads can&apos;t be deleted: turn it off instead. It stays on those leads but can&apos;t be chosen for new changes.
            </p>

            <StandardSheet
                open={!!editing}
                onClose={() => setEditing(null)}
                title={editing?.id ? "Edit status" : "Add status"}
                actions={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button isLoading={busy} onClick={save}>{editing?.id ? "Save changes" : "Add status"}</Button></>}
            >
                {editing ? (
                    <div className="space-y-5">
                        <FormField id="lead-status-label" label="Name" required error={error}>
                            <Input value={editing.label ?? ""} maxLength={60} onChange={(event) => setEditing({ ...editing, label: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") save(); }} autoFocus />
                        </FormField>
                        <FormField id="lead-status-category" label="Category" required help={CATEGORIES.find((item) => item.value === (editing.category ?? "OPEN"))?.help}>
                            <Select value={editing.category ?? "OPEN"} onValueChange={(value) => setEditing({ ...editing, category: value as Category })}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{CATEGORIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </FormField>
                        <FormField id="lead-status-tone" label="Colour">
                            <Select value={editing.tone ?? "neutral"} onValueChange={(value) => setEditing({ ...editing, tone: value as StatusTone })}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {TONES.map((item) => (
                                        <SelectItem key={item.value} value={item.value}><StatusBadge tone={item.value} label={item.label} /></SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormField>
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium">Preview</p>
                            <StatusBadge tone={editing.tone ?? "neutral"} label={String(editing.label ?? "").trim() || "Status"} />
                        </div>
                        {editing.id ? <p className="text-xs text-muted-foreground">Key: <span className="font-mono">{editing.key}</span> (used by integrations; it doesn&apos;t change when you rename).</p> : null}
                    </div>
                ) : null}
            </StandardSheet>
        </div>
    );
}

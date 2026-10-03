"use client";
import { ModuleGate } from "@/components/common/module-gate";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PhoneCall, Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StandardDialog } from "@/components/common/standard-dialog";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/common/dialogs-provider";

type Outcome = {
    id: string;
    groupId: string;
    parentOutcomeId: string | null;
    name: string;
    order: number;
    isActive: boolean;
    requiredFields: string[];
};

type Group = {
    id: string;
    name: string;
    order: number;
    isActive: boolean;
    outcomes: Outcome[];
};

const REQUIRABLE_FIELDS: { key: string; label: string }[] = [
    { key: "reasonLost", label: "Reason Lost" },
    { key: "interestLevel", label: "Interest Level" },
    { key: "nextAction", label: "Next Action" },
    { key: "callbackAt", label: "Callback Date/Time" },
    { key: "notes", label: "Notes" },
];

function CallDispositionsSettingsPageContent() {
    const confirm = useConfirm();
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [groupDialog, setGroupDialog] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null });
    const [outcomeDialog, setOutcomeDialog] = useState<{ open: boolean; groupId: string; outcome: Outcome | null }>({
        open: false,
        groupId: "",
        outcome: null,
    });

    const load = () => {
        setLoading(true);
        setLoadError(null);
        apiFetch<Group[]>("/disposition-groups")
            .then((data) => setGroups(Array.isArray(data) ? data : []))
            .catch(() => setLoadError("Failed to load call dispositions."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleExpanded = (groupId: string) => setExpanded((current) => ({ ...current, [groupId]: !current[groupId] }));

    const deleteGroup = async (group: Group) => {
        if (!(await confirm({ title: `Delete ${group.name}?`, description: "Outcomes already logged with it keep their history.", confirmLabel: "Delete group", destructive: true }))) return;
        try {
            await apiFetch(`/disposition-groups/${group.id}`, { method: "DELETE" });
            setGroups((current) => current.filter((g) => g.id !== group.id));
            toast.success("Disposition group deleted");
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete disposition group");
        }
    };

    const deleteOutcome = async (outcome: Outcome) => {
        if (!(await confirm({ title: `Delete ${outcome.name}?`, description: "Calls already logged with it keep their history.", confirmLabel: "Delete outcome", destructive: true }))) return;
        try {
            await apiFetch(`/disposition-outcomes/${outcome.id}`, { method: "DELETE" });
            setGroups((current) =>
                current.map((g) => (g.id === outcome.groupId ? { ...g, outcomes: g.outcomes.filter((o) => o.id !== outcome.id) } : g)),
            );
            toast.success("Disposition outcome deleted");
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete disposition outcome");
        }
    };

    const moveGroup = async (group: Group, direction: -1 | 1) => {
        const sorted = [...groups].sort((a, b) => a.order - b.order);
        const index = sorted.findIndex((g) => g.id === group.id);
        const swapWith = sorted[index + direction];
        if (!swapWith) return;
        [sorted[index], sorted[index + direction]] = [sorted[index + direction], sorted[index]];
        setGroups(sorted);
        try {
            await apiFetch("/disposition-groups/reorder", { method: "PUT", body: JSON.stringify({ ids: sorted.map((g) => g.id) }) });
        } catch {
            toast.error("Failed to reorder disposition groups");
            load();
        }
    };

    const moveOutcome = async (outcome: Outcome, direction: -1 | 1) => {
        const group = groups.find((g) => g.id === outcome.groupId);
        if (!group) return;
        const siblings = group.outcomes.filter((o) => o.parentOutcomeId === outcome.parentOutcomeId).sort((a, b) => a.order - b.order);
        const index = siblings.findIndex((o) => o.id === outcome.id);
        const swapWith = siblings[index + direction];
        if (!swapWith) return;
        [siblings[index], siblings[index + direction]] = [siblings[index + direction], siblings[index]];
        const others = group.outcomes.filter((o) => o.parentOutcomeId !== outcome.parentOutcomeId);
        setGroups((current) => current.map((g) => (g.id === group.id ? { ...g, outcomes: [...others, ...siblings] } : g)));
        try {
            await apiFetch(`/disposition-groups/${group.id}/outcomes/reorder`, {
                method: "PUT",
                body: JSON.stringify({ ids: siblings.map((o) => o.id) }),
            });
        } catch {
            toast.error("Failed to reorder disposition outcomes");
            load();
        }
    };

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="Call outcomes" description="Configure call outcomes and the information agents must capture." actions={
                <Button onClick={() => setGroupDialog({ open: true, group: null })}>
                    <Plus className="size-4" />
                    Add Group
                </Button>
            } />

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : loadError ? (
                <ErrorState description={loadError} onRetry={load} />
            ) : groups.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                    No disposition groups configured yet. Add one to let agents log structured call outcomes.
                </Card>
            ) : (
                <div className="space-y-3">
                    {[...groups]
                        .sort((a, b) => a.order - b.order)
                        .map((group, index, sortedGroups) => {
                            const topLevelOutcomes = group.outcomes.filter((o) => !o.parentOutcomeId).sort((a, b) => a.order - b.order);
                            return (
                                <Card key={group.id} className="overflow-hidden py-0">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                                        <button
                                            type="button"
                                            className="flex min-w-0 items-center gap-2 text-left"
                                            onClick={() => toggleExpanded(group.id)}
                                        >
                                            <ChevronRight className={cn("size-4 shrink-0 transition-transform", expanded[group.id] && "rotate-90")} />
                                            <PhoneCall className="size-4 shrink-0 text-primary" />
                                            <span className="truncate font-bold">{group.name}</span>
                                            {!group.isActive && <Badge variant="outline">Inactive</Badge>}
                                            <span className="text-xs text-muted-foreground">{group.outcomes.length} outcome(s)</span>
                                        </button>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveGroup(group, -1)}>
                                                <ChevronUp className="size-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" disabled={index === sortedGroups.length - 1} onClick={() => moveGroup(group, 1)}>
                                                <ChevronDown className="size-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => setOutcomeDialog({ open: true, groupId: group.id, outcome: null })}>
                                                <Plus className="size-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => setGroupDialog({ open: true, group })}>
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => deleteGroup(group)}>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {expanded[group.id] && (
                                        <div className="divide-y">
                                            {topLevelOutcomes.length === 0 ? (
                                                <p className="p-3 text-sm text-muted-foreground">No outcomes in this group yet.</p>
                                            ) : (
                                                topLevelOutcomes.map((outcome, outcomeIndex) => (
                                                    <div key={outcome.id} className="flex flex-wrap items-center justify-between gap-2 p-3 pl-9">
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <span className="truncate font-medium">{outcome.name}</span>
                                                            {!outcome.isActive && <Badge variant="outline">Inactive</Badge>}
                                                            {outcome.requiredFields.length > 0 && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    requires: {outcome.requiredFields.join(", ")}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={outcomeIndex === 0}
                                                                onClick={() => moveOutcome(outcome, -1)}
                                                            >
                                                                <ChevronUp className="size-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={outcomeIndex === topLevelOutcomes.length - 1}
                                                                onClick={() => moveOutcome(outcome, 1)}
                                                            >
                                                                <ChevronDown className="size-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => setOutcomeDialog({ open: true, groupId: group.id, outcome })}
                                                            >
                                                                <Pencil className="size-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => deleteOutcome(outcome)}>
                                                                <Trash2 className="size-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                </div>
            )}

            {groupDialog.open && (
                <GroupDialog
                    group={groupDialog.group}
                    onClose={() => setGroupDialog({ open: false, group: null })}
                    onSaved={(saved) => {
                        setGroups((current) => {
                            const exists = current.some((g) => g.id === saved.id);
                            return exists
                                ? current.map((g) => (g.id === saved.id ? { ...g, ...saved } : g))
                                : [...current, { ...saved, outcomes: [] }];
                        });
                        setGroupDialog({ open: false, group: null });
                    }}
                />
            )}

            {outcomeDialog.open && (
                <OutcomeDialog
                    groupId={outcomeDialog.groupId}
                    outcome={outcomeDialog.outcome}
                    parentOptions={groups.find((g) => g.id === outcomeDialog.groupId)?.outcomes.filter((o) => !o.parentOutcomeId) ?? []}
                    onClose={() => setOutcomeDialog({ open: false, groupId: "", outcome: null })}
                    onSaved={(saved) => {
                        setGroups((current) =>
                            current.map((g) => {
                                if (g.id !== outcomeDialog.groupId) return g;
                                const exists = g.outcomes.some((o) => o.id === saved.id);
                                return { ...g, outcomes: exists ? g.outcomes.map((o) => (o.id === saved.id ? saved : o)) : [...g.outcomes, saved] };
                            }),
                        );
                        setExpanded((current) => ({ ...current, [outcomeDialog.groupId]: true }));
                        setOutcomeDialog({ open: false, groupId: "", outcome: null });
                    }}
                />
            )}
        </div>
    );
}

function GroupDialog({ group, onClose, onSaved }: { group: Group | null; onClose: () => void; onSaved: (group: Group) => void }) {
    const [name, setName] = useState(group?.name ?? "");
    const [isActive, setIsActive] = useState(group?.isActive ?? true);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        setSaving(true);
        try {
            const saved = group
                ? await apiFetch<Group>(`/disposition-groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ name, isActive }) })
                : await apiFetch<Group>("/disposition-groups", { method: "POST", body: JSON.stringify({ name, isActive }) });
            onSaved(saved);
            toast.success(group ? "Disposition group updated" : "Disposition group created");
        } catch (error: any) {
            toast.error(error?.message || "Failed to save disposition group");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open
            onClose={onClose}
            title={group ? "Edit Disposition Group" : "Add Disposition Group"}
            maxWidth="xs"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} onClick={save}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <div className="space-y-1.5">
                    <Label htmlFor="disposition-group-name">Name</Label>
                    <Input id="disposition-group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Call Outcomes" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                    <Label>Active</Label>
                </div>
            </div>
        </StandardDialog>
    );
}

function OutcomeDialog({
    groupId,
    outcome,
    parentOptions,
    onClose,
    onSaved,
}: {
    groupId: string;
    outcome: Outcome | null;
    parentOptions: Outcome[];
    onClose: () => void;
    onSaved: (outcome: Outcome) => void;
}) {
    const [name, setName] = useState(outcome?.name ?? "");
    const [isActive, setIsActive] = useState(outcome?.isActive ?? true);
    const [parentOutcomeId, setParentOutcomeId] = useState(outcome?.parentOutcomeId ?? "");
    const [requiredFields, setRequiredFields] = useState<string[]>(outcome?.requiredFields ?? []);
    const [saving, setSaving] = useState(false);

    const toggleField = (key: string) =>
        setRequiredFields((current) => (current.includes(key) ? current.filter((f) => f !== key) : [...current, key]));

    const save = async () => {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        setSaving(true);
        try {
            const payload = { name, isActive, requiredFields, parentOutcomeId: parentOutcomeId || null };
            const saved = outcome
                ? await apiFetch<Outcome>(`/disposition-outcomes/${outcome.id}`, { method: "PATCH", body: JSON.stringify(payload) })
                : await apiFetch<Outcome>(`/disposition-groups/${groupId}/outcomes`, { method: "POST", body: JSON.stringify(payload) });
            onSaved(saved);
            toast.success(outcome ? "Disposition outcome updated" : "Disposition outcome created");
        } catch (error: any) {
            toast.error(error?.message || "Failed to save disposition outcome");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open
            onClose={onClose}
            title={outcome ? "Edit Disposition Outcome" : "Add Disposition Outcome"}
            maxWidth="sm"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} onClick={save}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <div className="space-y-1.5">
                    <Label htmlFor="disposition-outcome-name">Name</Label>
                    <Input id="disposition-outcome-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Interested -- Follow Up" />
                </div>
                {parentOptions.length > 0 && (
                    <div className="space-y-1.5">
                        <Label>Parent Outcome (optional, makes this a sub-outcome)</Label>
                        <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={parentOutcomeId}
                            onChange={(e) => setParentOutcomeId(e.target.value)}
                        >
                            <option value="">None -- top-level outcome</option>
                            {parentOptions
                                .filter((option) => option.id !== outcome?.id)
                                .map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.name}
                                    </option>
                                ))}
                        </select>
                    </div>
                )}
                <div className="space-y-1.5">
                    <Label>Required fields when this outcome is selected</Label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {REQUIRABLE_FIELDS.map((field) => (
                            <label key={field.key} className="flex flex-wrap items-center gap-2 text-sm">
                                <Checkbox checked={requiredFields.includes(field.key)} onCheckedChange={() => toggleField(field.key)} />
                                {field.label}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                    <Label>Active</Label>
                </div>
            </div>
        </StandardDialog>
    );
}

export default function CallDispositionsSettingsPage() {
    return <ModuleGate moduleKey="TELEPHONY" name="Telephony"><CallDispositionsSettingsPageContent /></ModuleGate>;
}

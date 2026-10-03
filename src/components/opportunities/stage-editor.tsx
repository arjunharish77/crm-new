"use client";

import { useCallback, useEffect, useState } from "react";
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/display/format";

type StageKind = "OPEN" | "WON" | "LOST";
type Stage = { id: string; name: string; order: number; probability: number; color: string | null; kind: StageKind; opportunityCount: number };

const KIND_LABEL: Record<StageKind, string> = { OPEN: "Open", WON: "Won", LOST: "Lost" };
const KIND_TONE = { OPEN: "neutral", WON: "success", LOST: "danger" } as const;

// The stage editor for one opportunity type (UI/UX plan decision 34). The server enforces the
// rules (repositories/stages-postgres.ts); this shows them before you hit them: removing a stage
// with opportunities asks where to move them, and a type keeps one open, one Won and one Lost
// stage.
export function StageEditor({ typeId, typeName, open, onOpenChange, onChanged }: {
    typeId: string;
    typeName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChanged?: () => void;
}) {
    const [stages, setStages] = useState<Stage[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [editing, setEditing] = useState<Stage | "new" | null>(null);
    const [removing, setRemoving] = useState<Stage | null>(null);
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const load = useCallback(async () => {
        setFailed(false);
        try {
            setStages(await apiFetch<Stage[]>(`/opportunity-types/${typeId}/stages`));
        } catch {
            setFailed(true);
        }
    }, [typeId]);
    useEffect(() => { if (open) { setStages(null); load(); } }, [open, load]);

    const changed = () => { load(); onChanged?.(); };

    const onDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!stages || !over || active.id === over.id) return;
        const previous = stages;
        const next = arrayMove(stages, stages.findIndex((stage) => stage.id === active.id), stages.findIndex((stage) => stage.id === over.id));
        setStages(next);
        try {
            await apiFetch(`/opportunity-types/${typeId}/stages/reorder`, { method: "PUT", body: JSON.stringify({ ids: next.map((stage) => stage.id) }) });
            onChanged?.();
        } catch (error: any) {
            setStages(previous);
            toast.error(error?.message || "The new order couldn't be saved");
        }
    };

    const counts = { OPEN: 0, WON: 0, LOST: 0 } as Record<StageKind, number>;
    for (const stage of stages ?? []) counts[stage.kind] += 1;

    return (
        <StandardDialog open={open} onClose={() => onOpenChange(false)} title={`Stages for ${typeName}`} maxWidth="md">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">Drag to change the order of the board and the stage path. Every type needs an open, a Won and a Lost stage.</p>
                    <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" />Add stage</Button>
                </div>
                {failed ? (
                    <ErrorState variant="inline" description="The stages couldn't be loaded." onRetry={load} />
                ) : stages === null ? (
                    <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                        <SortableContext items={stages.map((stage) => stage.id)} strategy={verticalListSortingStrategy}>
                            <ul className="divide-y rounded-lg border">
                                {stages.map((stage) => (
                                    <StageRow
                                        key={stage.id}
                                        stage={stage}
                                        onlyOfKind={counts[stage.kind] === 1}
                                        onEdit={() => setEditing(stage)}
                                        onRemove={() => setRemoving(stage)}
                                    />
                                ))}
                            </ul>
                        </SortableContext>
                    </DndContext>
                )}
            </div>
            {editing ? (
                <StageDialog typeId={typeId} stage={editing === "new" ? null : editing} onlyOfKind={editing !== "new" && counts[editing.kind] === 1} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />
            ) : null}
            {removing && stages ? (
                <RemoveStageDialog typeId={typeId} stage={removing} others={stages.filter((stage) => stage.id !== removing.id)} onClose={() => setRemoving(null)} onRemoved={() => { setRemoving(null); changed(); }} />
            ) : null}
        </StandardDialog>
    );
}

function StageRow({ stage, onlyOfKind, onEdit, onRemove }: { stage: Stage; onlyOfKind: boolean; onEdit: () => void; onRemove: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
    const removeBlocked = onlyOfKind ? `The only ${KIND_LABEL[stage.kind].toLowerCase()} stage can't be removed` : stage.kind !== "OPEN" && stage.opportunityCount > 0 ? "Opportunities are in this stage" : null;
    return (
        <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 bg-card shadow-menu" : "bg-card"}>
            <div className="flex min-w-0 items-center gap-2 px-2 py-2">
                <button type="button" className="cursor-grab rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Move ${stage.name}`} {...attributes} {...listeners}>
                    <GripVertical className="size-4" aria-hidden />
                </button>
                <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-muted-foreground" style={stage.color ? { backgroundColor: stage.color } : undefined} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{stage.name}</span>
                        <StatusBadge tone={KIND_TONE[stage.kind]} label={KIND_LABEL[stage.kind]} />
                    </div>
                    <p className="text-xs text-muted-foreground">{stage.probability}% likely to win · {formatCount(stage.opportunityCount)} {stage.opportunityCount === 1 ? "opportunity" : "opportunities"}</p>
                </div>
                <IconButton label={`Edit ${stage.name}`} onClick={onEdit}><Pencil className="size-4" /></IconButton>
                <IconButton label={removeBlocked ? `Can't remove ${stage.name}: ${removeBlocked}` : `Remove ${stage.name}`} onClick={onRemove} disabled={!!removeBlocked} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></IconButton>
            </div>
        </li>
    );
}

function StageDialog({ typeId, stage, onlyOfKind, onClose, onSaved }: { typeId: string; stage: Stage | null; onlyOfKind: boolean; onClose: () => void; onSaved: () => void }) {
    const [name, setName] = useState(stage?.name ?? "");
    const [kind, setKind] = useState<StageKind>(stage?.kind ?? "OPEN");
    const [probability, setProbability] = useState(String(stage?.probability ?? 20));
    const [color, setColor] = useState(stage?.color ?? "#2563eb");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const kindLocked = !!stage && (stage.opportunityCount > 0 || onlyOfKind);

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) { setError("Enter a name for the stage."); return; }
        const value = Number(probability);
        if (kind === "OPEN" && (!Number.isFinite(value) || value < 0 || value > 100)) { setError("Probability must be between 0 and 100."); return; }
        setSaving(true);
        setError("");
        try {
            const body = { name, kind, probability: kind === "OPEN" ? value : undefined, color };
            await apiFetch(stage ? `/opportunity-types/${typeId}/stages/${stage.id}` : `/opportunity-types/${typeId}/stages`, { method: stage ? "PATCH" : "POST", body: JSON.stringify(body) });
            toast.success(stage ? "Stage saved" : `“${name.trim()}” added`);
            onSaved();
        } catch (caught: any) {
            setError(caught?.message || "The stage couldn't be saved.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open
            onClose={() => { if (!saving) onClose(); }}
            title={stage ? `Edit “${stage.name}”` : "Add a stage"}
            maxWidth="xs"
            actions={<>
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button type="submit" form="stage-dialog-form" isLoading={saving}>{stage ? "Save changes" : "Add stage"}</Button>
            </>}
        >
            <form id="stage-dialog-form" onSubmit={save} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                    <Label htmlFor="stage-name">Name</Label>
                    <Input id="stage-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} autoFocus />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="stage-kind">Kind</Label>
                    <Select value={kind} onValueChange={(value) => setKind(value as StageKind)} disabled={kindLocked}>
                        <SelectTrigger id="stage-kind" className="w-full" aria-describedby={kindLocked ? "stage-kind-help" : undefined}><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="OPEN">Open: still being worked</SelectItem>
                            <SelectItem value="WON">Won: closed as a sale</SelectItem>
                            <SelectItem value="LOST">Lost: closed without a sale</SelectItem>
                        </SelectContent>
                    </Select>
                    {kindLocked ? <p id="stage-kind-help" className="text-sm text-muted-foreground">{stage && stage.opportunityCount > 0 ? "Opportunities are in this stage, so its kind can't change." : "This is the only stage of its kind."}</p> : null}
                </div>
                {kind === "OPEN" ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="stage-probability">Likelihood to win (%)</Label>
                        <Input id="stage-probability" type="number" inputMode="numeric" min={0} max={100} value={probability} onChange={(event) => setProbability(event.target.value)} className="w-32" />
                    </div>
                ) : <p className="text-sm text-muted-foreground">{kind === "WON" ? "Won stages count as 100% likely." : "Lost stages count as 0% likely."}</p>}
                <div className="space-y-1.5">
                    <Label htmlFor="stage-color">Colour</Label>
                    <div className="flex items-center gap-2">
                        <input id="stage-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-input bg-card" />
                        <span className="font-mono text-sm text-muted-foreground">{color}</span>
                    </div>
                </div>
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            </form>
        </StandardDialog>
    );
}

function RemoveStageDialog({ typeId, stage, others, onClose, onRemoved }: { typeId: string; stage: Stage; others: Stage[]; onClose: () => void; onRemoved: () => void }) {
    const targets = others.filter((item) => item.kind === "OPEN");
    const [target, setTarget] = useState<string>(targets[0]?.id ?? "");
    const [error, setError] = useState("");
    const [removing, setRemoving] = useState(false);
    const needsMove = stage.opportunityCount > 0;

    const remove = async () => {
        if (needsMove && !target) { setError("Choose the stage to move the opportunities to."); return; }
        setRemoving(true);
        setError("");
        try {
            const result = await apiFetch<{ moved: number }>(`/opportunity-types/${typeId}/stages/${stage.id}`, { method: "DELETE", body: JSON.stringify({ moveToStageId: needsMove ? target : null }) });
            const destination = others.find((item) => item.id === target)?.name;
            toast.success(result.moved ? `“${stage.name}” removed; ${formatCount(result.moved)} moved to ${destination}` : `“${stage.name}” removed`);
            onRemoved();
        } catch (caught: any) {
            setError(caught?.message || "The stage couldn't be removed.");
        } finally {
            setRemoving(false);
        }
    };

    return (
        <StandardDialog
            open
            onClose={() => { if (!removing) onClose(); }}
            title={`Remove “${stage.name}”?`}
            maxWidth="xs"
            actions={<>
                <Button variant="outline" onClick={onClose} disabled={removing}>Cancel</Button>
                <Button variant="destructive" onClick={remove} isLoading={removing} disabled={needsMove && !target}>{needsMove ? `Move ${formatCount(stage.opportunityCount)} and remove` : "Remove stage"}</Button>
            </>}
        >
            <div className="space-y-4">
                {needsMove ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="stage-move-to">Move its {formatCount(stage.opportunityCount)} {stage.opportunityCount === 1 ? "opportunity" : "opportunities"} to</Label>
                        <Select value={target} onValueChange={setTarget}>
                            <SelectTrigger id="stage-move-to" className="w-full"><SelectValue placeholder="Choose a stage" /></SelectTrigger>
                            <SelectContent>{targets.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">Each move is recorded in the opportunity&apos;s stage history. No automations run for these moves.</p>
                    </div>
                ) : <p className="text-sm text-muted-foreground">No opportunities are in this stage.</p>}
                <p className="text-sm text-muted-foreground">The stage stops appearing on the board and in pickers. Its name stays in past history.</p>
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            </div>
        </StandardDialog>
    );
}

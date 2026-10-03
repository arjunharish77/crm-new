"use client";

import { useCallback, useEffect, useState } from "react";
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StandardDialog } from "@/components/common/standard-dialog";
import { useConfirm } from "@/components/common/dialogs-provider";
import { ErrorState } from "@/components/common/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

// The one custom-field editor (UI/UX plan §11.7): Settings › Objects & fields for fields on every
// lead, opportunity or activity, and the opportunity-type and activity-type pages for fields on
// one type. Both are rows in FieldDefinition (a type's fields carry its id), so both use
// /api/custom-fields. It replaced three editors with different payloads and contradicting
// delete warnings; what is stored is unchanged.

export type ObjectType = "LEAD" | "OPPORTUNITY" | "ACTIVITY";
export type FieldScope = { entityType: "OPPORTUNITY_TYPE" | "ACTIVITY_TYPE"; typeId: string; typeName: string };

type Field = {
    id: string;
    key: string;
    label: string;
    type: string;
    fieldType: string;
    required: boolean;
    options: string[];
    order: number;
    entityTypeId: string | null;
};

// Only types that are stored as themselves ("Text area" was saved as plain text, so it isn't offered).
const FIELD_TYPES = [
    { value: "TEXT", label: "Text" },
    { value: "NUMBER", label: "Number" },
    { value: "DATE", label: "Date" },
    { value: "DATETIME", label: "Date and time" },
    { value: "DROPDOWN", label: "Dropdown" },
    { value: "MULTI_SELECT", label: "Multi-select" },
    { value: "BOOLEAN", label: "Checkbox" },
    { value: "EMAIL", label: "Email" },
    { value: "PHONE", label: "Phone" },
    { value: "URL", label: "Web address" },
];
const HAS_OPTIONS = new Set(["DROPDOWN", "MULTI_SELECT"]);

function typeLabel(field: Field) {
    const stored = field.type === "SELECT" ? "DROPDOWN" : field.type === "CHECKBOX" ? "BOOLEAN" : field.type;
    return FIELD_TYPES.find((item) => item.value === stored)?.label ?? stored;
}

function keyFromLabel(label: string) {
    return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

const NOUN: Record<ObjectType, string> = { LEAD: "lead", OPPORTUNITY: "opportunity", ACTIVITY: "activity" };

export function FieldsEditor({ objectType, scope }: { objectType: ObjectType; scope?: FieldScope }) {
    const confirm = useConfirm();
    const [fields, setFields] = useState<Field[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [typeNames, setTypeNames] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState<Field | "new" | null>(null);
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const rows = await apiFetch<Field[]>(`/custom-fields?objectType=${objectType}`);
            const list = (Array.isArray(rows) ? rows : [])
                .filter((field) => (scope ? field.entityTypeId === scope.typeId : true))
                .sort((a, b) => (a.entityTypeId ? 1 : 0) - (b.entityTypeId ? 1 : 0) || a.order - b.order);
            setFields(list);
        } catch {
            setFailed(true);
        }
    }, [objectType, scope]);
    useEffect(() => { setFields(null); load(); }, [load]);

    // Names for "Only for <type>" on the workspace list.
    useEffect(() => {
        if (scope || objectType === "LEAD") return;
        apiFetch<any[]>(objectType === "OPPORTUNITY" ? "/opportunity-types" : "/activity-types")
            .then((rows) => setTypeNames(Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [row.id, row.name]))))
            .catch(() => setTypeNames({}));
    }, [objectType, scope]);

    const remove = async (field: Field) => {
        const ok = await confirm({
            title: `Delete “${field.label}”?`,
            description: "It's removed from forms, records, filters and imports. Values already saved stay in the database but are no longer shown, and the field can't be brought back here.",
            confirmLabel: "Delete field",
            destructive: true,
        });
        if (!ok) return;
        try {
            await apiFetch(`/custom-fields/${field.id}`, { method: "DELETE" });
            toast.success(`“${field.label}” deleted`);
            load();
        } catch (error: any) {
            toast.error(error?.message || "The field couldn't be deleted");
        }
    };

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!fields || !over || active.id === over.id) return;
        const previous = fields;
        const next = arrayMove(fields, fields.findIndex((field) => field.id === active.id), fields.findIndex((field) => field.id === over.id));
        setFields(next);
        apiFetch(`/type-custom-fields/reorder/${scope?.typeId ?? objectType}`, { method: "PUT", body: JSON.stringify({ ids: next.map((field) => field.id) }) })
            .catch(() => { setFields(previous); toast.error("The new order couldn't be saved"); });
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    {scope
                        ? `Fields only on ${scope.typeName}. Fields on every ${NOUN[objectType]} are in Settings › Objects & fields. Drag to change the order.`
                        : `Fields on every ${NOUN[objectType]}. Drag to change their order on forms and records.`}
                </p>
                <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" />Add field</Button>
            </div>
            {failed ? (
                <ErrorState variant="inline" description="The fields couldn't be loaded." onRetry={load} />
            ) : fields === null ? (
                <div className="space-y-2" aria-busy="true">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div>
            ) : fields.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No custom fields yet.</p>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                        <ul className="divide-y rounded-lg border">
                            {fields.map((field) => (
                                <FieldRow
                                    key={field.id}
                                    field={field}
                                    appliesTo={field.entityTypeId && !scope ? `Only for ${typeNames[field.entityTypeId] ?? "one type"}` : null}
                                    onEdit={() => setEditing(field)}
                                    onDelete={() => remove(field)}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}
            {editing ? (
                <FieldDialog
                    field={editing === "new" ? null : editing}
                    objectType={objectType}
                    scope={scope}
                    existingKeys={(fields ?? []).map((field) => field.key)}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            ) : null}
        </div>
    );
}

function FieldRow({ field, appliesTo, onEdit, onDelete }: { field: Field; appliesTo: string | null; onEdit: () => void; onDelete: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
    return (
        <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 bg-card shadow-menu" : "bg-card"}>
            <div className="flex min-w-0 items-center gap-2 px-2 py-2">
                <button type="button" className="cursor-grab rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Move ${field.label}`} {...attributes} {...listeners}>
                    <GripVertical className="size-4" aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{field.label}</span>
                        {field.required ? <Badge tone="neutral">Required</Badge> : null}
                        {appliesTo ? <Badge tone="info">{appliesTo}</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{typeLabel(field)} · <code className="font-mono">{field.key}</code>{field.options?.length ? ` · ${field.options.length} options` : ""}</p>
                </div>
                <IconButton label={`Edit ${field.label}`} onClick={onEdit}><Pencil className="size-4" /></IconButton>
                <IconButton label={`Delete ${field.label}`} onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></IconButton>
            </div>
        </li>
    );
}

function FieldDialog({ field, objectType, scope, existingKeys, onClose, onSaved }: {
    field: Field | null;
    objectType: ObjectType;
    scope?: FieldScope;
    existingKeys: string[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const storedType = field ? (field.type === "SELECT" ? "DROPDOWN" : field.type === "CHECKBOX" ? "BOOLEAN" : field.type) : "TEXT";
    const [label, setLabel] = useState(field?.label ?? "");
    const [key, setKey] = useState(field?.key ?? "");
    const [keyTouched, setKeyTouched] = useState(!!field);
    const [type, setType] = useState(storedType);
    const [required, setRequired] = useState(field?.required ?? false);
    const [options, setOptions] = useState((field?.options ?? []).join("\n"));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const effectiveKey = keyTouched ? key : keyFromLabel(label);
    const optionList = options.split("\n").map((option) => option.trim()).filter(Boolean);

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        const next: Record<string, string> = {};
        if (label.trim().length < 2) next.label = "Enter a name of at least 2 characters.";
        if (!field) {
            if (!/^[a-z][a-z0-9_]{1,59}$/.test(effectiveKey)) next.key = "Use 2–60 lowercase letters, numbers or underscores, starting with a letter.";
            else if (existingKeys.includes(effectiveKey)) next.key = "Another field already uses this key.";
        }
        if (HAS_OPTIONS.has(type) && optionList.length === 0) next.options = "Add at least one option, one per line.";
        if (new Set(optionList).size !== optionList.length) next.options = "Each option must be different.";
        setErrors(next);
        if (Object.keys(next).length) return;
        setSaving(true);
        try {
            const body: Record<string, unknown> = { label: label.trim(), type, required, options: HAS_OPTIONS.has(type) ? optionList : null };
            if (field) {
                await apiFetch(`/custom-fields/${field.id}`, { method: "PATCH", body: JSON.stringify(body) });
            } else {
                await apiFetch("/custom-fields", {
                    method: "POST",
                    body: JSON.stringify({ ...body, key: effectiveKey, objectType, ...(scope ? { entityType: scope.entityType, entityTypeId: scope.typeId } : {}) }),
                });
            }
            toast.success(field ? "Field saved" : `“${label.trim()}” added`);
            onSaved();
        } catch (error: any) {
            setErrors({ form: error?.message || "The field couldn't be saved." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open
            onClose={() => { if (!saving) onClose(); }}
            title={field ? `Edit “${field.label}”` : scope ? `Add a field to ${scope.typeName}` : `Add a ${NOUN[objectType]} field`}
            maxWidth="sm"
            actions={<>
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button type="submit" form="field-dialog-form" isLoading={saving}>{field ? "Save changes" : "Add field"}</Button>
            </>}
        >
            <form id="field-dialog-form" onSubmit={save} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                    <Label htmlFor="field-label">Name</Label>
                    <Input id="field-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="For example, Budget or Start date" aria-invalid={!!errors.label || undefined} aria-describedby={errors.label ? "field-label-error" : undefined} autoFocus />
                    {errors.label ? <p id="field-label-error" className="text-sm text-destructive">{errors.label}</p> : null}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="field-key">Key</Label>
                    <Input id="field-key" value={effectiveKey} disabled={!!field} onChange={(event) => { setKeyTouched(true); setKey(event.target.value); }} className="font-mono" aria-invalid={!!errors.key || undefined} aria-describedby="field-key-help" />
                    <p id="field-key-help" className={errors.key ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                        {errors.key ?? (field ? "The key can't change: saved values, imports and the API use it." : "Used by imports, the API and automations. It can't change after the field is added.")}
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="field-type">Type</Label>
                    <Select value={type} onValueChange={setType}>
                        <SelectTrigger id="field-type" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{FIELD_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {field && type !== storedType ? <p className="text-sm text-status-warning-foreground">Values already saved are kept as they are and may not fit the new type.</p> : null}
                </div>
                {HAS_OPTIONS.has(type) ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="field-options">Options, one per line</Label>
                        <Textarea id="field-options" rows={4} value={options} onChange={(event) => setOptions(event.target.value)} aria-invalid={!!errors.options || undefined} aria-describedby={errors.options ? "field-options-error" : undefined} />
                        {errors.options ? <p id="field-options-error" className="text-sm text-destructive">{errors.options}</p> : null}
                    </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                    <Switch checked={required} onCheckedChange={setRequired} />
                    Required on forms
                </label>
                {errors.form ? <p role="alert" className="text-sm text-destructive">{errors.form}</p> : null}
            </form>
        </StandardDialog>
    );
}

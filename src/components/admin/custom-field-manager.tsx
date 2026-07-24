"use client";

import { FormEvent, useEffect, useState } from 'react';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { StandardDialog } from '@/components/common/standard-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CustomField {
    id: string;
    fieldKey: string;
    fieldLabel: string;
    fieldType: string;
    isRequired: boolean;
    isActive: boolean;
    fieldConfig?: any;
}

interface CustomFieldManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityType: 'OPPORTUNITY_TYPE' | 'ACTIVITY_TYPE';
    relatedTypeId: string;
    relatedTypeName: string;
}

const FIELD_TYPES = [
    { value: 'TEXT', label: 'Text' },
    { value: 'NUMBER', label: 'Number' },
    { value: 'DATE', label: 'Date' },
    { value: 'DATETIME', label: 'Date & Time' },
    { value: 'DROPDOWN', label: 'Dropdown' },
    { value: 'MULTI_SELECT', label: 'Multi Select' },
    { value: 'BOOLEAN', label: 'Checkbox' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'PHONE', label: 'Phone' },
    { value: 'URL', label: 'URL' },
    { value: 'TEXTAREA', label: 'Text Area' },
];

function SortableFieldItem({ field, onEdit, onDelete }: { field: CustomField; onEdit: () => void; onDelete: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <Card
                className={cn(
                    "flex-row items-center justify-between gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-accent",
                    isDragging && "border-primary shadow-md"
                )}
            >
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="cursor-grab rounded-md p-1 text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                        aria-label={`Drag ${field.fieldLabel}`}
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-1">
                            <p className="text-sm font-semibold">{field.fieldLabel}</p>
                            {field.isRequired && <span className="text-xs text-destructive">*</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {FIELD_TYPES.find((t) => t.value === field.fieldType)?.label || field.fieldType}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onEdit}
                        className="text-primary hover:bg-primary/10 hover:text-primary"
                        aria-label={`Edit ${field.fieldLabel}`}
                    >
                        <Pencil size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onDelete}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${field.fieldLabel}`}
                    >
                        <Trash2 size={16} />
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function FieldEditor({
    open,
    onOpenChange,
    field,
    entityType,
    relatedTypeId,
    onSuccess
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    field: CustomField | null;
    entityType: string;
    relatedTypeId: string;
    onSuccess: () => void;
}) {
    const [label, setLabel] = useState(field?.fieldLabel || '');
    const [type, setType] = useState(field?.fieldType || 'TEXT');
    const [required, setRequired] = useState(field?.isRequired || false);
    const [options, setOptions] = useState<string>(field?.fieldConfig?.options?.join('\n') || '');
    const [placeholder, setPlaceholder] = useState(field?.fieldConfig?.placeholder || '');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!label) return toast.error("Label is required");

        setSubmitting(true);
        try {
            const fieldKey = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const parsedOptions = (type === 'DROPDOWN' || type === 'MULTI_SELECT')
                ? options.split('\n').map(o => o.trim()).filter((option) => option.length > 0)
                : undefined;

            const payload = {
                entityType,
                relatedTypeId,
                fieldLabel: label,
                fieldKey: field ? field.fieldKey : fieldKey,
                fieldType: type,
                isRequired: required,
                fieldConfig: {
                    placeholder,
                    options: parsedOptions
                }
            };

            const url = field ? `/type-custom-fields/${field.id}` : '/type-custom-fields';
            const method = field ? 'PATCH' : 'POST';

            await apiFetch(url, { method, body: JSON.stringify(payload) });
            toast.success("Field saved");
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to save field");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title={field ? 'Edit Field' : 'Add Field'}
            maxWidth="sm"
            actions={
                <>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save
                    </Button>
                </>
            }
        >
            <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                    <Label htmlFor="field-editor-label">Field Label</Label>
                    <Input
                        id="field-editor-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. Budget, Start Date"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FIELD_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {(type === 'DROPDOWN' || type === 'MULTI_SELECT') && (
                    <div className="space-y-2">
                        <Label htmlFor="field-editor-options">Options (one per line)</Label>
                        <Textarea
                            id="field-editor-options"
                            value={options}
                            onChange={(e) => setOptions(e.target.value)}
                            placeholder={"Option 1\nOption 2"}
                            rows={4}
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="field-editor-placeholder">Placeholder</Label>
                    <Input
                        id="field-editor-placeholder"
                        value={placeholder}
                        onChange={(e) => setPlaceholder(e.target.value)}
                        placeholder="Helper text..."
                    />
                </div>

                <label className="flex items-center gap-2 text-sm font-medium">
                    <Switch checked={required} onCheckedChange={setRequired} />
                    Required Field
                </label>
            </form>
        </StandardDialog>
    );
}

export function CustomFieldManager({
    open,
    onOpenChange,
    entityType,
    relatedTypeId,
    relatedTypeName,
}: CustomFieldManagerProps) {
    const [fields, setFields] = useState<CustomField[]>([]);
    const [loading, setLoading] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingField, setEditingField] = useState<CustomField | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (open && relatedTypeId) {
            fetchFields();
        }
    }, [open, relatedTypeId]);

    const fetchFields = async () => {
        try {
            setLoading(true);
            const data = await apiFetch(`/type-custom-fields/by-type/${entityType}/${relatedTypeId}`);
            setFields(data.sort((a: any, b: any) => a.order - b.order));
        } catch (error) {
            toast.error("Failed to load custom fields");
        } finally {
            setLoading(false);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setFields((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                // Persist order
                apiFetch(`/type-custom-fields/reorder/${relatedTypeId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ ids: newOrder.map(f => f.id) }),
                }).catch(() => toast.error("Failed to save order"));

                return newOrder;
            });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this field? Data will be lost.")) return;
        try {
            await apiFetch(`/type-custom-fields/${id}`, { method: 'DELETE' });
            toast.success("Field deleted");
            fetchFields();
        } catch (error) {
            toast.error("Failed to delete field");
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title={`Manage Fields: ${relatedTypeName}`}
            subtitle="Define custom fields for this type."
            maxWidth="md"
        >
            <div className="flex justify-end pb-3">
                <Button size="sm" onClick={() => { setEditingField(null); setEditorOpen(true); }}>
                    <Plus size={16} />
                    Add Field
                </Button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : fields.length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-muted-foreground">
                        <p>No custom fields yet.</p>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={fields.map(f => f.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {fields.map((field) => (
                                    <SortableFieldItem
                                        key={field.id}
                                        field={field}
                                        onEdit={() => { setEditingField(field); setEditorOpen(true); }}
                                        onDelete={() => handleDelete(field.id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {editorOpen && (
                <FieldEditor
                    open={editorOpen}
                    onOpenChange={setEditorOpen}
                    field={editingField}
                    entityType={entityType}
                    relatedTypeId={relatedTypeId}
                    onSuccess={() => {
                        setEditorOpen(false);
                        fetchFields();
                    }}
                />
            )}
        </StandardDialog>
    );
}

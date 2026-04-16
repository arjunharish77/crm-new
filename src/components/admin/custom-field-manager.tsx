"use client";

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Stack,
    IconButton,
    Paper,
    Typography,
    Switch,
    FormControlLabel,
    Divider,
    Grid
} from "@mui/material";
import {
    Add as PlusIcon,
    Edit as EditIcon,
    Delete as TrashIcon,
    DragIndicator as DragIcon,
    Close as CloseIcon
} from "@mui/icons-material";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
        <Paper
            ref={setNodeRef}
            style={style}
            variant="outlined"
            sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                borderRadius: 2,
                bgcolor: 'background.paper',
                '&:hover': {
                    bgcolor: 'action.hover'
                }
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box {...attributes} {...listeners} sx={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                    <DragIcon />
                </Box>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1" fontWeight={600}>{field.fieldLabel}</Typography>
                        {field.isRequired && <Typography variant="caption" color="error">*</Typography>}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                        {FIELD_TYPES.find(t => t.value === field.fieldType)?.label || field.fieldType}
                    </Typography>
                </Box>
            </Box>

            <Stack direction="row" spacing={1}>
                <IconButton size="small" onClick={onEdit} color="primary">
                    <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={onDelete} color="error">
                    <TrashIcon fontSize="small" />
                </IconButton>
            </Stack>
        </Paper>
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!label) return toast.error("Label is required");

        setSubmitting(true);
        try {
            const fieldKey = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const parsedOptions = (type === 'DROPDOWN' || type === 'MULTI_SELECT')
                ? options.split('\n').map(o => o.trim()).filter(Boolean)
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
        <Dialog
            open={open}
            onClose={() => onOpenChange(false)}
            maxWidth="sm"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3 } }}
        >
            <DialogTitle>{field ? 'Edit Field' : 'Add Field'}</DialogTitle>
            <DialogContent>
                <Stack spacing={3} component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                    <TextField
                        label="Field Label"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="e.g. Budget, Start Date"
                        required
                        fullWidth
                    />

                    <FormControl fullWidth>
                        <InputLabel>Type</InputLabel>
                        <Select
                            value={type}
                            label="Type"
                            onChange={(e) => setType(e.target.value)}
                        >
                            {FIELD_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {(type === 'DROPDOWN' || type === 'MULTI_SELECT') && (
                        <TextField
                            label="Options (one per line)"
                            value={options}
                            onChange={e => setOptions(e.target.value)}
                            placeholder="Option 1&#10;Option 2"
                            multiline
                            rows={4}
                            fullWidth
                        />
                    )}

                    <TextField
                        label="Placeholder"
                        value={placeholder}
                        onChange={e => setPlaceholder(e.target.value)}
                        placeholder="Helper text..."
                        fullWidth
                    />

                    <FormControlLabel
                        control={<Switch checked={required} onChange={(e) => setRequired(e.target.checked)} />}
                        label="Required Field"
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={() => onOpenChange(false)} sx={{ borderRadius: 20, color: 'text.secondary' }}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={submitting}
                    sx={{ borderRadius: 20 }}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
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
        <Dialog
            open={open}
            onClose={() => onOpenChange(false)}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3, height: '80vh', display: 'flex', flexDirection: 'column' } }}
        >
            <Box sx={{ px: 3, pt: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <DialogTitle sx={{ p: 0 }}>Manage Fields: {relatedTypeName}</DialogTitle>
                        <DialogContentText>Define custom fields for this type.</DialogContentText>
                    </Box>
                    <IconButton onClick={() => onOpenChange(false)}>
                        <CloseIcon />
                    </IconButton>
                </Stack>
            </Box>
            <Divider sx={{ my: 2 }} />

            <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={() => { setEditingField(null); setEditorOpen(true); }}
                        startIcon={<PlusIcon />}
                        sx={{ borderRadius: 20 }}
                    >
                        Add Field
                    </Button>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {fields.length === 0 ? (
                        <Box sx={{
                            p: 4,
                            textAlign: 'center',
                            border: '2px dashed',
                            borderColor: 'divider',
                            borderRadius: 2,
                            color: 'text.secondary'
                        }}>
                            <Typography>No custom fields yet.</Typography>
                        </Box>
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
                                <Stack spacing={2}>
                                    {fields.map((field) => (
                                        <SortableFieldItem
                                            key={field.id}
                                            field={field}
                                            onEdit={() => { setEditingField(field); setEditorOpen(true); }}
                                            onDelete={() => handleDelete(field.id)}
                                        />
                                    ))}
                                </Stack>
                            </SortableContext>
                        </DndContext>
                    )}
                </Box>
            </DialogContent>

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
        </Dialog>
    );
}

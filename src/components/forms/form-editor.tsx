"use client";

import { useState } from "react";
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    DragStartEvent,
    DragEndEvent,
    useDraggable,
    useDroppable,
    closestCenter
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Box,
    Button,
    Typography,
    TextField,
    Switch,
    FormControlLabel,
    Divider,
    Tab,
    Tabs,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Paper,
    Stack,
    Select,
    MenuItem,
    InputLabel,
    FormControl,
    useTheme,
    alpha
} from "@mui/material";
import {
    TextFields as TextFieldsIcon,
    Notes as NotesIcon,
    Numbers as NumbersIcon,
    Email as EmailIcon,
    Phone as PhoneIcon,
    Event as EventIcon,
    List as ListIcon,
    CheckBox as CheckBoxIcon,
    RadioButtonChecked as RadioButtonCheckedIcon,
    VisibilityOff as VisibilityOffIcon,
    Code as CodeIcon,
    Save as SaveIcon,
    DragIndicator as DragIndicatorIcon,
    Delete as DeleteIcon,
    Add as AddIcon,
    ColorLens as ColorLensIcon,
    Settings as SettingsIcon,
    Tune as TuneIcon
} from "@mui/icons-material";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { nanoid } from "nanoid";

import { EmbedCodeDialog } from "./EmbedCodeDialog";
import { StyleEditor } from "./style-editor";
import { ConditionalLogicBuilder } from "./logic-builder";

// --- Types ---
interface FormField {
    id: string;
    type: string;
    label: string;
    placeholder?: string;
    required: boolean;
    options?: string[]; // for select, radio, checkbox
    mapping?: string; // lead field mapping
    defaultValue?: string;
    helpText?: string;
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;
    };
    logic?: {
        action: 'SHOW' | 'HIDE';
        fieldId: string;
        operator?: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt';
        value: string;
    };
}

interface EditorProps {
    initialForm: any;
}

const FIELD_TYPES = [
    { type: 'TEXT', label: 'Short Text', icon: TextFieldsIcon },
    { type: 'TEXTAREA', label: 'Long Text', icon: NotesIcon },
    { type: 'NUMBER', label: 'Number', icon: NumbersIcon },
    { type: 'EMAIL', label: 'Email', icon: EmailIcon },
    { type: 'PHONE', label: 'Phone', icon: PhoneIcon },
    { type: 'DATE', label: 'Date', icon: EventIcon },
    { type: 'SELECT', label: 'Dropdown', icon: ListIcon },
    { type: 'CHECKBOX', label: 'Checkboxes', icon: CheckBoxIcon },
    { type: 'RADIO', label: 'Radio Buttons', icon: RadioButtonCheckedIcon },
    { type: 'HIDDEN', label: 'Hidden Field', icon: VisibilityOffIcon },
];

export function FormEditor({ initialForm }: EditorProps) {
    const theme = useTheme();
    const [fields, setFields] = useState<FormField[]>(initialForm.config?.fields || []);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [activeDragItem, setActiveDragItem] = useState<any>(null);
    const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("field");
    const [saving, setSaving] = useState(false);

    // Form Settings State
    const [settings, setSettings] = useState({
        isActive: initialForm.isActive,
        successMessage: initialForm.config?.successMessage || "Thank you for your submission!",
        redirectUrl: initialForm.config?.redirectUrl || "",
        notificationEmails: initialForm.config?.notificationEmails || "",
        submitButtonText: initialForm.config?.submitButtonText || "Submit",
        spamProtection: initialForm.config?.spamProtection !== false, // Default true
        rateLimit: initialForm.config?.rateLimit || 10,
        duplicateAction: initialForm.config?.duplicateAction || "CREATE",
        progressiveProfiling: initialForm.config?.progressiveProfiling || false,
        theme: initialForm.config?.theme || "default",
        customCss: initialForm.config?.customCss || "",
    });

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveDragItem(active.data.current);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragItem(null);

        if (!over) return;

        // Dropped generic tool onto canvas
        if (active.data.current?.isTool && over.id === 'canvas-droppable') {
            const type = active.data.current.type;
            const newField: FormField = {
                id: nanoid(),
                type,
                label: `New ${type.toLowerCase()}`,
                required: false,
                options: ['SELECT', 'CHECKBOX', 'RADIO'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
            };
            setFields([...fields, newField]);
            setSelectedFieldId(newField.id);
            setActiveTab("field"); // Switch to field tab to edit immediately
            return;
        }

        // Reordering
        if (active.id !== over.id) {
            setFields((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                config: {
                    fields,
                    ...settings,
                },
                isActive: settings.isActive
            };
            await apiFetch(`/forms/${initialForm.id}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
            toast.success("Form saved");
        } catch (error) {
            toast.error("Failed to save");
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const updateField = (id: string, updates: Partial<FormField>) => {
        setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const removeField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
        if (selectedFieldId === id) setSelectedFieldId(null);
    };

    const selectedField = fields.find(f => f.id === selectedFieldId);

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
            <Box sx={{ display: 'flex', height: 'calc(100vh - 240px)', minHeight: 720, overflow: 'hidden', bgcolor: 'background.default' }}>
                {/* Left Sidebar: Tools */}
                <Paper
                    elevation={0}
                    sx={{
                        width: 240,
                        borderRight: `1px solid ${theme.palette.divider}`,
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 2,
                        borderRadius: 0,
                        bgcolor: alpha(theme.palette.background.default, 0.5),
                        backdropFilter: 'blur(8px)'
                    }}
                >
                    <Box sx={{ p: 1.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary' }}>
                            Field Library
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Drag blocks into the form canvas
                        </Typography>
                    </Box>
                    <List sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
                        {FIELD_TYPES.map(t => (
                            <DraggableTool key={t.type} type={t.type} label={t.label} icon={t.icon} />
                        ))}
                    </List>
                </Paper>

                {/* Center: Canvas */}
                <Box
                    sx={{
                        flex: 1,
                        bgcolor: alpha(theme.palette.primary.main, 0.02),
                        p: 2,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        position: 'relative',
                        gap: 2
                    }}
                >
                    {/* Toolbar */}
                    <Paper
                        elevation={0}
                        sx={{
                            width: '100%',
                            maxWidth: 800,
                            p: 1.5,
                            borderRadius: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: 'background.paper',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Canvas Preview
                            </Typography>
                            <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.1rem' }}>{initialForm.name}</Typography>
                            {initialForm.description && <Typography variant="caption" color="text.secondary">{initialForm.description}</Typography>}
                        </Box>
                        <Stack direction="row" spacing={1}>
                            <Button
                                variant="outlined"
                                startIcon={<CodeIcon />}
                                size="small"
                                onClick={() => setEmbedDialogOpen(true)}
                                sx={{ borderRadius: '10px' }}
                            >
                                Embed
                            </Button>
                            <Button
                                variant="contained"
                                startIcon={<SaveIcon />}
                                size="small"
                                onClick={handleSave}
                                disabled={saving}
                                sx={{ borderRadius: '10px' }}
                            >
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </Stack>
                    </Paper>

                    {/* Canvas Area */}
                    <DroppableCanvas fields={fields} selectedId={selectedFieldId} onSelect={setSelectedFieldId} />
                </Box>

                {/* Right Sidebar: Properties */}
                <Paper
                    elevation={0}
                    sx={{
                        width: 320,
                        borderLeft: `1px solid ${theme.palette.divider}`,
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 2,
                        borderRadius: 0
                    }}
                >
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Box sx={{ px: 2, pt: 1.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Inspector
                            </Typography>
                        </Box>
                        <Tabs
                            value={activeTab}
                            onChange={(e, val) => setActiveTab(val)}
                            variant="fullWidth"
                            textColor="primary"
                            indicatorColor="primary"
                        >
                            <Tab icon={<TuneIcon fontSize="small" />} iconPosition="start" label="Field" value="field" />
                            <Tab icon={<ColorLensIcon fontSize="small" />} iconPosition="start" label="Design" value="design" />
                            <Tab icon={<SettingsIcon fontSize="small" />} iconPosition="start" label="Settings" value="settings" />
                        </Tabs>
                    </Box>

                    <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                        {activeTab === "field" && (
                            selectedField ? (
                                <Stack spacing={3}>
                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>Basic Properties</Typography>
                                        <Stack spacing={2}>
                                            <TextField
                                                label="Label"
                                                size="small"
                                                fullWidth
                                                value={selectedField.label}
                                                onChange={e => updateField(selectedField.id, { label: e.target.value })}
                                            />
                                            {selectedField.type !== 'HIDDEN' && selectedField.type !== 'CHECKBOX' && (
                                                <TextField
                                                    label="Placeholder"
                                                    size="small"
                                                    fullWidth
                                                    value={selectedField.placeholder || ''}
                                                    onChange={e => updateField(selectedField.id, { placeholder: e.target.value })}
                                                />
                                            )}
                                            <TextField
                                                label="Help Text"
                                                size="small"
                                                fullWidth
                                                value={selectedField.helpText || ''}
                                                onChange={e => updateField(selectedField.id, { helpText: e.target.value })}
                                                helperText="Displayed below the input field"
                                            />
                                            {selectedField.type !== 'HIDDEN' && (
                                                <FormControlLabel
                                                    control={<Switch checked={selectedField.required} onChange={e => updateField(selectedField.id, { required: e.target.checked })} />}
                                                    label="Required Field"
                                                    sx={{ ml: 0 }}
                                                />
                                            )}
                                        </Stack>
                                    </Box>

                                    {['SELECT', 'CHECKBOX', 'RADIO'].includes(selectedField.type) && (
                                        <Box>
                                            <Typography variant="subtitle2" gutterBottom>Options</Typography>
                                            <TextField
                                                label="Options (comma separated)"
                                                size="small"
                                                fullWidth
                                                multiline
                                                rows={3}
                                                value={selectedField.options?.join(', ') || ''}
                                                onChange={e => updateField(selectedField.id, {
                                                    options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                                })}
                                            />
                                        </Box>
                                    )}

                                    <Divider />

                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>Data Mapping</Typography>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Lead Field</InputLabel>
                                            <Select
                                                value={selectedField.mapping || ''}
                                                label="Lead Field"
                                                onChange={e => updateField(selectedField.id, { mapping: e.target.value })}
                                            >
                                                <MenuItem value=""><em>None (Don't save to lead)</em></MenuItem>
                                                <MenuItem value="name">Name</MenuItem>
                                                <MenuItem value="email">Email</MenuItem>
                                                <MenuItem value="phone">Phone</MenuItem>
                                                <MenuItem value="company">Company</MenuItem>
                                                <MenuItem value="source">Source</MenuItem>
                                                <MenuItem value="city">City</MenuItem>
                                                <MenuItem value="state">State</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <TextField
                                            label="Default Value"
                                            size="small"
                                            fullWidth
                                            sx={{ mt: 2 }}
                                            value={selectedField.defaultValue || ''}
                                            onChange={e => updateField(selectedField.id, { defaultValue: e.target.value })}
                                        />
                                    </Box>

                                    <Divider />

                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>Validation</Typography>
                                        <Stack spacing={2} direction="row">
                                            <TextField
                                                label="Min"
                                                type="number"
                                                size="small"
                                                value={selectedField.validation?.min ?? ''}
                                                onChange={e => updateField(selectedField.id, {
                                                    validation: { ...selectedField.validation, min: e.target.value ? parseInt(e.target.value) : undefined }
                                                })}
                                            />
                                            <TextField
                                                label="Max"
                                                type="number"
                                                size="small"
                                                value={selectedField.validation?.max ?? ''}
                                                onChange={e => updateField(selectedField.id, {
                                                    validation: { ...selectedField.validation, max: e.target.value ? parseInt(e.target.value) : undefined }
                                                })}
                                            />
                                        </Stack>
                                        <TextField
                                            label="Pattern (Regex)"
                                            size="small"
                                            fullWidth
                                            sx={{ mt: 2 }}
                                            value={selectedField.validation?.pattern ?? ''}
                                            onChange={e => updateField(selectedField.id, {
                                                validation: { ...selectedField.validation, pattern: e.target.value }
                                            })}
                                        />
                                    </Box>

                                    <Divider />

                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>Conditional Logic</Typography>
                                        <ConditionalLogicBuilder
                                            fields={fields}
                                            currentFieldId={selectedField.id}
                                            value={selectedField.logic as any}
                                            onChange={(rule) => updateField(selectedField.id, { logic: rule })}
                                        />
                                    </Box>

                                    <Divider />

                                    <Button
                                        variant="outlined"
                                        color="error"
                                        startIcon={<DeleteIcon />}
                                        fullWidth
                                        onClick={() => removeField(selectedField.id)}
                                    >
                                        Remove Field
                                    </Button>
                                </Stack>
                            ) : (
                                <Box sx={{ py: 8, textAlign: 'center', opacity: 0.5 }}>
                                    <Typography variant="body2">Select a field on the canvas to edit its properties.</Typography>
                                </Box>
                            )
                        )}

                        {activeTab === "design" && (
                            <StyleEditor
                                values={{ theme: settings.theme, customCss: settings.customCss }}
                                onChange={(vals) => setSettings({ ...settings, ...vals })}
                            />
                        )}

                        {activeTab === "settings" && (
                            <Stack spacing={3}>
                                <TextField
                                    label="Submit Button Text"
                                    size="small"
                                    fullWidth
                                    value={settings.submitButtonText}
                                    onChange={e => setSettings({ ...settings, submitButtonText: e.target.value })}
                                />
                                <TextField
                                    label="Success Message"
                                    size="small"
                                    fullWidth
                                    multiline
                                    rows={2}
                                    value={settings.successMessage}
                                    onChange={e => setSettings({ ...settings, successMessage: e.target.value })}
                                />
                                <TextField
                                    label="Redirect URL"
                                    size="small"
                                    fullWidth
                                    placeholder="https://"
                                    value={settings.redirectUrl}
                                    onChange={e => setSettings({ ...settings, redirectUrl: e.target.value })}
                                />
                                <TextField
                                    label="Notification Emails"
                                    size="small"
                                    fullWidth
                                    placeholder="admin@example.com"
                                    value={settings.notificationEmails}
                                    onChange={e => setSettings({ ...settings, notificationEmails: e.target.value })}
                                />

                                <Divider />

                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>Security & Limits</Typography>
                                    <FormControlLabel
                                        control={<Switch checked={settings.spamProtection} onChange={e => setSettings({ ...settings, spamProtection: e.target.checked })} />}
                                        label="Spam Protection"
                                    />
                                    <TextField
                                        label="Rate Limit (submissions/hr)"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        sx={{ mt: 2 }}
                                        value={settings.rateLimit}
                                        onChange={e => setSettings({ ...settings, rateLimit: parseInt(e.target.value) || 10 })}
                                    />
                                </Box>

                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>Duplicate Handling</Typography>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value={settings.duplicateAction}
                                            onChange={e => setSettings({ ...settings, duplicateAction: e.target.value })}
                                        >
                                            <MenuItem value="CREATE">Always Create New Lead</MenuItem>
                                            <MenuItem value="UPDATE">Update Existing Lead</MenuItem>
                                            <MenuItem value="SKIP">Skip (Don't Create)</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Box>

                                <Divider />

                                <FormControlLabel
                                    control={<Switch checked={settings.isActive} onChange={e => setSettings({ ...settings, isActive: e.target.checked })} />}
                                    label="Form Active"
                                />
                            </Stack>
                        )}
                    </Box>
                </Paper>
            </Box>

            <DragOverlay>
                {activeDragItem ? (
                    <Paper
                        elevation={4}
                        sx={{
                            p: 2,
                            width: 200,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            opacity: 0.9,
                            cursor: 'grabbing'
                        }}
                    >
                        <Box sx={{ color: 'text.secondary' }}>
                            {/* Icon would go here if we passed it in activeDragItem context */}
                            <DragIndicatorIcon />
                        </Box>
                        <Typography variant="body2" fontWeight={600}>{activeDragItem.label}</Typography>
                    </Paper>
                ) : null}
            </DragOverlay>

            <EmbedCodeDialog
                open={embedDialogOpen}
                onOpenChange={setEmbedDialogOpen}
                formId={initialForm.id}
                formName={initialForm.name}
            />
        </DndContext >
    );
}

function DraggableTool({ type, label, icon: Icon }: any) {
    const theme = useTheme();
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `tool-${type}`,
        data: { type, label, isTool: true }
    });

    return (
        <ListItemButton
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            sx={{
                mb: 1,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '10px',
                '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.04)
                },
                cursor: 'grab'
            }}
        >
            <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon fontSize="small" color="action" />
            </ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }} />
        </ListItemButton>
    );
}

function DroppableCanvas({ fields, selectedId, onSelect }: any) {
    const theme = useTheme();
    const { setNodeRef } = useDroppable({
        id: 'canvas-droppable',
    });

    return (
        <Paper
            ref={setNodeRef}
            elevation={2}
            sx={{
                width: '100%',
                maxWidth: 800,
                minHeight: 600,
                flex: 1,
                borderRadius: '12px',
                p: 3,
                bgcolor: 'background.paper',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                ...(fields.length === 0 && {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderStyle: 'dashed',
                    borderColor: 'divider'
                })
            }}
        >
            <SortableContext items={fields.map((f: any) => f.id)} strategy={verticalListSortingStrategy}>
                {fields.length === 0 ? (
                    <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        <AddIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
                        <Typography variant="body1">Drag fields here from the left sidebar</Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        {fields.map((field: FormField) => (
                            <SortableField key={field.id} field={field} isSelected={selectedId === field.id} onSelect={() => onSelect(field.id)} />
                        ))}
                    </Stack>
                )}
            </SortableContext>
        </Paper>
    );
}

function SortableField({ field, isSelected, onSelect }: any) {
    const theme = useTheme();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

    // Simple render of field based on type
    const renderInput = () => {
        switch (field.type) {
            case 'TEXTAREA': return <TextField fullWidth multiline rows={3} disabled placeholder={field.placeholder || "Long text answer"} size="small" />;
            case 'SELECT': return <Select fullWidth size="small" disabled displayEmpty value=""><MenuItem value="">Select...</MenuItem></Select>;
            case 'CHECKBOX': return <Box>{field.options?.map((o: string, i: number) => <FormControlLabel key={i} control={<Switch size="small" disabled />} label={o} />) || <FormControlLabel control={<Switch size="small" disabled />} label="Option 1" />}</Box>;
            case 'RADIO': return <Box>{field.options?.map((o: string, i: number) => <FormControlLabel key={i} control={<Switch size="small" disabled />} label={o} />) || <FormControlLabel control={<Switch size="small" disabled />} label="Option 1" />}</Box>;
            case 'FILE': return <Box sx={{ p: 2, border: '1px dashed grey', borderRadius: 1, textAlign: 'center', color: 'text.secondary' }}>File Upload Area</Box>;
            case 'HIDDEN': return <Box sx={{ p: 1, border: '1px dashed gold', bgcolor: alpha('#ffd700', 0.1), borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}><VisibilityOffIcon fontSize="small" /> <Typography variant="caption">Hidden Field: {field.mapping || 'Unmapped'}</Typography></Box>;
            default: return <TextField fullWidth disabled placeholder={field.placeholder || field.label} size="small" />;
        }
    };

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <Box
            ref={setNodeRef}
            style={style}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect();
            }}
            sx={{
                position: 'relative',
                p: 2,
                borderRadius: '10px',
                border: '1px solid',
                borderColor: isSelected ? 'primary.main' : 'transparent',
                bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
                '&:hover': {
                    bgcolor: alpha(theme.palette.action.hover, 0.08),
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                },
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
            <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" fontWeight={600}>
                    {field.label} {field.required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
                </Typography>
                <Box
                    {...attributes}
                    {...listeners}
                    sx={{
                        cursor: 'grab',
                        color: 'text.disabled',
                        '&:hover': { color: 'text.secondary' },
                        display: 'flex'
                    }}
                >
                    <DragIndicatorIcon fontSize="small" />
                </Box>
            </Box>

            <Box sx={{ pointerEvents: 'none' }}>
                {renderInput()}
            </Box>

            {isSelected && (
                <Box
                    sx={{
                        position: 'absolute',
                        left: -2,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        bgcolor: 'primary.main',
                        borderTopLeftRadius: 4,
                        borderBottomLeftRadius: 4
                    }}
                />
            )}
        </Box>
    );
}

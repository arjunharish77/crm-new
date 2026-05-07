"use client";

import { useEffect, useMemo, useState } from "react";
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
    IconButton,
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
    Tune as TuneIcon,
    Close as CloseIcon,
    ViewColumn as WidthIcon
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
    sourceModule?: 'lead' | 'opportunity' | 'activity';
    mapping?: string;
    tabId?: string;
    sectionId?: string;
    opportunityTypeId?: string;
    activityTypeId?: string;
    defaultValue?: string;
    helpText?: string;
    width?: 1 | 2;
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

const MODULE_FIELDS = {
    lead: [
        { key: "name", label: "Lead Name", type: "TEXT" },
        { key: "email", label: "Email", type: "EMAIL" },
        { key: "phone", label: "Phone", type: "PHONE" },
        { key: "company", label: "Company", type: "TEXT" },
        { key: "source", label: "Source", type: "TEXT" },
        { key: "status", label: "Status", type: "SELECT", options: ["NEW", "CONTACTED", "QUALIFIED", "LOST"] },
    ],
    opportunity: [
        { key: "title", label: "Opportunity Title", type: "TEXT" },
        { key: "amount", label: "Amount", type: "NUMBER" },
        { key: "expectedCloseDate", label: "Expected Close Date", type: "DATE" },
        { key: "priority", label: "Priority", type: "SELECT", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
    ],
    activity: [
        { key: "outcome", label: "Activity Outcome", type: "TEXT" },
        { key: "notes", label: "Activity Notes", type: "TEXTAREA" },
        { key: "dueAt", label: "Due Date", type: "DATE" },
    ],
} as const;

type SourceModule = keyof typeof MODULE_FIELDS;

const CRM_PLACEMENTS = [
    { value: "LEAD_DETAIL", label: "Lead detail" },
    { value: "OPPORTUNITY_DETAIL", label: "Opportunity detail" },
    { value: "ACTIVITY_DETAIL", label: "Activity detail" },
    { value: "LEAD_CREATE", label: "Lead create" },
    { value: "OPPORTUNITY_CREATE", label: "Opportunity create" },
];

function moduleLabel(module: SourceModule) {
    return module.charAt(0).toUpperCase() + module.slice(1);
}

export function FormEditor({ initialForm }: EditorProps) {
    const theme = useTheme();
    const [fields, setFields] = useState<FormField[]>(initialForm.config?.fields || []);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [activeDragItem, setActiveDragItem] = useState<any>(null);
    const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("field");
    const [fieldLibraryModule, setFieldLibraryModule] = useState<SourceModule>("lead");
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [selectedOpportunityTypeId, setSelectedOpportunityTypeId] = useState<string>("");
    const [selectedActivityTypeId, setSelectedActivityTypeId] = useState<string>("");
    const [activeCanvasTabId, setActiveCanvasTabId] = useState<string>(initialForm.config?.tabs?.[0]?.id || "tab_1");
    const [moduleCustomFields, setModuleCustomFields] = useState<Record<SourceModule, any[]>>({ lead: [], opportunity: [], activity: [] });
    const [opportunityTypeCustomFields, setOpportunityTypeCustomFields] = useState<any[]>([]);
    const [activityTypeCustomFields, setActivityTypeCustomFields] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [salesGroups, setSalesGroups] = useState<any[]>([]);
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
        layoutColumns: initialForm.config?.layoutColumns || 2,
        useMultiStep: initialForm.config?.useMultiStep || false,
        tabsPlacement: initialForm.config?.tabsPlacement || "TOP",
        showSectionNames: initialForm.config?.showSectionNames !== false,
        tabs: initialForm.config?.tabs?.length ? initialForm.config.tabs : [{ id: "tab_1", label: "Tab 1", order: 0 }],
        sections: initialForm.config?.sections?.length ? initialForm.config.sections : [{ id: "section_1", tabId: initialForm.config?.tabs?.[0]?.id || "tab_1", label: "Section 1", order: 0 }],
        placements: initialForm.config?.placements || [],
        placementRules: initialForm.config?.placementRules || [],
        visibilityMode: initialForm.config?.visibilityMode || "ALL",
        visibleUserIds: initialForm.config?.visibleUserIds || [],
        visibleTeamIds: initialForm.config?.visibleTeamIds || [],
        visibleSalesGroupIds: initialForm.config?.visibleSalesGroupIds || [],
    });

    useEffect(() => {
        Promise.all([
            apiFetch("/opportunity-types").catch(() => []),
            apiFetch("/activity-types").catch(() => []),
            apiFetch("/users").catch(() => []),
            apiFetch("/sales-groups").catch(() => []),
            apiFetch("/custom-fields?objectType=LEAD").catch(() => []),
            apiFetch("/custom-fields?objectType=OPPORTUNITY").catch(() => []),
            apiFetch("/custom-fields?objectType=ACTIVITY").catch(() => []),
        ]).then(([oppTypes, actTypes, userList, groupList, leadFields, oppFields, actFields]) => {
            const opportunities = Array.isArray(oppTypes) ? oppTypes : [];
            const activities = Array.isArray(actTypes) ? actTypes : [];
            setOpportunityTypes(opportunities);
            setActivityTypes(activities);
            setUsers(Array.isArray(userList) ? userList : []);
            setSalesGroups(Array.isArray(groupList) ? groupList : []);
            setModuleCustomFields({
                lead: Array.isArray(leadFields) ? leadFields : [],
                opportunity: Array.isArray(oppFields) ? oppFields : [],
                activity: Array.isArray(actFields) ? actFields : [],
            });
            setSelectedOpportunityTypeId((current) => current || opportunities[0]?.id || "");
            setSelectedActivityTypeId((current) => current || activities[0]?.id || "");
        });
    }, []);

    useEffect(() => {
        if (!selectedOpportunityTypeId) {
            setOpportunityTypeCustomFields([]);
            return;
        }

        apiFetch(`/type-custom-fields/by-type/OPPORTUNITY_TYPE/${selectedOpportunityTypeId}`)
            .then((fields) => setOpportunityTypeCustomFields(Array.isArray(fields) ? fields : []))
            .catch(() => setOpportunityTypeCustomFields([]));
    }, [selectedOpportunityTypeId]);

    useEffect(() => {
        if (!selectedActivityTypeId) {
            setActivityTypeCustomFields([]);
            return;
        }

        apiFetch(`/type-custom-fields/by-type/ACTIVITY_TYPE/${selectedActivityTypeId}`)
            .then((fields) => setActivityTypeCustomFields(Array.isArray(fields) ? fields : []))
            .catch(() => setActivityTypeCustomFields([]));
    }, [selectedActivityTypeId]);

    const customFieldOptions = (field: any) => {
        const options = field.fieldConfig?.options ?? field.metadata?.options ?? field.options ?? [];
        return Array.isArray(options) ? options.map(String) : [];
    };

    const customFieldToModuleField = (field: any) => ({
        key: String(field.fieldKey ?? field.key ?? ""),
        label: String(field.fieldLabel ?? field.label ?? field.fieldKey ?? field.key ?? "Custom Field"),
        type: String(field.fieldType ?? field.type ?? "TEXT"),
        options: customFieldOptions(field),
    });

    const fieldsForModule = (module: SourceModule) => {
        const typeFields = module === "opportunity" ? opportunityTypeCustomFields : module === "activity" ? activityTypeCustomFields : [];
        const seen = new Set<string>();
        return [
            ...MODULE_FIELDS[module],
            ...moduleCustomFields[module].filter((field) => field.isActive !== false).map(customFieldToModuleField),
            ...typeFields.filter((field) => field.isActive !== false).map(customFieldToModuleField),
        ].filter((field) => {
            if (!field.key || seen.has(field.key)) return false;
            seen.add(field.key);
            return true;
        });
    };

    const moduleFields = useMemo(() => {
        return fieldsForModule(fieldLibraryModule);
    }, [fieldLibraryModule, moduleCustomFields, opportunityTypeCustomFields, activityTypeCustomFields]);

    const usedFieldKeys = useMemo(() => {
        return new Set(
            fields
                .filter((field) => field.mapping)
                .map((field) => `${field.mapping}|${field.opportunityTypeId || ""}|${field.activityTypeId || ""}`)
        );
    }, [fields]);

    const isModuleFieldAlreadyUsed = (sourceModule: SourceModule, key: string) => {
        const scopeId = sourceModule === "opportunity" ? selectedOpportunityTypeId : sourceModule === "activity" ? selectedActivityTypeId : "";
        return usedFieldKeys.has(`${sourceModule}.${key}|${sourceModule === "opportunity" ? scopeId : ""}|${sourceModule === "activity" ? scopeId : ""}`);
    };

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
                sourceModule: "lead",
                tabId: activeCanvasTabId,
                sectionId: settings.sections.find((section: any) => section.tabId === activeCanvasTabId)?.id || "section_1",
                options: ['SELECT', 'CHECKBOX', 'RADIO'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
            };
            setFields([...fields, newField]);
            setSelectedFieldId(newField.id);
            setActiveTab("field"); // Switch to field tab to edit immediately
            return;
        }

        if (active.data.current?.isModuleField && over.id === 'canvas-droppable') {
            const tool = active.data.current;
            if (isModuleFieldAlreadyUsed(tool.sourceModule, tool.key)) {
                toast.error("This module field is already on the form");
                return;
            }
            const newField: FormField = {
                id: nanoid(),
                type: tool.type,
                label: tool.label,
                required: false,
                sourceModule: tool.sourceModule,
                mapping: `${tool.sourceModule}.${tool.key}`,
                tabId: activeCanvasTabId,
                sectionId: settings.sections.find((section: any) => section.tabId === activeCanvasTabId)?.id || "section_1",
                opportunityTypeId: tool.sourceModule === "opportunity" ? selectedOpportunityTypeId : undefined,
                activityTypeId: tool.sourceModule === "activity" ? selectedActivityTypeId : undefined,
                options: tool.options,
            };
            setFields([...fields, newField]);
            setSelectedFieldId(newField.id);
            setActiveTab("field");
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
        if (updates.mapping) {
            const current = fields.find((field) => field.id === id);
            const nextOpportunityTypeId = updates.opportunityTypeId ?? current?.opportunityTypeId ?? "";
            const nextActivityTypeId = updates.activityTypeId ?? current?.activityTypeId ?? "";
            const duplicate = fields.some((field) =>
                field.id !== id &&
                field.mapping === updates.mapping &&
                (field.opportunityTypeId || "") === nextOpportunityTypeId &&
                (field.activityTypeId || "") === nextActivityTypeId
            );

            if (duplicate) {
                toast.error("This module field is already on the form");
                return;
            }
        }
        setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const removeField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
        if (selectedFieldId === id) setSelectedFieldId(null);
    };

    const toggleFieldWidth = (id: string) => {
        setFields(fields.map((field) => field.id === id ? { ...field, width: field.width === 2 ? 1 : 2 } : field));
    };

    const addTab = () => {
        const tab = { id: `tab_${nanoid(6)}`, label: `Tab ${settings.tabs.length + 1}`, order: settings.tabs.length };
        const section = { id: `section_${nanoid(6)}`, tabId: tab.id, label: "Section 1", order: 0 };
        setSettings({ ...settings, tabs: [...settings.tabs, tab], sections: [...settings.sections, section] });
        setActiveCanvasTabId(tab.id);
    };

    const addSection = () => {
        const tabSections = settings.sections.filter((section: any) => section.tabId === activeCanvasTabId);
        const section = { id: `section_${nanoid(6)}`, tabId: activeCanvasTabId, label: `Section ${tabSections.length + 1}`, order: tabSections.length };
        setSettings({ ...settings, sections: [...settings.sections, section] });
    };

    const updateTabLabel = (id: string, label: string) => {
        setSettings({ ...settings, tabs: settings.tabs.map((tab: any) => tab.id === id ? { ...tab, label } : tab) });
    };

    const removeTab = (id: string) => {
        if (settings.tabs.length <= 1) {
            toast.error("At least one tab is required");
            return;
        }
        const nextTabs = settings.tabs.filter((tab: any) => tab.id !== id);
        const removedSectionIds = settings.sections.filter((section: any) => section.tabId === id).map((section: any) => section.id);
        setSettings({
            ...settings,
            tabs: nextTabs,
            sections: settings.sections.filter((section: any) => section.tabId !== id),
        });
        setFields(fields.filter((field) => field.tabId !== id && !removedSectionIds.includes(field.sectionId || "")));
        if (activeCanvasTabId === id) setActiveCanvasTabId(nextTabs[0]?.id || "tab_1");
        if (selectedFieldId && fields.find((field) => field.id === selectedFieldId)?.tabId === id) setSelectedFieldId(null);
    };

    const updateSectionLabel = (id: string, label: string) => {
        setSettings({ ...settings, sections: settings.sections.map((section: any) => section.id === id ? { ...section, label } : section) });
    };

    const removeSection = (id: string) => {
        const section = settings.sections.find((item: any) => item.id === id);
        const siblingCount = settings.sections.filter((item: any) => item.tabId === section?.tabId).length;
        if (siblingCount <= 1) {
            toast.error("Each tab needs at least one section");
            return;
        }
        setSettings({ ...settings, sections: settings.sections.filter((item: any) => item.id !== id) });
        setFields(fields.filter((field) => field.sectionId !== id));
        if (selectedFieldId && fields.find((field) => field.id === selectedFieldId)?.sectionId === id) setSelectedFieldId(null);
    };

    const placementRuleFor = (placement: string) => {
        const existing = settings.placementRules.find((rule: any) => rule.placement === placement);
        return existing || {
            id: `placement_${nanoid(6)}`,
            placement,
            enabled: settings.placements.includes(placement),
            label: CRM_PLACEMENTS.find((item) => item.value === placement)?.label || "Open form",
            order: settings.placementRules.length,
            visibilityMode: "INHERIT",
            visibleUserIds: [],
            visibleSalesGroupIds: [],
            visibleTeamIds: [],
            conditionLogic: "AND",
            conditions: [],
        };
    };

    const updatePlacementRule = (placement: string, patch: Record<string, any>) => {
        const current = placementRuleFor(placement);
        const nextRule = { ...current, ...patch };
        const nextRules = settings.placementRules.some((rule: any) => rule.placement === placement)
            ? settings.placementRules.map((rule: any) => rule.placement === placement ? nextRule : rule)
            : [...settings.placementRules, nextRule];
        const nextPlacements = nextRule.enabled
            ? [...new Set([...settings.placements, placement])]
            : settings.placements.filter((item: string) => item !== placement);
        setSettings({ ...settings, placementRules: nextRules, placements: nextPlacements });
    };

    const updatePlacementCondition = (placement: string, index: number, patch: Record<string, any>) => {
        const current = placementRuleFor(placement);
        const conditions = Array.isArray(current.conditions) ? [...current.conditions] : [];
        conditions[index] = { ...(conditions[index] ?? {}), ...patch };
        updatePlacementRule(placement, { conditions });
    };

    const addPlacementCondition = (placement: string) => {
        const current = placementRuleFor(placement);
        const conditions = Array.isArray(current.conditions) ? current.conditions : [];
        updatePlacementRule(placement, { conditions: [...conditions, { field: "", operator: "equals", value: "" }] });
    };

    const removePlacementCondition = (placement: string, index: number) => {
        const current = placementRuleFor(placement);
        const conditions = Array.isArray(current.conditions) ? current.conditions.filter((_: any, itemIndex: number) => itemIndex !== index) : [];
        updatePlacementRule(placement, { conditions });
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
                            Drag module fields or generic blocks into the form
                        </Typography>
                    </Box>
                    <Box sx={{ px: 1.5, pt: 1.5 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Source Module</InputLabel>
                            <Select
                                value={fieldLibraryModule}
                                label="Source Module"
                                onChange={(event) => setFieldLibraryModule(event.target.value as SourceModule)}
                            >
                                <MenuItem value="lead">Lead</MenuItem>
                                <MenuItem value="opportunity">Opportunity</MenuItem>
                                <MenuItem value="activity">Activity</MenuItem>
                            </Select>
                        </FormControl>
                        {fieldLibraryModule === "opportunity" && (
                            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                                <InputLabel>Opportunity Type</InputLabel>
                                <Select
                                    value={selectedOpportunityTypeId}
                                    label="Opportunity Type"
                                    onChange={(event) => setSelectedOpportunityTypeId(String(event.target.value))}
                                >
                                    {opportunityTypes.map((type) => (
                                        <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        {fieldLibraryModule === "activity" && (
                            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                                <InputLabel>Activity Type</InputLabel>
                                <Select
                                    value={selectedActivityTypeId}
                                    label="Activity Type"
                                    onChange={(event) => setSelectedActivityTypeId(String(event.target.value))}
                                >
                                    {activityTypes.map((type) => (
                                        <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </Box>
                    <List sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
                        <Typography variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary", fontWeight: 700 }}>
                            {moduleLabel(fieldLibraryModule)} Fields
                        </Typography>
                        {moduleFields.map((field) => (
                            <DraggableModuleField
                                key={`${fieldLibraryModule}.${field.key}`}
                                sourceModule={fieldLibraryModule}
                                field={field}
                                disabled={isModuleFieldAlreadyUsed(fieldLibraryModule, field.key)}
                            />
                        ))}
                        <Divider sx={{ my: 1.5 }} />
                        <Typography variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary", fontWeight: 700 }}>
                            Special Fields
                        </Typography>
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
                            <Button variant="outlined" startIcon={<AddIcon />} size="small" onClick={addTab} sx={{ borderRadius: '10px' }}>
                                Tab
                            </Button>
                            <Button variant="outlined" startIcon={<AddIcon />} size="small" onClick={addSection} sx={{ borderRadius: '10px' }}>
                                Section
                            </Button>
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
                    <DroppableCanvas
                        fields={fields}
                        selectedId={selectedFieldId}
                        onSelect={setSelectedFieldId}
                        columns={settings.layoutColumns}
                        tabs={settings.tabs}
                        sections={settings.sections}
                        activeTabId={activeCanvasTabId}
                        onTabChange={setActiveCanvasTabId}
                        showSectionNames={settings.showSectionNames}
                        onRemoveField={removeField}
                        onToggleFieldWidth={toggleFieldWidth}
                        onRemoveTab={removeTab}
                        onRemoveSection={removeSection}
                    />
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
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Tab</InputLabel>
                                                <Select value={selectedField.tabId || settings.tabs[0]?.id || "tab_1"} label="Tab" onChange={e => {
                                                    const tabId = String(e.target.value);
                                                    const sectionId = settings.sections.find((section: any) => section.tabId === tabId)?.id;
                                                    updateField(selectedField.id, { tabId, sectionId });
                                                }}>
                                                    {settings.tabs.map((tab: any) => (
                                                        <MenuItem key={tab.id} value={tab.id}>{tab.label}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Section</InputLabel>
                                                <Select value={selectedField.sectionId || ""} label="Section" onChange={e => updateField(selectedField.id, { sectionId: String(e.target.value) })}>
                                                    {settings.sections.filter((section: any) => section.tabId === (selectedField.tabId || settings.tabs[0]?.id)).map((section: any) => (
                                                        <MenuItem key={section.id} value={section.id}>{section.label}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
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
                                                    options: e.target.value.split(',').map(s => s.trim()).filter((option) => option.length > 0)
                                                })}
                                            />
                                        </Box>
                                    )}

                                    <Divider />

                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>Data Mapping</Typography>
                                        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                            <InputLabel>Source Module</InputLabel>
                                            <Select
                                                value={selectedField.sourceModule || "lead"}
                                                label="Source Module"
                                                onChange={e => {
                                                    const sourceModule = e.target.value as SourceModule;
                                                    const fieldKey = selectedField.mapping?.split(".").pop() || "";
                                                    updateField(selectedField.id, {
                                                        sourceModule,
                                                        mapping: fieldKey ? `${sourceModule}.${fieldKey}` : "",
                                                        opportunityTypeId: sourceModule === "opportunity" ? selectedOpportunityTypeId : undefined,
                                                        activityTypeId: sourceModule === "activity" ? selectedActivityTypeId : undefined,
                                                    });
                                                }}
                                            >
                                                <MenuItem value="lead">Lead</MenuItem>
                                                <MenuItem value="opportunity">Opportunity</MenuItem>
                                                <MenuItem value="activity">Activity</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Module Field</InputLabel>
                                            <Select
                                                value={selectedField.mapping || ''}
                                                label="Module Field"
                                                onChange={e => updateField(selectedField.id, { mapping: e.target.value })}
                                            >
                                                <MenuItem value=""><em>None (store submission only)</em></MenuItem>
                                                {fieldsForModule((selectedField.sourceModule || "lead") as SourceModule).map((field) => (
                                                    <MenuItem
                                                        key={field.key}
                                                        value={`${selectedField.sourceModule || "lead"}.${field.key}`}
                                                    >
                                                        {field.label}
                                                    </MenuItem>
                                                ))}
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
                                <FormControl fullWidth size="small">
                                    <InputLabel>Form Layout</InputLabel>
                                    <Select
                                        value={settings.layoutColumns}
                                        label="Form Layout"
                                        onChange={e => setSettings({ ...settings, layoutColumns: Number(e.target.value) })}
                                    >
                                        <MenuItem value={1}>Single column</MenuItem>
                                        <MenuItem value={2}>Two columns</MenuItem>
                                    </Select>
                                </FormControl>
                                <FormControlLabel
                                    control={<Switch checked={settings.useMultiStep} onChange={e => setSettings({ ...settings, useMultiStep: e.target.checked })} />}
                                    label="Use as multi-step form"
                                />
                                <FormControlLabel
                                    control={<Switch checked={settings.showSectionNames} onChange={e => setSettings({ ...settings, showSectionNames: e.target.checked })} />}
                                    label="Show section names"
                                />
                                <FormControl fullWidth size="small">
                                    <InputLabel>Tabs Placement</InputLabel>
                                    <Select value={settings.tabsPlacement} label="Tabs Placement" onChange={e => setSettings({ ...settings, tabsPlacement: e.target.value })}>
                                        <MenuItem value="TOP">Top</MenuItem>
                                        <MenuItem value="LEFT">Left</MenuItem>
                                    </Select>
                                </FormControl>
                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>Tabs</Typography>
                                    <Stack spacing={1}>
                                        {settings.tabs.map((tab: any, index: number) => (
                                            <Stack key={tab.id} direction="row" spacing={1} alignItems="center">
                                                <TextField
                                                    size="small"
                                                    label={`Tab ${index + 1}`}
                                                    value={tab.label}
                                                    fullWidth
                                                    onChange={e => updateTabLabel(tab.id, e.target.value)}
                                                />
                                                <IconButton size="small" onClick={() => removeTab(tab.id)} disabled={settings.tabs.length <= 1}>
                                                    <CloseIcon fontSize="small" />
                                                </IconButton>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </Box>
                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>Sections</Typography>
                                    <Stack spacing={1}>
                                        {settings.sections.map((section: any, index: number) => (
                                            <Stack key={section.id} direction="row" spacing={1} alignItems="center">
                                                <TextField
                                                    size="small"
                                                    label={`Section ${index + 1}`}
                                                    value={section.label}
                                                    fullWidth
                                                    onChange={e => updateSectionLabel(section.id, e.target.value)}
                                                />
                                                <IconButton size="small" onClick={() => removeSection(section.id)} disabled={settings.sections.filter((item: any) => item.tabId === section.tabId).length <= 1}>
                                                    <CloseIcon fontSize="small" />
                                                </IconButton>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </Box>
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

function DraggableModuleField({ sourceModule, field, disabled }: any) {
    const theme = useTheme();
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `module-${sourceModule}-${field.key}`,
        data: { ...field, sourceModule, isModuleField: true }
    });

    return (
        <ListItemButton
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            sx={{
                mb: 1,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '8px',
                bgcolor: alpha(theme.palette.background.paper, 0.7),
                opacity: disabled ? 0.45 : 1,
                pointerEvents: disabled ? "none" : "auto",
                '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.04)
                },
                cursor: 'grab'
            }}
        >
            <ListItemIcon sx={{ minWidth: 30 }}>
                <DragIndicatorIcon fontSize="small" color="action" />
            </ListItemIcon>
            <ListItemText
                primary={field.label}
                secondary={disabled ? "Already added" : moduleLabel(sourceModule)}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                secondaryTypographyProps={{ variant: 'caption' }}
            />
        </ListItemButton>
    );
}

function DroppableCanvas({
    fields,
    selectedId,
    onSelect,
    columns = 2,
    tabs = [],
    sections = [],
    activeTabId,
    onTabChange,
    showSectionNames = true,
    onRemoveField,
    onToggleFieldWidth,
    onRemoveTab,
    onRemoveSection,
}: any) {
    const theme = useTheme();
    const { setNodeRef } = useDroppable({
        id: 'canvas-droppable',
    });
    const activeTab = activeTabId || tabs[0]?.id || "tab_1";
    const activeSections = sections.filter((section: any) => section.tabId === activeTab);
    const visibleFields = fields.filter((field: any) => (field.tabId || tabs[0]?.id || "tab_1") === activeTab);

    return (
        <Paper
            ref={setNodeRef}
            elevation={2}
            sx={{
                width: '100%',
                maxWidth: 920,
                minHeight: 600,
                flex: '0 0 auto',
                borderRadius: '12px',
                p: 2.5,
                mb: 3,
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
                    <Box>
                        <Tabs value={activeTab} onChange={(_, value) => onTabChange?.(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider", minHeight: 38 }}>
                            {tabs.map((tab: any) => (
                                <Tab
                                    key={tab.id}
                                    value={tab.id}
                                    sx={{ minHeight: 38, py: 0, pr: 0.5 }}
                                    label={(
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Box component="span">{tab.label}</Box>
                                            <IconButton
                                                size="small"
                                                onClick={(event: any) => {
                                                    event.stopPropagation();
                                                    onRemoveTab?.(tab.id);
                                                }}
                                                sx={{ width: 18, height: 18 }}
                                            >
                                                <CloseIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                        </Stack>
                                    )}
                                />
                            ))}
                        </Tabs>
                        {(activeSections.length ? activeSections : [{ id: "section_1", label: "Section 1" }]).map((section: any) => {
                            const sectionFields = visibleFields.filter((field: any) => (field.sectionId || activeSections[0]?.id || section.id) === section.id);
                            return (
                                <Box key={section.id} sx={{ mb: 2.25, position: 'relative' }}>
                                    {showSectionNames && (
                                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                                            <Typography variant="subtitle2" fontWeight={800} sx={{ color: "primary.main" }}>
                                                {section.label}
                                            </Typography>
                                            <IconButton size="small" onClick={() => onRemoveSection?.(section.id)} sx={{ width: 22, height: 22 }}>
                                                <CloseIcon sx={{ fontSize: 15 }} />
                                            </IconButton>
                                        </Stack>
                                    )}
                                    <Box
                                        sx={{
                                            display: 'grid',
                                            gridTemplateColumns: columns === 2 ? { xs: '1fr', md: '1fr 1fr' } : '1fr',
                                            gap: 1.5,
                                            minHeight: 64,
                                            border: sectionFields.length === 0 ? `1px dashed ${theme.palette.divider}` : "none",
                                            borderRadius: 2,
                                            p: sectionFields.length === 0 ? 1.5 : 0,
                                        }}
                                    >
                                        {sectionFields.length === 0 ? (
                                            <Typography variant="caption" color="text.secondary">Drop fields into this section</Typography>
                                        ) : sectionFields.map((field: FormField) => (
                                            <SortableField
                                                key={field.id}
                                                field={field}
                                                columns={columns}
                                                isSelected={selectedId === field.id}
                                                onSelect={() => onSelect(field.id)}
                                                onRemove={() => onRemoveField?.(field.id)}
                                                onToggleWidth={() => onToggleFieldWidth?.(field.id)}
                                            />
                                        ))}
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </SortableContext>
        </Paper>
    );
}

function SortableField({ field, columns, isSelected, onSelect, onRemove, onToggleWidth }: any) {
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
                p: 1.5,
                gridColumn: columns === 2 && field.width === 2 ? '1 / -1' : 'auto',
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
            <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 5 }}>
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
            <Stack
                direction="row"
                spacing={0.25}
                sx={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    opacity: isSelected ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    '.MuiBox-root:hover > &': { opacity: 1 },
                }}
            >
                {columns === 2 && (
                    <IconButton
                        size="small"
                        onClick={(event: any) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggleWidth?.();
                        }}
                        sx={{ width: 22, height: 22, bgcolor: 'background.paper' }}
                    >
                        <WidthIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                )}
                <IconButton
                    size="small"
                    onClick={(event: any) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemove?.();
                    }}
                    sx={{ width: 22, height: 22, bgcolor: 'background.paper' }}
                >
                    <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
            </Stack>

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

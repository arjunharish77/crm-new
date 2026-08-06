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
    Type as TextFieldsIcon,
    AlignLeft as NotesIcon,
    Hash as NumbersIcon,
    Mail as EmailIcon,
    Phone as PhoneIcon,
    Calendar as EventIcon,
    List as ListIcon,
    CheckSquare as CheckBoxIcon,
    CircleDot as RadioButtonCheckedIcon,
    EyeOff as VisibilityOffIcon,
    Code as CodeIcon,
    Save as SaveIcon,
    GripVertical as DragIndicatorIcon,
    Trash2 as DeleteIcon,
    Plus as AddIcon,
    Palette as ColorLensIcon,
    Settings as SettingsIcon,
    SlidersHorizontal as TuneIcon,
    X as CloseIcon,
    Columns2 as WidthIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { nanoid } from "nanoid";

import { EmbedCodeDialog } from "./EmbedCodeDialog";
import { StyleEditor } from "./style-editor";
import { ConditionalLogicBuilder } from "./logic-builder";

// --- Types ---
// Options normally used to be plain strings (the same string served as both the stored
// value and the displayed label -- fine for enum-like values such as LOW/MEDIUM/HIGH).
// The Opportunity Type selector needs an opaque id as the value and a real name as the
// label, so options can now also be {value, label} pairs. Existing string-array options
// keep working as-is; normalizeOptions() below is the single place that reads either shape.
type FieldOption = string | { value: string; label: string };

interface FormField {
    id: string;
    type: string;
    label: string;
    placeholder?: string;
    required: boolean;
    options?: FieldOption[]; // for select, radio, checkbox
    sourceModule?: 'lead' | 'opportunity' | 'activity' | 'task';
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
    task: [
        { key: "title", label: "Task Title", type: "TEXT" },
        { key: "description", label: "Task Description", type: "TEXTAREA" },
        { key: "status", label: "Task Status", type: "SELECT", options: ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] },
        { key: "priority", label: "Task Priority", type: "SELECT", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
        { key: "dueAt", label: "Task Due Date", type: "DATE" },
        { key: "reminderAt", label: "Task Reminder", type: "DATE" },
    ],
} as const;

type SourceModule = keyof typeof MODULE_FIELDS;

// The one real field that lets an end user pick which Opportunity Type to create --
// as opposed to `opportunityTypeId` on FormField, which is an authoring-time tag scoping
// a field to the builder canvas context it was dragged in under. Same name, different job.
const OPPORTUNITY_TYPE_FIELD_KEY = "opportunityTypeId";
const OPPORTUNITY_TYPE_MAPPING = "opportunity.opportunityTypeId";

// Sentinel for the builder's "which type am I currently editing fields for" context menu --
// fields added while this is selected get no opportunityTypeId tag at all, so they stay
// visible regardless of which type the end user later picks (a shared field like Amount).
const ALL_OPPORTUNITY_TYPES = "__all_types__";

function normalizeOptions(options: FieldOption[] | undefined): Array<{ value: string; label: string }> {
    if (!Array.isArray(options)) return [];
    return options.map((option) =>
        typeof option === "string" ? { value: option, label: option } : { value: String(option.value ?? ""), label: String(option.label ?? option.value ?? "") }
    );
}

function isOpportunityTypeField(field: Pick<FormField, "mapping"> | null | undefined) {
    return field?.mapping === OPPORTUNITY_TYPE_MAPPING;
}

const CRM_PLACEMENTS = [
    { value: "LEAD_DETAIL", label: "Lead detail" },
    { value: "OPPORTUNITY_DETAIL", label: "Opportunity detail" },
    { value: "ACTIVITY_DETAIL", label: "Activity detail" },
    { value: "LEAD_CREATE", label: "Lead create" },
    { value: "OPPORTUNITY_CREATE", label: "Opportunity create" },
];

// Radix Select rejects an empty-string item value, so unmapped fields use this sentinel,
// translated back to "" at the state-update boundary.
const NO_MAPPING = "__none__";

function moduleLabel(module: SourceModule) {
    return module.charAt(0).toUpperCase() + module.slice(1);
}

export function FormEditor({ initialForm }: EditorProps) {
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
    const [moduleCustomFields, setModuleCustomFields] = useState<Record<SourceModule, any[]>>({ lead: [], opportunity: [], activity: [], task: [] });
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
            apiFetch("/custom-fields?objectType=TASK").catch(() => []),
        ]).then(([oppTypes, actTypes, userList, groupList, leadFields, oppFields, actFields, taskFields]) => {
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
                task: Array.isArray(taskFields) ? taskFields : [],
            });
            setSelectedOpportunityTypeId((current) => current || opportunities[0]?.id || "");
            setSelectedActivityTypeId((current) => current || activities[0]?.id || "");
        });
    }, []);

    useEffect(() => {
        if (!selectedOpportunityTypeId || selectedOpportunityTypeId === ALL_OPPORTUNITY_TYPES) {
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
        // The real, end-user-facing Opportunity Type selector -- options come from the
        // tenant's actual OpportunityType rows (id as value, name as label), not a static
        // MODULE_FIELDS entry, since it needs live state.
        const opportunityTypeSelector = module === "opportunity" ? [{
            key: OPPORTUNITY_TYPE_FIELD_KEY,
            label: "Opportunity Type",
            type: "SELECT",
            options: opportunityTypes.map((type) => ({ value: type.id, label: type.name })),
        }] : [];
        const seen = new Set<string>();
        return [
            ...opportunityTypeSelector,
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
        // The Opportunity Type selector itself is never tagged with a type (it can't be --
        // that would make its own visibility circular), and neither is any field added while
        // "All types" is the active builder context, so both resolve to the empty scope.
        const opportunityScope = key === OPPORTUNITY_TYPE_FIELD_KEY || selectedOpportunityTypeId === ALL_OPPORTUNITY_TYPES
            ? ""
            : selectedOpportunityTypeId;
        const scopeId = sourceModule === "opportunity" ? opportunityScope : sourceModule === "activity" ? selectedActivityTypeId : "";
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
            const isOpportunityTypeSelector = tool.sourceModule === "opportunity" && tool.key === OPPORTUNITY_TYPE_FIELD_KEY;
            // The selector itself never gets tagged (it can't be scoped to the type it selects),
            // and nothing gets tagged while "All types" is the active builder context.
            const opportunityTypeTag = tool.sourceModule === "opportunity" && !isOpportunityTypeSelector && selectedOpportunityTypeId !== ALL_OPPORTUNITY_TYPES
                ? selectedOpportunityTypeId
                : undefined;
            const newField: FormField = {
                id: nanoid(),
                type: tool.type,
                label: tool.label,
                required: isOpportunityTypeSelector ? true : false,
                sourceModule: tool.sourceModule,
                mapping: `${tool.sourceModule}.${tool.key}`,
                tabId: activeCanvasTabId,
                sectionId: settings.sections.find((section: any) => section.tabId === activeCanvasTabId)?.id || "section_1",
                opportunityTypeId: opportunityTypeTag,
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
            <div className="flex h-[calc(100vh-240px)] min-h-[720px] overflow-hidden bg-background">
                {/* Left Sidebar: Tools */}
                <div className="z-[2] flex w-60 flex-col border-r bg-background/50 backdrop-blur-sm">
                    <div className="border-b p-3.5">
                        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                            Field Library
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Drag module fields or generic blocks into the form
                        </p>
                    </div>
                    <div className="space-y-2 px-3 pt-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Source Module</Label>
                            <Select value={fieldLibraryModule} onValueChange={(value) => setFieldLibraryModule(value as SourceModule)}>
                                <SelectTrigger size="sm" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="lead">Lead</SelectItem>
                                    <SelectItem value="opportunity">Opportunity</SelectItem>
                                    <SelectItem value="activity">Activity</SelectItem>
                                    <SelectItem value="task">Task</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {fieldLibraryModule === "opportunity" && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">Opportunity Type</Label>
                                <Select value={selectedOpportunityTypeId} onValueChange={(value) => setSelectedOpportunityTypeId(value)}>
                                    <SelectTrigger size="sm" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL_OPPORTUNITY_TYPES}>All types</SelectItem>
                                        {opportunityTypes.map((type) => (
                                            <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {fieldLibraryModule === "activity" && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">Activity Type</Label>
                                <Select value={selectedActivityTypeId} onValueChange={(value) => setSelectedActivityTypeId(value)}>
                                    <SelectTrigger size="sm" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activityTypes.map((type) => (
                                            <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        <p className="mb-2 block text-xs font-bold text-muted-foreground">
                            {moduleLabel(fieldLibraryModule)} Fields
                        </p>
                        {moduleFields.map((field) => (
                            <DraggableModuleField
                                key={`${fieldLibraryModule}.${field.key}`}
                                sourceModule={fieldLibraryModule}
                                field={field}
                                disabled={isModuleFieldAlreadyUsed(fieldLibraryModule, field.key)}
                            />
                        ))}
                        <Separator className="my-3" />
                        <p className="mb-2 block text-xs font-bold text-muted-foreground">
                            Special Fields
                        </p>
                        {FIELD_TYPES.map(t => (
                            <DraggableTool key={t.type} type={t.type} label={t.label} icon={t.icon} />
                        ))}
                    </div>
                </div>

                {/* Center: Canvas */}
                <div className="relative flex flex-1 flex-col items-center gap-4 overflow-y-auto bg-primary/[0.02] p-4">
                    {/* Toolbar */}
                    <div className="flex w-full max-w-[800px] items-center justify-between rounded-xl border bg-card p-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                        <div>
                            <p className="text-xs tracking-wider text-muted-foreground uppercase">
                                Canvas Preview
                            </p>
                            <h2 className="text-[1.1rem] font-bold">{initialForm.name}</h2>
                            {initialForm.description && <p className="text-xs text-muted-foreground">{initialForm.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={addTab}>
                                <AddIcon className="size-4" />
                                Tab
                            </Button>
                            <Button variant="outline" size="sm" onClick={addSection}>
                                <AddIcon className="size-4" />
                                Section
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setEmbedDialogOpen(true)}>
                                <CodeIcon className="size-4" />
                                Embed
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={saving}>
                                <SaveIcon className="size-4" />
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>

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
                </div>

                {/* Right Sidebar: Properties */}
                <div className="z-[2] flex w-80 flex-col border-l">
                    <div className="border-b">
                        <div className="px-4 pt-3">
                            <p className="text-xs tracking-wider text-muted-foreground uppercase">
                                Inspector
                            </p>
                        </div>
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="flex h-auto w-full rounded-none bg-transparent p-0">
                                <TabsTrigger
                                    value="field"
                                    className="flex-1 gap-1.5 rounded-none border-b-2 border-transparent py-2.5 text-xs font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                                >
                                    <TuneIcon className="size-3.5" />
                                    Field
                                </TabsTrigger>
                                <TabsTrigger
                                    value="design"
                                    className="flex-1 gap-1.5 rounded-none border-b-2 border-transparent py-2.5 text-xs font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                                >
                                    <ColorLensIcon className="size-3.5" />
                                    Design
                                </TabsTrigger>
                                <TabsTrigger
                                    value="settings"
                                    className="flex-1 gap-1.5 rounded-none border-b-2 border-transparent py-2.5 text-xs font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                                >
                                    <SettingsIcon className="size-3.5" />
                                    Settings
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === "field" && (
                            selectedField ? (
                                <div className="space-y-6">
                                    <div>
                                        <p className="mb-2 text-sm font-semibold">Basic Properties</p>
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="field-editor-label-input">Label</Label>
                                                <Input
                                                    id="field-editor-label-input"
                                                    value={selectedField.label}
                                                    onChange={e => updateField(selectedField.id, { label: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Tab</Label>
                                                <Select
                                                    value={selectedField.tabId || settings.tabs[0]?.id || "tab_1"}
                                                    onValueChange={value => {
                                                        const tabId = value;
                                                        const sectionId = settings.sections.find((section: any) => section.tabId === tabId)?.id;
                                                        updateField(selectedField.id, { tabId, sectionId });
                                                    }}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {settings.tabs.map((tab: any) => (
                                                            <SelectItem key={tab.id} value={tab.id}>{tab.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Section</Label>
                                                <Select
                                                    value={selectedField.sectionId || ""}
                                                    onValueChange={value => updateField(selectedField.id, { sectionId: value })}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {settings.sections.filter((section: any) => section.tabId === (selectedField.tabId || settings.tabs[0]?.id)).map((section: any) => (
                                                            <SelectItem key={section.id} value={section.id}>{section.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {selectedField.type !== 'HIDDEN' && selectedField.type !== 'CHECKBOX' && (
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="field-editor-placeholder-input">Placeholder</Label>
                                                    <Input
                                                        id="field-editor-placeholder-input"
                                                        value={selectedField.placeholder || ''}
                                                        onChange={e => updateField(selectedField.id, { placeholder: e.target.value })}
                                                    />
                                                </div>
                                            )}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="field-editor-help-text-input">Help Text</Label>
                                                <Input
                                                    id="field-editor-help-text-input"
                                                    value={selectedField.helpText || ''}
                                                    onChange={e => updateField(selectedField.id, { helpText: e.target.value })}
                                                />
                                                <p className="text-xs text-muted-foreground">Displayed below the input field</p>
                                            </div>
                                            {selectedField.type !== 'HIDDEN' && (
                                                <label className="flex items-center gap-2 text-sm font-medium">
                                                    <Switch
                                                        checked={selectedField.required}
                                                        onCheckedChange={checked => updateField(selectedField.id, { required: checked })}
                                                    />
                                                    Required Field
                                                </label>
                                            )}
                                        </div>
                                    </div>

                                    {['SELECT', 'CHECKBOX', 'RADIO'].includes(selectedField.type) && !isOpportunityTypeField(selectedField) && (
                                        <div>
                                            <p className="mb-2 text-sm font-semibold">Options</p>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="field-editor-options-input">Options (comma separated)</Label>
                                                <Textarea
                                                    id="field-editor-options-input"
                                                    rows={3}
                                                    value={normalizeOptions(selectedField.options).map(option => option.label).join(', ')}
                                                    onChange={e => updateField(selectedField.id, {
                                                        options: e.target.value.split(',').map(s => s.trim()).filter((option) => option.length > 0)
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {['SELECT', 'CHECKBOX', 'RADIO'].includes(selectedField.type) && isOpportunityTypeField(selectedField) && (
                                        <div>
                                            <p className="mb-2 text-sm font-semibold">Options</p>
                                            <p className="text-xs text-muted-foreground">
                                                Options are derived automatically from this tenant&apos;s Opportunity Types.
                                            </p>
                                        </div>
                                    )}

                                    <Separator />

                                    <div>
                                        <p className="mb-2 text-sm font-semibold">Data Mapping</p>
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label>Source Module</Label>
                                                <Select
                                                    value={selectedField.sourceModule || "lead"}
                                                    onValueChange={value => {
                                                        const sourceModule = value as SourceModule;
                                                        const fieldKey = selectedField.mapping?.split(".").pop() || "";
                                                        // The selector field itself never gets tagged with a type, and
                                                        // nothing gets tagged while "All types" is the active context.
                                                        const isSelector = sourceModule === "opportunity" && fieldKey === OPPORTUNITY_TYPE_FIELD_KEY;
                                                        const opportunityTypeTag = sourceModule === "opportunity" && !isSelector && selectedOpportunityTypeId !== ALL_OPPORTUNITY_TYPES
                                                            ? selectedOpportunityTypeId
                                                            : undefined;
                                                        updateField(selectedField.id, {
                                                            sourceModule,
                                                            mapping: fieldKey ? `${sourceModule}.${fieldKey}` : "",
                                                            opportunityTypeId: opportunityTypeTag,
                                                            activityTypeId: sourceModule === "activity" ? selectedActivityTypeId : undefined,
                                                        });
                                                    }}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="lead">Lead</SelectItem>
                                                        <SelectItem value="opportunity">Opportunity</SelectItem>
                                                        <SelectItem value="activity">Activity</SelectItem>
                                                        <SelectItem value="task">Task</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Module Field</Label>
                                                <Select
                                                    value={selectedField.mapping || NO_MAPPING}
                                                    onValueChange={value => updateField(selectedField.id, { mapping: value === NO_MAPPING ? "" : value })}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={NO_MAPPING}>
                                                            <em>None (store submission only)</em>
                                                        </SelectItem>
                                                        {fieldsForModule((selectedField.sourceModule || "lead") as SourceModule).map((field) => (
                                                            <SelectItem
                                                                key={field.key}
                                                                value={`${selectedField.sourceModule || "lead"}.${field.key}`}
                                                            >
                                                                {field.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {selectedField.mapping === "opportunity.amount" && selectedField.type !== "NUMBER" && (
                                                    <p className="text-xs text-destructive">
                                                        Amount expects a numeric value. A {selectedField.type.toLowerCase()} field lets visitors
                                                        enter text (e.g. &quot;1,00,000&quot;) that will fail to save as an Opportunity amount.
                                                        Change this field&apos;s type to Number.
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="field-editor-default-value-input">Default Value</Label>
                                                <Input
                                                    id="field-editor-default-value-input"
                                                    value={selectedField.defaultValue || ''}
                                                    onChange={e => updateField(selectedField.id, { defaultValue: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Separator />

                                    <div>
                                        <p className="mb-2 text-sm font-semibold">Validation</p>
                                        <div className="flex gap-2">
                                            <div className="flex-1 space-y-1.5">
                                                <Label htmlFor="field-editor-min-input">Min</Label>
                                                <Input
                                                    id="field-editor-min-input"
                                                    type="number"
                                                    value={selectedField.validation?.min ?? ''}
                                                    onChange={e => updateField(selectedField.id, {
                                                        validation: { ...selectedField.validation, min: e.target.value ? parseInt(e.target.value) : undefined }
                                                    })}
                                                />
                                            </div>
                                            <div className="flex-1 space-y-1.5">
                                                <Label htmlFor="field-editor-max-input">Max</Label>
                                                <Input
                                                    id="field-editor-max-input"
                                                    type="number"
                                                    value={selectedField.validation?.max ?? ''}
                                                    onChange={e => updateField(selectedField.id, {
                                                        validation: { ...selectedField.validation, max: e.target.value ? parseInt(e.target.value) : undefined }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-1.5">
                                            <Label htmlFor="field-editor-pattern-input">Pattern (Regex)</Label>
                                            <Input
                                                id="field-editor-pattern-input"
                                                value={selectedField.validation?.pattern ?? ''}
                                                onChange={e => updateField(selectedField.id, {
                                                    validation: { ...selectedField.validation, pattern: e.target.value }
                                                })}
                                            />
                                        </div>
                                    </div>

                                    <Separator />

                                    <div>
                                        <p className="mb-2 text-sm font-semibold">Conditional Logic</p>
                                        <ConditionalLogicBuilder
                                            fields={fields}
                                            currentFieldId={selectedField.id}
                                            value={selectedField.logic as any}
                                            onChange={(rule) => updateField(selectedField.id, { logic: rule })}
                                        />
                                    </div>

                                    <Separator />

                                    <Button
                                        variant="outline"
                                        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => removeField(selectedField.id)}
                                    >
                                        <DeleteIcon className="size-4" />
                                        Remove Field
                                    </Button>
                                </div>
                            ) : (
                                <div className="py-16 text-center opacity-50">
                                    <p className="text-sm">Select a field on the canvas to edit its properties.</p>
                                </div>
                            )
                        )}

                        {activeTab === "design" && (
                            <StyleEditor
                                values={{ theme: settings.theme, customCss: settings.customCss }}
                                onChange={(vals) => setSettings({ ...settings, ...vals })}
                            />
                        )}

                        {activeTab === "settings" && (
                            <div className="space-y-6">
                                <div className="space-y-1.5">
                                    <Label htmlFor="settings-submit-button-text-input">Submit Button Text</Label>
                                    <Input
                                        id="settings-submit-button-text-input"
                                        value={settings.submitButtonText}
                                        onChange={e => setSettings({ ...settings, submitButtonText: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Form Layout</Label>
                                    <Select
                                        value={String(settings.layoutColumns)}
                                        onValueChange={value => setSettings({ ...settings, layoutColumns: Number(value) })}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">Single column</SelectItem>
                                            <SelectItem value="2">Two columns</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <Switch
                                        checked={settings.useMultiStep}
                                        onCheckedChange={checked => setSettings({ ...settings, useMultiStep: checked })}
                                    />
                                    Use as multi-step form
                                </label>
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <Switch
                                        checked={settings.showSectionNames}
                                        onCheckedChange={checked => setSettings({ ...settings, showSectionNames: checked })}
                                    />
                                    Show section names
                                </label>
                                <div className="space-y-1.5">
                                    <Label>Tabs Placement</Label>
                                    <Select value={settings.tabsPlacement} onValueChange={value => setSettings({ ...settings, tabsPlacement: value })}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="TOP">Top</SelectItem>
                                            <SelectItem value="LEFT">Left</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <p className="mb-2 text-sm font-semibold">Tabs</p>
                                    <div className="space-y-2">
                                        {settings.tabs.map((tab: any, index: number) => (
                                            <div key={tab.id} className="flex items-center gap-2">
                                                <Input
                                                    aria-label={`Tab ${index + 1}`}
                                                    value={tab.label}
                                                    onChange={e => updateTabLabel(tab.id, e.target.value)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => removeTab(tab.id)}
                                                    disabled={settings.tabs.length <= 1}
                                                >
                                                    <CloseIcon className="size-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="mb-2 text-sm font-semibold">Sections</p>
                                    <div className="space-y-2">
                                        {settings.sections.map((section: any, index: number) => (
                                            <div key={section.id} className="flex items-center gap-2">
                                                <Input
                                                    aria-label={`Section ${index + 1}`}
                                                    value={section.label}
                                                    onChange={e => updateSectionLabel(section.id, e.target.value)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => removeSection(section.id)}
                                                    disabled={settings.sections.filter((item: any) => item.tabId === section.tabId).length <= 1}
                                                >
                                                    <CloseIcon className="size-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="settings-success-message-input">Success Message</Label>
                                    <Textarea
                                        id="settings-success-message-input"
                                        rows={2}
                                        value={settings.successMessage}
                                        onChange={e => setSettings({ ...settings, successMessage: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="settings-redirect-url-input">Redirect URL</Label>
                                    <Input
                                        id="settings-redirect-url-input"
                                        placeholder="https://"
                                        value={settings.redirectUrl}
                                        onChange={e => setSettings({ ...settings, redirectUrl: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="settings-notification-emails-input">Notification Emails</Label>
                                    <Input
                                        id="settings-notification-emails-input"
                                        placeholder="admin@example.com"
                                        value={settings.notificationEmails}
                                        onChange={e => setSettings({ ...settings, notificationEmails: e.target.value })}
                                    />
                                </div>

                                <Separator />

                                <div>
                                    <p className="mb-2 text-sm font-semibold">Security & Limits</p>
                                    <label className="flex items-center gap-2 text-sm font-medium">
                                        <Switch
                                            checked={settings.spamProtection}
                                            onCheckedChange={checked => setSettings({ ...settings, spamProtection: checked })}
                                        />
                                        Spam Protection
                                    </label>
                                    <div className="mt-3 space-y-1.5">
                                        <Label htmlFor="settings-rate-limit-input">Rate Limit (submissions/hr)</Label>
                                        <Input
                                            id="settings-rate-limit-input"
                                            type="number"
                                            value={settings.rateLimit}
                                            onChange={e => setSettings({ ...settings, rateLimit: parseInt(e.target.value) || 10 })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <p className="mb-2 text-sm font-semibold">Duplicate Handling</p>
                                    <Select value={settings.duplicateAction} onValueChange={value => setSettings({ ...settings, duplicateAction: value })}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CREATE">Always Create New Lead</SelectItem>
                                            <SelectItem value="UPDATE">Update Existing Lead</SelectItem>
                                            <SelectItem value="SKIP">Skip (Don&apos;t Create)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Separator />

                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <Switch
                                        checked={settings.isActive}
                                        onCheckedChange={checked => setSettings({ ...settings, isActive: checked })}
                                    />
                                    Form Active
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <DragOverlay>
                {activeDragItem ? (
                    <div className="flex w-[200px] cursor-grabbing items-center gap-3 rounded-lg border bg-card p-4 opacity-90 shadow-lg">
                        <DragIndicatorIcon className="size-4 text-muted-foreground" />
                        <p className="text-sm font-semibold">{activeDragItem.label}</p>
                    </div>
                ) : null}
            </DragOverlay>

            <EmbedCodeDialog
                open={embedDialogOpen}
                onOpenChange={setEmbedDialogOpen}
                formId={initialForm.id}
                formName={initialForm.name}
            />
        </DndContext>
    );
}

function DraggableTool({ type, label, icon: Icon }: any) {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `tool-${type}`,
        data: { type, label, isTool: true }
    });

    return (
        <button
            type="button"
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className="mb-2 flex w-full cursor-grab items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
        </button>
    );
}

function DraggableModuleField({ sourceModule, field, disabled }: any) {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `module-${sourceModule}-${field.key}`,
        data: { ...field, sourceModule, isModuleField: true }
    });

    return (
        <button
            type="button"
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn(
                "mb-2 flex w-full cursor-grab items-center gap-2 rounded-lg border bg-card/70 px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                disabled && "pointer-events-none opacity-45"
            )}
        >
            <DragIndicatorIcon className="size-4 shrink-0 text-muted-foreground" />
            <div>
                <p className="text-sm font-semibold">{field.label}</p>
                <p className="text-xs text-muted-foreground">{disabled ? "Already added" : moduleLabel(sourceModule)}</p>
            </div>
        </button>
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
    const { setNodeRef } = useDroppable({
        id: 'canvas-droppable',
    });
    const activeTab = activeTabId || tabs[0]?.id || "tab_1";
    const activeSections = sections.filter((section: any) => section.tabId === activeTab);
    const visibleFields = fields.filter((field: any) => (field.tabId || tabs[0]?.id || "tab_1") === activeTab);

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "mb-6 min-h-[600px] w-full max-w-[920px] flex-none rounded-xl border bg-card p-5 shadow-md transition-all",
                fields.length === 0 && "flex items-center justify-center border-dashed"
            )}
        >
            <SortableContext items={fields.map((f: any) => f.id)} strategy={verticalListSortingStrategy}>
                {fields.length === 0 ? (
                    <div className="text-center text-muted-foreground">
                        <AddIcon className="mx-auto mb-2 size-12 opacity-20" />
                        <p className="text-sm">Drag fields here from the left sidebar</p>
                    </div>
                ) : (
                    <div>
                        <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b">
                            {tabs.map((tab: any) => (
                                <div
                                    key={tab.id}
                                    className={cn(
                                        "flex items-center gap-1 border-b-2 py-2 pr-1 pl-2.5 text-sm whitespace-nowrap",
                                        activeTab === tab.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <button type="button" onClick={() => onTabChange?.(tab.id)} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        {tab.label}
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        className="size-[18px]"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onRemoveTab?.(tab.id);
                                        }}
                                    >
                                        <CloseIcon className="size-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        {(activeSections.length ? activeSections : [{ id: "section_1", label: "Section 1" }]).map((section: any) => {
                            const sectionFields = visibleFields.filter((field: any) => (field.sectionId || activeSections[0]?.id || section.id) === section.id);
                            return (
                                <div key={section.id} className="relative mb-[18px]">
                                    {showSectionNames && (
                                        <div className="mb-[6px] flex items-center justify-between">
                                            <p className="text-sm font-extrabold text-primary">
                                                {section.label}
                                            </p>
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="size-[22px]"
                                                onClick={() => onRemoveSection?.(section.id)}
                                            >
                                                <CloseIcon className="size-[15px]" />
                                            </Button>
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            "grid min-h-16 gap-3",
                                            columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
                                            sectionFields.length === 0 && "rounded-lg border border-dashed p-3"
                                        )}
                                    >
                                        {sectionFields.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">Drop fields into this section</p>
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
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SortableContext>
        </div>
    );
}

function SortableField({ field, columns, isSelected, onSelect, onRemove, onToggleWidth }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

    // Simple render of field based on type
    const renderInput = () => {
        switch (field.type) {
            case 'TEXTAREA':
                return <Textarea rows={3} disabled placeholder={field.placeholder || "Long text answer"} className="resize-none text-sm" />;
            case 'SELECT':
                return (
                    <Select disabled>
                        <SelectTrigger size="sm" className="w-full">
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent />
                    </Select>
                );
            case 'CHECKBOX':
            case 'RADIO':
                return (
                    <div className="space-y-1">
                        {(field.options?.length ? normalizeOptions(field.options) : [{ value: "Option 1", label: "Option 1" }]).map((option, index: number) => (
                            <label key={index} className="flex items-center gap-2 text-sm">
                                <Switch size="sm" disabled />
                                {option.label}
                            </label>
                        ))}
                    </div>
                );
            case 'FILE':
                return (
                    <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
                        File Upload Area
                    </div>
                );
            case 'HIDDEN':
                return (
                    <div className="flex items-center gap-2 rounded border border-dashed border-yellow-500 bg-yellow-500/10 p-2">
                        <VisibilityOffIcon className="size-4" />
                        <span className="text-xs">Hidden Field: {field.mapping || 'Unmapped'}</span>
                    </div>
                );
            default:
                return <Input disabled placeholder={field.placeholder || field.label} className="text-sm" />;
        }
    };

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect();
            }}
            className={cn(
                "group relative cursor-pointer rounded-[10px] border p-3 transition-all",
                columns === 2 && field.width === 2 && "col-span-full",
                isSelected
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:-translate-y-px hover:border-border hover:bg-accent/60 hover:shadow-sm"
            )}
        >
            <div className="mb-2 flex items-center justify-between gap-2 pr-10">
                <p className="text-sm font-semibold">
                    {field.label} {field.required && <span className="text-destructive">*</span>}
                </p>
                <div
                    {...attributes}
                    {...listeners}
                    className="flex cursor-grab text-muted-foreground/60 hover:text-muted-foreground"
                >
                    <DragIndicatorIcon className="size-4" />
                </div>
            </div>

            <div
                className={cn(
                    "absolute top-1.5 right-1.5 flex gap-0.5 transition-opacity",
                    isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
            >
                {columns === 2 && (
                    <Button
                        variant="outline"
                        size="icon-xs"
                        className="size-[22px] bg-card"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggleWidth?.();
                        }}
                    >
                        <WidthIcon className="size-[15px]" />
                    </Button>
                )}
                <Button
                    variant="outline"
                    size="icon-xs"
                    className="size-[22px] bg-card"
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemove?.();
                    }}
                >
                    <CloseIcon className="size-[15px]" />
                </Button>
            </div>

            <div className="pointer-events-none">
                {renderInput()}
            </div>

            {isSelected && (
                <div className="absolute inset-y-0 left-[-2px] w-1 rounded-l-full bg-primary" />
            )}
        </div>
    );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type FieldAccess = "editable" | "readonly" | "hidden";
type ActionKey = "view" | "create" | "edit" | "delete" | "import" | "export";

type FieldDef = {
    key: string;
    label: string;
    type?: string;
};

type PermissionTemplate = {
    id: string;
    name: string;
    description?: string | null;
    isActive: boolean;
    permissions: TemplatePermissions;
    createdAt: string;
    updatedAt: string;
};

type TemplatePermissions = {
    actions?: Record<string, Partial<Record<ActionKey, boolean>>>;
    fieldPermissions?: Record<string, Record<string, FieldAccess>>;
};

const ACTIONS: { key: ActionKey; label: string }[] = [
    { key: "view", label: "View" },
    { key: "create", label: "Create" },
    { key: "edit", label: "Edit" },
    { key: "delete", label: "Delete" },
    { key: "import", label: "Import" },
    { key: "export", label: "Export" },
];

const BASE_FIELDS: Record<string, FieldDef[]> = {
    lead: [
        { key: "name", label: "Lead Name", type: "Text" },
        { key: "email", label: "Email", type: "Email" },
        { key: "phone", label: "Phone", type: "Phone" },
        { key: "company", label: "Company", type: "Text" },
        { key: "source", label: "Source", type: "Dropdown" },
        { key: "status", label: "Status", type: "Dropdown" },
        { key: "score", label: "Score", type: "Number" },
        { key: "ownerId", label: "Owner", type: "User" },
    ],
    opportunity: [
        { key: "title", label: "Opportunity Title", type: "Text" },
        { key: "amount", label: "Amount", type: "Number" },
        { key: "stageId", label: "Stage", type: "Dropdown" },
        { key: "priority", label: "Priority", type: "Dropdown" },
        { key: "expectedCloseDate", label: "Expected Close", type: "Date" },
        { key: "ownerId", label: "Owner", type: "User" },
    ],
    activity: [
        { key: "outcome", label: "Outcome", type: "Dropdown" },
        { key: "notes", label: "Notes", type: "Long Text" },
        { key: "dueAt", label: "Due At", type: "Date" },
        { key: "completedAt", label: "Completed At", type: "Date" },
        { key: "createdBy", label: "Created By", type: "User" },
    ],
};

const defaultPermissions = (): TemplatePermissions => ({ actions: {}, fieldPermissions: {} });

function accessLabel(value: FieldAccess) {
    if (value === "readonly") return "Read Only";
    if (value === "hidden") return "Hidden";
    return "Editable";
}

function normalizePermissions(value: unknown): TemplatePermissions {
    if (!value || typeof value !== "object") return defaultPermissions();
    const permissions = value as TemplatePermissions;
    return {
        actions: permissions.actions ?? {},
        fieldPermissions: permissions.fieldPermissions ?? {},
    };
}

export default function PermissionTemplatesPage() {
    const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<PermissionTemplate | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [permissions, setPermissions] = useState<TemplatePermissions>(defaultPermissions());
    const [selectedScope, setSelectedScope] = useState("lead");

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [templateData, oppTypeData, activityTypeData] = await Promise.all([
                apiFetch("/permission-templates"),
                apiFetch("/opportunity-types"),
                apiFetch("/activity-types"),
            ]);
            setTemplates(Array.isArray(templateData) ? templateData.map((template) => ({ ...template, permissions: normalizePermissions(template.permissions) })) : []);
            setOpportunityTypes(Array.isArray(oppTypeData) ? oppTypeData : []);
            setActivityTypes(Array.isArray(activityTypeData) ? activityTypeData : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load permission templates");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const scopes = useMemo(() => [
        { key: "lead", label: "Lead", subtitle: "Lead fields", fields: BASE_FIELDS.lead },
        ...opportunityTypes.map((type) => ({
            key: `opportunity:${type.id}`,
            label: type.name,
            subtitle: "Opportunity type",
            fields: BASE_FIELDS.opportunity,
        })),
        ...activityTypes.map((type) => ({
            key: `activity:${type.id}`,
            label: type.name,
            subtitle: "Activity type",
            fields: BASE_FIELDS.activity,
        })),
    ], [activityTypes, opportunityTypes]);

    const activeScope = scopes.find((scope) => scope.key === selectedScope) ?? scopes[0];

    const openCreate = () => {
        setEditing(null);
        setName("");
        setDescription("");
        setIsActive(true);
        setPermissions(defaultPermissions());
        setSelectedScope("lead");
        setDialogOpen(true);
    };

    const openEdit = (template: PermissionTemplate) => {
        setEditing(template);
        setName(template.name);
        setDescription(template.description ?? "");
        setIsActive(template.isActive);
        setPermissions(normalizePermissions(template.permissions));
        setSelectedScope("lead");
        setDialogOpen(true);
    };

    const setAction = (scope: string, action: ActionKey, checked: boolean) => {
        setPermissions((current) => ({
            ...current,
            actions: {
                ...(current.actions ?? {}),
                [scope]: {
                    ...((current.actions ?? {})[scope] ?? {}),
                    [action]: checked,
                },
            },
        }));
    };

    const setFieldAccess = (scope: string, field: string, access: FieldAccess) => {
        setPermissions((current) => ({
            ...current,
            fieldPermissions: {
                ...(current.fieldPermissions ?? {}),
                [scope]: {
                    ...((current.fieldPermissions ?? {})[scope] ?? {}),
                    [field]: access,
                },
            },
        }));
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("Template name is required");
            return;
        }
        const payload = { name: name.trim(), description, isActive, permissions };
        try {
            if (editing) {
                await apiFetch(`/permission-templates/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
                toast.success("Permission template updated");
            } else {
                await apiFetch("/permission-templates", { method: "POST", body: JSON.stringify(payload) });
                toast.success("Permission template created");
            }
            setDialogOpen(false);
            loadData();
        } catch (error: any) {
            toast.error(error.message || "Failed to save permission template");
        }
    };

    const handleDelete = async (template: PermissionTemplate) => {
        if (!confirm(`Delete permission template "${template.name}"?`)) return;
        try {
            await apiFetch(`/permission-templates/${template.id}`, { method: "DELETE" });
            toast.success("Permission template deleted");
            loadData();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete permission template");
        }
    };

    return (
        <div className="mx-auto max-w-[1600px] p-3 md:p-4">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-extrabold">Permission Templates</h1>
                    <p className="text-sm text-muted-foreground">
                        Configure action access, field visibility, and type-specific opportunity or activity permissions.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="size-4" />
                    Create Template
                </Button>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card">
                <div className="divide-y">
                    {templates.length === 0 && !loading ? (
                        <div className="p-10 text-center">
                            <ShieldCheck className="mx-auto mb-2 size-10 text-muted-foreground opacity-40" />
                            <p className="font-extrabold">No permission templates yet</p>
                            <p className="mb-4 text-sm text-muted-foreground">
                                Create a template to control module actions and field masking outside role setup.
                            </p>
                            <Button variant="outline" onClick={openCreate}>
                                <Plus className="size-4" />
                                Create First Template
                            </Button>
                        </div>
                    ) : templates.map((template) => {
                        const actionCount = Object.values(template.permissions.actions ?? {}).reduce((count, actions) => count + Object.values(actions).filter((enabled) => enabled === true).length, 0);
                        const fieldCount = Object.values(template.permissions.fieldPermissions ?? {}).reduce((count, fields) => count + Object.values(fields).filter((value) => value !== "editable").length, 0);
                        return (
                            <div key={template.id} className="flex items-center justify-between gap-3 p-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-extrabold">{template.name}</p>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                template.isActive && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                            )}
                                        >
                                            {template.isActive ? "Active" : "Inactive"}
                                        </Badge>
                                    </div>
                                    {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Badge variant="outline">{actionCount} actions</Badge>
                                    <Badge variant="outline">{fieldCount} field rules</Badge>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(template)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Edit</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                onClick={() => handleDelete(template)}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Delete</TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        );
                    })}
                    {loading && <div className="p-6 text-sm text-muted-foreground">Loading templates...</div>}
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit Permission Template" : "Create Permission Template"}</DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end">
                            <div className="flex-1 space-y-1.5">
                                <Label htmlFor="pt-name">Template Name</Label>
                                <Input id="pt-name" value={name} onChange={(e) => setName(e.target.value)} />
                            </div>
                            <label className="flex min-w-[130px] items-center gap-2 pb-2 text-sm font-medium">
                                <Switch checked={isActive} onCheckedChange={setIsActive} />
                                Active
                            </label>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pt-description">Description</Label>
                            <Textarea
                                id="pt-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="grid overflow-hidden rounded-lg border md:min-h-[520px] md:grid-cols-[280px_1fr]">
                            <div className="border-b bg-muted/40 md:border-b-0 md:border-r">
                                <p className="px-3 pt-3 pb-1 text-xs font-extrabold uppercase text-muted-foreground">
                                    Modules & Types
                                </p>
                                <ul className="max-h-[520px] overflow-auto p-1">
                                    {scopes.map((scope) => (
                                        <li key={scope.key}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedScope(scope.key)}
                                                className={cn(
                                                    "flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                    selectedScope === scope.key ? "bg-primary/10 text-primary" : "hover:bg-accent"
                                                )}
                                            >
                                                <span className="text-sm font-extrabold">{scope.label}</span>
                                                <span className="text-xs text-muted-foreground">{scope.subtitle}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {activeScope && (
                                <div className="min-w-0 p-4">
                                    <div className="mb-3">
                                        <p className="font-black">{activeScope.label}</p>
                                        <p className="text-sm text-muted-foreground">{activeScope.subtitle}</p>
                                    </div>

                                    <p className="mb-2 text-sm font-extrabold">Actions</p>
                                    <div className="mb-4 flex flex-wrap gap-3">
                                        {ACTIONS.map((action) => (
                                            <label key={action.key} className="flex items-center gap-2 text-sm">
                                                <Switch
                                                    size="sm"
                                                    checked={Boolean(permissions.actions?.[activeScope.key]?.[action.key])}
                                                    onCheckedChange={(checked) => setAction(activeScope.key, action.key, checked)}
                                                />
                                                {action.label}
                                            </label>
                                        ))}
                                    </div>

                                    <div className="mb-4 h-px bg-border" />
                                    <p className="mb-2 text-sm font-extrabold">Fields</p>
                                    <div className="flex flex-col gap-2">
                                        {activeScope.fields.map((field) => {
                                            const value = permissions.fieldPermissions?.[activeScope.key]?.[field.key] ?? "editable";
                                            return (
                                                <div
                                                    key={field.key}
                                                    className="flex flex-col justify-between gap-2 rounded-md border p-2 sm:flex-row sm:items-center"
                                                >
                                                    <div>
                                                        <p className="text-sm font-extrabold">{field.label}</p>
                                                        <p className="text-xs text-muted-foreground">{field.key} · {field.type}</p>
                                                    </div>
                                                    <div className="inline-flex self-stretch overflow-hidden rounded-md border sm:self-center">
                                                        {(["editable", "readonly", "hidden"] as FieldAccess[]).map((access) => (
                                                            <button
                                                                key={access}
                                                                type="button"
                                                                onClick={() => setFieldAccess(activeScope.key, field.key, access)}
                                                                className={cn(
                                                                    "px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                                    value === access
                                                                        ? "bg-primary text-primary-foreground"
                                                                        : "bg-transparent hover:bg-accent"
                                                                )}
                                                            >
                                                                {accessLabel(access)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave}>Save Template</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

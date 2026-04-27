"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Box,
    Button,
    Card,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Security as SecurityIcon,
} from "@mui/icons-material";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

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
        <Box sx={{ p: { xs: 1.5, md: 2 }, maxWidth: 1600, mx: "auto" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>Permission Templates</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Configure action access, field visibility, and type-specific opportunity or activity permissions.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 28, px: 2.5 }}>
                    Create Template
                </Button>
            </Stack>

            <Card sx={{ overflow: "hidden" }}>
                <Stack divider={<Divider />}>
                    {templates.length === 0 && !loading ? (
                        <Box sx={{ p: 5, textAlign: "center" }}>
                            <SecurityIcon color="disabled" sx={{ fontSize: 42, mb: 1 }} />
                            <Typography sx={{ fontWeight: 800 }}>No permission templates yet</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Create a template to control module actions and field masking outside role setup.
                            </Typography>
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>Create First Template</Button>
                        </Box>
                    ) : templates.map((template) => {
                        const actionCount = Object.values(template.permissions.actions ?? {}).reduce((count, actions) => count + Object.values(actions).filter((enabled) => enabled === true).length, 0);
                        const fieldCount = Object.values(template.permissions.fieldPermissions ?? {}).reduce((count, fields) => count + Object.values(fields).filter((value) => value !== "editable").length, 0);
                        return (
                            <Stack key={template.id} direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5 }}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography sx={{ fontWeight: 800 }}>{template.name}</Typography>
                                        <Chip size="small" label={template.isActive ? "Active" : "Inactive"} color={template.isActive ? "success" : "default"} variant="outlined" />
                                    </Stack>
                                    {template.description && <Typography variant="body2" color="text.secondary">{template.description}</Typography>}
                                </Box>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Chip size="small" label={`${actionCount} actions`} />
                                    <Chip size="small" label={`${fieldCount} field rules`} />
                                    <Tooltip title="Edit">
                                        <IconButton size="small" onClick={() => openEdit(template)}><EditIcon fontSize="small" /></IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                        <IconButton size="small" color="error" onClick={() => handleDelete(template)}><DeleteIcon fontSize="small" /></IconButton>
                                    </Tooltip>
                                </Stack>
                            </Stack>
                        );
                    })}
                    {loading && <Box sx={{ p: 3 }}><Typography color="text.secondary">Loading templates...</Typography></Box>}
                </Stack>
            </Card>

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
                <DialogTitle>{editing ? "Edit Permission Template" : "Create Permission Template"}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                            <TextField size="small" label="Template Name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                            <FormControlLabel
                                control={<Switch checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />}
                                label="Active"
                                sx={{ minWidth: 130 }}
                            />
                        </Stack>
                        <TextField size="small" label="Description" value={description} onChange={(event) => setDescription(event.target.value)} multiline rows={2} />

                        <Paper variant="outlined" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, minHeight: 520, overflow: "hidden" }}>
                            <Box sx={{ borderRight: { md: "1px solid" }, borderColor: "divider", bgcolor: "action.hover" }}>
                                <Typography variant="caption" sx={{ display: "block", px: 1.5, pt: 1.5, pb: 0.5, fontWeight: 800, color: "text.secondary", textTransform: "uppercase" }}>
                                    Modules & Types
                                </Typography>
                                <List dense disablePadding sx={{ maxHeight: 520, overflow: "auto" }}>
                                    {scopes.map((scope) => (
                                        <ListItemButton key={scope.key} selected={selectedScope === scope.key} onClick={() => setSelectedScope(scope.key)}>
                                            <ListItemText
                                                primary={<Typography variant="body2" sx={{ fontWeight: 800 }}>{scope.label}</Typography>}
                                                secondary={scope.subtitle}
                                            />
                                        </ListItemButton>
                                    ))}
                                </List>
                            </Box>

                            {activeScope && (
                                <Box sx={{ p: 2, minWidth: 0 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                                        <Box>
                                            <Typography sx={{ fontWeight: 900 }}>{activeScope.label}</Typography>
                                            <Typography variant="body2" color="text.secondary">{activeScope.subtitle}</Typography>
                                        </Box>
                                    </Stack>

                                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Actions</Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                                        {ACTIONS.map((action) => (
                                            <FormControlLabel
                                                key={action.key}
                                                control={
                                                    <Switch
                                                        size="small"
                                                        checked={Boolean(permissions.actions?.[activeScope.key]?.[action.key])}
                                                        onChange={(event) => setAction(activeScope.key, action.key, event.target.checked)}
                                                    />
                                                }
                                                label={<Typography variant="body2">{action.label}</Typography>}
                                            />
                                        ))}
                                    </Stack>

                                    <Divider sx={{ mb: 2 }} />
                                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Fields</Typography>
                                    <Stack spacing={1}>
                                        {activeScope.fields.map((field) => {
                                            const value = permissions.fieldPermissions?.[activeScope.key]?.[field.key] ?? "editable";
                                            return (
                                                <Stack key={field.key} direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
                                                    <Box>
                                                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{field.label}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{field.key} · {field.type}</Typography>
                                                    </Box>
                                                    <ToggleButtonGroup
                                                        exclusive
                                                        size="small"
                                                        value={value}
                                                        onChange={(_, next) => next && setFieldAccess(activeScope.key, field.key, next)}
                                                        sx={{ alignSelf: { xs: "stretch", sm: "center" }, mt: { xs: 1, sm: 0 } }}
                                                    >
                                                        {(["editable", "readonly", "hidden"] as FieldAccess[]).map((access) => (
                                                            <ToggleButton key={access} value={access} sx={{ px: 1.25, textTransform: "none" }}>
                                                                {accessLabel(access)}
                                                            </ToggleButton>
                                                        ))}
                                                    </ToggleButtonGroup>
                                                </Stack>
                                            );
                                        })}
                                    </Stack>
                                </Box>
                            )}
                        </Paper>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave}>Save Template</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

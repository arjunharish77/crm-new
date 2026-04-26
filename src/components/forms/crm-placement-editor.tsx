"use client";

import { useEffect, useState } from "react";
import {
    Box,
    Button,
    Chip,
    Divider,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    Close as CloseIcon,
    Save as SaveIcon,
} from "@mui/icons-material";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

const CRM_PLACEMENTS = [
    { value: "LEAD_DETAIL", label: "Lead detail", helper: "Visible on an existing lead record." },
    { value: "OPPORTUNITY_DETAIL", label: "Opportunity detail", helper: "Visible on an existing opportunity record." },
    { value: "ACTIVITY_DETAIL", label: "Activity detail", helper: "Visible on an existing activity record." },
    { value: "LEAD_CREATE", label: "Lead create", helper: "Visible while creating a lead." },
    { value: "OPPORTUNITY_CREATE", label: "Opportunity create", helper: "Visible while creating an opportunity." },
];

const OPERATORS = [
    { value: "equals", label: "Is" },
    { value: "not_equals", label: "Is Not" },
    { value: "contains", label: "Contains" },
    { value: "contains_data", label: "Has Data" },
    { value: "not_contains_data", label: "No Data" },
];

const RECORD_FIELDS = [
    { key: "lead.name", label: "Lead Name", type: "text" },
    { key: "lead.email", label: "Lead Email", type: "text" },
    { key: "lead.phone", label: "Lead Phone", type: "text" },
    { key: "lead.company", label: "Company", type: "text" },
    { key: "lead.source", label: "Lead Source", type: "text" },
    {
        key: "lead.status",
        label: "Lead Status",
        type: "select",
        options: [
            { value: "NEW", label: "New" },
            { value: "QUALIFIED", label: "Qualified" },
            { value: "CONTACTED", label: "Contacted" },
            { value: "LOST", label: "Lost" },
            { value: "CONVERTED", label: "Converted" },
        ],
    },
    { key: "lead.score", label: "Lead Score", type: "number" },
    { key: "opportunity.title", label: "Opportunity Title", type: "text" },
    { key: "opportunity.amount", label: "Opportunity Amount", type: "number" },
    {
        key: "opportunity.priority",
        label: "Opportunity Priority",
        type: "select",
        options: [
            { value: "LOW", label: "Low" },
            { value: "MEDIUM", label: "Medium" },
            { value: "HIGH", label: "High" },
            { value: "URGENT", label: "Urgent" },
        ],
    },
    { key: "opportunity.stageId", label: "Opportunity Stage", type: "text" },
    { key: "opportunity.opportunityTypeId", label: "Opportunity Type", type: "text" },
    { key: "activity.typeId", label: "Activity Type", type: "text" },
    {
        key: "activity.outcome",
        label: "Activity Outcome",
        type: "select",
        options: [
            { value: "SUCCESS", label: "Success" },
            { value: "NO_ANSWER", label: "No Answer" },
            { value: "FAILED", label: "Failed" },
            { value: "FOLLOW_UP", label: "Follow-up Required" },
        ],
    },
    { key: "activity.dueAt", label: "Activity Due Date", type: "date" },
];

const USER_FIELDS = [
    { key: "id", label: "User", type: "select", dynamicOptions: "users" },
    { key: "roleId", label: "Role", type: "select", dynamicOptions: "roles" },
    { key: "email", label: "Email", type: "text" },
    { key: "name", label: "Name", type: "text" },
    { key: "managerId", label: "Manager", type: "select", dynamicOptions: "users" },
    { key: "salesGroupId", label: "Sales Group", type: "select", dynamicOptions: "salesGroups" },
    { key: "skills.region", label: "Skill Region", type: "text" },
    { key: "skills.language", label: "Skill Language", type: "text" },
];

type PlacementRule = {
    id: string;
    placement: string;
    enabled: boolean;
    label: string;
    order: number;
    visibilityMode: string;
    visibleUserIds: string[];
    visibleRoleIds: string[];
    visibleSalesGroupIds: string[];
    visibleTeamIds: string[];
    conditionLogic: "AND" | "OR";
    conditions: Array<Record<string, any>>;
    userConditionLogic: "AND" | "OR";
    userConditions: Array<Record<string, any>>;
};

export function CrmPlacementEditor({ initialForm, onSaved }: { initialForm: any; onSaved?: (form: any) => void }) {
    const [config, setConfig] = useState<any>(initialForm.config ?? {});
    const [users, setUsers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [salesGroups, setSalesGroups] = useState<any[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setConfig(initialForm.config ?? {});
    }, [initialForm]);

    useEffect(() => {
        Promise.all([
            apiFetch("/users").catch(() => []),
            apiFetch("/roles").catch(() => []),
            apiFetch("/sales-groups").catch(() => []),
            apiFetch("/teams").catch(() => []),
            apiFetch("/opportunity-types").catch(() => []),
            apiFetch("/activity-types").catch(() => []),
        ]).then(([userList, roleList, groupList, teamList, opportunityTypeList, activityTypeList]) => {
            setUsers(Array.isArray(userList) ? userList : []);
            setRoles(Array.isArray(roleList) ? roleList : []);
            setSalesGroups(Array.isArray(groupList) ? groupList : []);
            setTeams(Array.isArray(teamList) ? teamList : []);
            setOpportunityTypes(Array.isArray(opportunityTypeList) ? opportunityTypeList : []);
            setActivityTypes(Array.isArray(activityTypeList) ? activityTypeList : []);
        });
    }, []);

    const rules = Array.isArray(config.placementRules) ? config.placementRules : [];
    const placements = Array.isArray(config.placements) ? config.placements : [];

    const ruleFor = (placement: string): PlacementRule => {
        const existing = rules.find((rule: any) => rule.placement === placement);
        return {
            id: existing?.id || `placement_${nanoid(6)}`,
            placement,
            enabled: existing?.enabled ?? placements.includes(placement),
            label: existing?.label || CRM_PLACEMENTS.find((item) => item.value === placement)?.label || "Open form",
            order: Number(existing?.order ?? rules.length),
            visibilityMode: existing?.visibilityMode || "INHERIT",
            visibleUserIds: Array.isArray(existing?.visibleUserIds) ? existing.visibleUserIds : [],
            visibleRoleIds: Array.isArray(existing?.visibleRoleIds) ? existing.visibleRoleIds : [],
            visibleSalesGroupIds: Array.isArray(existing?.visibleSalesGroupIds) ? existing.visibleSalesGroupIds : [],
            visibleTeamIds: Array.isArray(existing?.visibleTeamIds) ? existing.visibleTeamIds : [],
            conditionLogic: existing?.conditionLogic || "AND",
            conditions: Array.isArray(existing?.conditions) ? existing.conditions : [],
            userConditionLogic: existing?.userConditionLogic || "AND",
            userConditions: Array.isArray(existing?.userConditions) ? existing.userConditions : [],
        };
    };

    const updateRule = (placement: string, patch: Partial<PlacementRule>) => {
        const current = ruleFor(placement);
        const nextRule = { ...current, ...patch };
        const nextRules = rules.some((rule: any) => rule.placement === placement)
            ? rules.map((rule: any) => rule.placement === placement ? nextRule : rule)
            : [...rules, nextRule];
        const nextPlacements = nextRule.enabled
            ? [...new Set([...placements, placement])]
            : placements.filter((item: string) => item !== placement);
        setConfig({ ...config, placementRules: nextRules, placements: nextPlacements });
    };

    const updateCondition = (placement: string, key: "conditions" | "userConditions", index: number, patch: Record<string, any>) => {
        const rule = ruleFor(placement);
        const conditions = Array.isArray(rule[key]) ? [...rule[key]] : [];
        conditions[index] = { ...(conditions[index] ?? {}), ...patch };
        updateRule(placement, { [key]: conditions } as Partial<PlacementRule>);
    };

    const addCondition = (placement: string, key: "conditions" | "userConditions") => {
        const rule = ruleFor(placement);
        const conditions = Array.isArray(rule[key]) ? rule[key] : [];
        updateRule(placement, { [key]: [...conditions, { field: "", operator: "equals", value: "" }] } as Partial<PlacementRule>);
    };

    const removeCondition = (placement: string, key: "conditions" | "userConditions", index: number) => {
        const rule = ruleFor(placement);
        updateRule(placement, { [key]: rule[key].filter((_, itemIndex) => itemIndex !== index) } as Partial<PlacementRule>);
    };

    const save = async () => {
        setSaving(true);
        try {
            const form = await apiFetch(`/forms/${initialForm.id}`, {
                method: "PATCH",
                body: JSON.stringify({ config, isActive: initialForm.isActive }),
            });
            toast.success("CRM placement saved");
            onSaved?.(form);
        } catch (error) {
            console.error(error);
            toast.error("Failed to save CRM placement");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ p: { xs: 1.5, md: 2 } }}>
            <Stack spacing={2}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
                    <Box>
                        <Typography variant="h6" fontWeight={800}>CRM Placement</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Configure where this form appears, who can see it, and which record/user conditions must match.
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving} sx={{ borderRadius: "10px", alignSelf: { xs: "stretch", md: "center" } }}>
                        {saving ? "Saving..." : "Save Placement"}
                    </Button>
                </Stack>

                {CRM_PLACEMENTS.map((placement) => {
                    const rule = ruleFor(placement.value);
                    return (
                        <Paper key={placement.value} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                            <Stack spacing={1.5}>
                                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1}>
                                    <Box>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="subtitle1" fontWeight={800}>{placement.label}</Typography>
                                            <Chip size="small" label={rule.enabled ? "Enabled" : "Off"} color={rule.enabled ? "success" : "default"} />
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary">{placement.helper}</Typography>
                                    </Box>
                                    <FormControlLabel
                                        control={<Switch checked={rule.enabled} onChange={(event) => updateRule(placement.value, { enabled: event.target.checked })} />}
                                        label="Enable"
                                    />
                                </Stack>

                                {rule.enabled && (
                                    <>
                                        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                                            <TextField label="Button Label" size="small" fullWidth value={rule.label} onChange={(event) => updateRule(placement.value, { label: event.target.value })} />
                                            <TextField label="Order" size="small" type="number" sx={{ width: { xs: "100%", md: 120 } }} value={rule.order} onChange={(event) => updateRule(placement.value, { order: Number(event.target.value || 0) })} />
                                        </Stack>

                                        <FormControl fullWidth size="small">
                                            <InputLabel>Visible Here To</InputLabel>
                                            <Select value={rule.visibilityMode} label="Visible Here To" onChange={(event) => updateRule(placement.value, { visibilityMode: event.target.value })}>
                                                <MenuItem value="INHERIT">Use form visibility</MenuItem>
                                                <MenuItem value="ALL">All users</MenuItem>
                                                <MenuItem value="ROLES">Selected roles</MenuItem>
                                                <MenuItem value="USERS">Selected users</MenuItem>
                                                <MenuItem value="SALES_GROUPS">Selected sales groups</MenuItem>
                                                <MenuItem value="TEAMS">Selected teams</MenuItem>
                                            </Select>
                                        </FormControl>

                                        {rule.visibilityMode === "ROLES" && (
                                            <MultiSelect label="Roles" value={rule.visibleRoleIds} items={roles} onChange={(value) => updateRule(placement.value, { visibleRoleIds: value })} />
                                        )}
                                        {rule.visibilityMode === "USERS" && (
                                            <MultiSelect label="Users" value={rule.visibleUserIds} items={users.map((user) => ({ ...user, name: user.name || user.email }))} onChange={(value) => updateRule(placement.value, { visibleUserIds: value })} />
                                        )}
                                        {rule.visibilityMode === "SALES_GROUPS" && (
                                            <MultiSelect label="Sales Groups" value={rule.visibleSalesGroupIds} items={salesGroups} onChange={(value) => updateRule(placement.value, { visibleSalesGroupIds: value })} />
                                        )}
                                        {rule.visibilityMode === "TEAMS" && (
                                            <MultiSelect label="Teams" value={rule.visibleTeamIds} items={teams} onChange={(value) => updateRule(placement.value, { visibleTeamIds: value })} />
                                        )}

                                        <Divider />
                                        <ConditionGroup
                                            title="Record Conditions"
                                            description="Match against lead, opportunity, or activity fields in the current CRM page context."
                                            logic={rule.conditionLogic}
                                            conditions={rule.conditions}
                                            fields={recordFieldsForPlacement(placement.value, opportunityTypes, activityTypes)}
                                            fieldPlaceholder="status or lead.source"
                                            onLogicChange={(value) => updateRule(placement.value, { conditionLogic: value as "AND" | "OR" })}
                                            onAdd={() => addCondition(placement.value, "conditions")}
                                            onUpdate={(index, patch) => updateCondition(placement.value, "conditions", index, patch)}
                                            onRemove={(index) => removeCondition(placement.value, "conditions", index)}
                                        />

                                        <ConditionGroup
                                            title="User Conditions"
                                            description="Match against current user fields like roleId, email, managerId, or skills.region."
                                            logic={rule.userConditionLogic}
                                            conditions={rule.userConditions}
                                            fields={userConditionFields(users, roles, salesGroups)}
                                            fieldPlaceholder="roleId, email, skills.region"
                                            onLogicChange={(value) => updateRule(placement.value, { userConditionLogic: value as "AND" | "OR" })}
                                            onAdd={() => addCondition(placement.value, "userConditions")}
                                            onUpdate={(index, patch) => updateCondition(placement.value, "userConditions", index, patch)}
                                            onRemove={(index) => removeCondition(placement.value, "userConditions", index)}
                                        />
                                    </>
                                )}
                            </Stack>
                        </Paper>
                    );
                })}
            </Stack>
        </Box>
    );
}

function recordFieldsForPlacement(placement: string, opportunityTypes: any[], activityTypes: any[]) {
    const dynamicRecordFields = RECORD_FIELDS.map((field) => {
        if (field.key === "opportunity.opportunityTypeId") {
            return { ...field, type: "select", options: opportunityTypes.map((type) => ({ value: type.id, label: type.name })) };
        }
        if (field.key === "opportunity.stageId") {
            return {
                ...field,
                type: "select",
                options: opportunityTypes.flatMap((type) => (type.stages ?? []).map((stage: any) => ({
                    value: stage.id,
                    label: `${type.name} - ${stage.name || stage.label}`,
                }))),
            };
        }
        if (field.key === "activity.typeId") {
            return { ...field, type: "select", options: activityTypes.map((type) => ({ value: type.id, label: type.name })) };
        }
        return field;
    });

    if (placement.startsWith("LEAD")) return dynamicRecordFields.filter((field) => field.key.startsWith("lead."));
    if (placement.startsWith("OPPORTUNITY")) return dynamicRecordFields.filter((field) => field.key.startsWith("lead.") || field.key.startsWith("opportunity."));
    if (placement.startsWith("ACTIVITY")) return dynamicRecordFields;
    return dynamicRecordFields;
}

function userConditionFields(users: any[], roles: any[], salesGroups: any[]) {
    return USER_FIELDS.map((field) => {
        if (field.dynamicOptions === "users") {
            return { ...field, options: users.map((user) => ({ value: user.id, label: user.name || user.email })) };
        }
        if (field.dynamicOptions === "roles") {
            return { ...field, options: roles.map((role) => ({ value: role.id, label: role.name })) };
        }
        if (field.dynamicOptions === "salesGroups") {
            return { ...field, options: salesGroups.map((group) => ({ value: group.id, label: group.name })) };
        }
        return field;
    });
}

function MultiSelect({ label, value, items, onChange }: { label: string; value: string[]; items: any[]; onChange: (value: string[]) => void }) {
    return (
        <FormControl fullWidth size="small">
            <InputLabel>{label}</InputLabel>
            <Select multiple value={value || []} label={label} onChange={(event) => onChange(event.target.value as string[])}>
                {items.map((item) => (
                    <MenuItem key={item.id} value={item.id}>{item.name || item.email}</MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

function ConditionGroup({
    title,
    description,
    logic,
    conditions,
    fields,
    fieldPlaceholder,
    onLogicChange,
    onAdd,
    onUpdate,
    onRemove,
}: {
    title: string;
    description: string;
    logic: "AND" | "OR";
    conditions: Array<Record<string, any>>;
    fields: Array<Record<string, any>>;
    fieldPlaceholder: string;
    onLogicChange: (value: string) => void;
    onAdd: () => void;
    onUpdate: (index: number, patch: Record<string, any>) => void;
    onRemove: (index: number) => void;
}) {
    return (
        <Stack spacing={1}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between">
                <Box>
                    <Typography variant="subtitle2" fontWeight={800}>{title}</Typography>
                    <Typography variant="caption" color="text.secondary">{description}</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                        <InputLabel>Logic</InputLabel>
                        <Select value={logic || "AND"} label="Logic" onChange={(event) => onLogicChange(String(event.target.value))}>
                            <MenuItem value="AND">All</MenuItem>
                            <MenuItem value="OR">Any</MenuItem>
                        </Select>
                    </FormControl>
                    <Button size="small" startIcon={<AddIcon />} onClick={onAdd}>Condition</Button>
                </Stack>
            </Stack>

            {conditions.length === 0 ? (
                <Typography variant="caption" color="text.secondary">No conditions. This part always passes.</Typography>
            ) : conditions.map((condition, index) => {
                const selectedField = fields.find((field) => field.key === condition.field);
                const valueOptions = Array.isArray(selectedField?.options) ? selectedField.options : [];
                const valueDisabled = ["contains_data", "not_contains_data"].includes(condition.operator || "");
                return (
                <Stack key={index} direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ xs: "stretch", md: "center" }}>
                    <FormControl size="small" sx={{ flex: 1 }}>
                        <InputLabel>Field</InputLabel>
                        <Select
                            value={condition.field || ""}
                            label="Field"
                            onChange={(event) => onUpdate(index, { field: event.target.value, value: "" })}
                            displayEmpty
                        >
                            {fields.map((field) => (
                                <MenuItem key={field.key} value={field.key}>{field.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Operator</InputLabel>
                        <Select value={condition.operator || "equals"} label="Operator" onChange={(event) => onUpdate(index, { operator: event.target.value })}>
                            {OPERATORS.map((operator) => (
                                <MenuItem key={operator.value} value={operator.value}>{operator.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {valueOptions.length > 0 ? (
                        <FormControl size="small" sx={{ flex: 1 }}>
                            <InputLabel>Value</InputLabel>
                            <Select value={condition.value || ""} label="Value" onChange={(event) => onUpdate(index, { value: event.target.value })} disabled={valueDisabled}>
                                {valueOptions.map((option: any) => (
                                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    ) : (
                        <TextField
                            label="Value"
                            size="small"
                            value={condition.value || ""}
                            placeholder={fieldPlaceholder}
                            disabled={valueDisabled}
                            type={selectedField?.type === "number" ? "number" : selectedField?.type === "date" ? "date" : "text"}
                            onChange={(event) => onUpdate(index, { value: event.target.value })}
                            sx={{ flex: 1 }}
                            InputLabelProps={selectedField?.type === "date" ? { shrink: true } : undefined}
                        />
                    )}
                    <IconButton size="small" onClick={() => onRemove(index)}><CloseIcon fontSize="small" /></IconButton>
                </Stack>
                );
            })}
        </Stack>
    );
}

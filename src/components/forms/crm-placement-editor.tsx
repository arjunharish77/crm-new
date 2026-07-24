"use client";

import { useEffect, useState } from "react";
import { Plus as AddIcon, ChevronDown, Save as SaveIcon, X as CloseIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        <div className="p-3 md:p-4">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row">
                    <div>
                        <h2 className="text-lg font-extrabold">CRM Placement</h2>
                        <p className="text-sm text-muted-foreground">
                            Configure where this form appears, who can see it, and which record/user conditions must match.
                        </p>
                    </div>
                    <Button onClick={save} disabled={saving} className="self-stretch md:self-center">
                        <SaveIcon className="size-4" />
                        {saving ? "Saving..." : "Save Placement"}
                    </Button>
                </div>

                {CRM_PLACEMENTS.map((placement) => {
                    const rule = ruleFor(placement.value);
                    return (
                        <Card key={placement.value} className="gap-3 rounded-xl p-3">
                            <div className="flex flex-col justify-between gap-2 md:flex-row">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-extrabold">{placement.label}</span>
                                        <Badge variant={rule.enabled ? "default" : "outline"}>{rule.enabled ? "Enabled" : "Off"}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{placement.helper}</p>
                                </div>
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <Switch
                                        checked={rule.enabled}
                                        onCheckedChange={(checked) => updateRule(placement.value, { enabled: checked })}
                                    />
                                    Enable
                                </label>
                            </div>

                            {rule.enabled && (
                                <>
                                    <div className="flex flex-col gap-2 md:flex-row">
                                        <div className="flex-1 space-y-1.5">
                                            <Label>Button Label</Label>
                                            <Input value={rule.label} onChange={(event) => updateRule(placement.value, { label: event.target.value })} />
                                        </div>
                                        <div className="space-y-1.5 md:w-[120px]">
                                            <Label>Order</Label>
                                            <Input type="number" value={rule.order} onChange={(event) => updateRule(placement.value, { order: Number(event.target.value || 0) })} />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label>Visible Here To</Label>
                                        <Select value={rule.visibilityMode} onValueChange={(value) => updateRule(placement.value, { visibilityMode: value })}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="INHERIT">Use form visibility</SelectItem>
                                                <SelectItem value="ALL">All users</SelectItem>
                                                <SelectItem value="ROLES">Selected roles</SelectItem>
                                                <SelectItem value="USERS">Selected users</SelectItem>
                                                <SelectItem value="SALES_GROUPS">Selected sales groups</SelectItem>
                                                <SelectItem value="TEAMS">Selected teams</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

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

                                    <div className="h-px w-full bg-border" />
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
                        </Card>
                    );
                })}
            </div>
        </div>
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
    const selected = value || [];
    const toggle = (id: string) => {
        onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
    };
    const summary = selected.length === 0
        ? `Select ${label.toLowerCase()}`
        : items
            .filter((item) => selected.includes(item.id))
            .map((item) => item.name || item.email)
            .join(", ");

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                        <span className="truncate text-left">{summary}</span>
                        <ChevronDown className="size-4 shrink-0 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
                    {items.length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">No options available</p>
                    ) : (
                        items.map((item) => (
                            <DropdownMenuCheckboxItem
                                key={item.id}
                                checked={selected.includes(item.id)}
                                onCheckedChange={() => toggle(item.id)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {item.name || item.email}
                            </DropdownMenuCheckboxItem>
                        ))
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
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
        <div className="space-y-2">
            <div className="flex flex-col justify-between gap-2 md:flex-row">
                <div>
                    <p className="text-sm font-extrabold">{title}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={logic || "AND"} onValueChange={(value) => onLogicChange(value)}>
                        <SelectTrigger size="sm" className="w-[110px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="AND">All</SelectItem>
                            <SelectItem value="OR">Any</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={onAdd}>
                        <AddIcon className="size-4" />
                        Condition
                    </Button>
                </div>
            </div>

            {conditions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No conditions. This part always passes.</p>
            ) : conditions.map((condition, index) => {
                const selectedField = fields.find((field) => field.key === condition.field);
                const valueOptions = Array.isArray(selectedField?.options) ? selectedField.options : [];
                const valueDisabled = ["contains_data", "not_contains_data"].includes(condition.operator || "");
                return (
                    <div key={index} className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
                        <Select
                            value={condition.field || undefined}
                            onValueChange={(value) => onUpdate(index, { field: value, value: "" })}
                        >
                            <SelectTrigger size="sm" className="flex-1">
                                <SelectValue placeholder="Field" />
                            </SelectTrigger>
                            <SelectContent>
                                {fields.map((field) => (
                                    <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={condition.operator || "equals"} onValueChange={(value) => onUpdate(index, { operator: value })}>
                            <SelectTrigger size="sm" className="w-[150px] shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {OPERATORS.map((operator) => (
                                    <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {valueOptions.length > 0 ? (
                            <Select
                                value={condition.value || undefined}
                                onValueChange={(value) => onUpdate(index, { value })}
                                disabled={valueDisabled}
                            >
                                <SelectTrigger size="sm" className="flex-1">
                                    <SelectValue placeholder="Value" />
                                </SelectTrigger>
                                <SelectContent>
                                    {valueOptions.map((option: any) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                placeholder={fieldPlaceholder}
                                value={condition.value || ""}
                                disabled={valueDisabled}
                                type={selectedField?.type === "number" ? "number" : selectedField?.type === "date" ? "date" : "text"}
                                onChange={(event) => onUpdate(index, { value: event.target.value })}
                                className="h-8 flex-1"
                            />
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => onRemove(index)}>
                            <CloseIcon className="size-3.5" />
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}

"use client";

import { useState, useEffect } from "react";
import { X, Users, UsersRound, Trash2, Plus, PlayCircle, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ConditionBuilder, type CrmCondition, type ConditionFieldOption } from "@/components/common/condition-builder";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface RuleBuilderProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    rule?: any;
    onSave: (rule: any) => Promise<void>;
}

const NO_FALLBACK = "__none__";
const NO_FOLDER = "__none__";

const LEAD_BASE_FIELDS: ConditionFieldOption[] = [
    { key: "source", label: "Source", type: "select", options: ["Partner", "Google Ads", "Website", "Referral", "Direct", "Portal", "FORM"] },
    { key: "status", label: "Status", type: "select", options: ["NEW", "QUALIFIED", "LOST", "WON"] },
    { key: "company", label: "Company", type: "text" },
    { key: "score", label: "Score", type: "number" },
];

const OPPORTUNITY_BASE_FIELDS: ConditionFieldOption[] = [
    { key: "amount", label: "Amount", type: "number" },
    { key: "priority", label: "Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH"] },
];

export function RuleBuilder({ open, setOpen, rule, onSave }: RuleBuilderProps) {
    const [form, setForm] = useState<any>({
        name: "",
        description: "",
        entityType: "LEAD",
        type: "ROUND_ROBIN",
        priority: 100,
        isActive: true,
        isDefault: false,
        ruleSetId: undefined,
    });
    const [config, setConfig] = useState<any>({
        userPool: [],
        salesGroupId: undefined,
        fallbackUserId: undefined,
        conditions: [] as CrmCondition[],
        maxAssignmentsPerUser: undefined,
        maxAssignmentsPerWindow: undefined,
        windowPeriod: "DAY",
        activeFrom: undefined,
        activeUntil: undefined,
        requiredSkills: [],
        userWeights: {},
        territoryField: undefined,
    });
    const [newSkillTag, setNewSkillTag] = useState("");
    const [targetType, setTargetType] = useState<"USER_POOL" | "SALES_GROUP">("USER_POOL");

    const [users, setUsers] = useState<any[]>([]);
    const [salesGroups, setSalesGroups] = useState<any[]>([]);
    const [ruleSets, setRuleSets] = useState<any[]>([]);
    const [newFolderName, setNewFolderName] = useState("");
    const [customFields, setCustomFields] = useState<ConditionFieldOption[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);

    useEffect(() => {
        if (open) {
            apiFetch("/users").then(setUsers).catch(() => toast.error("Failed to load users"));
            apiFetch("/sales-groups").then(setSalesGroups).catch(() => toast.error("Failed to load sales groups"));
            apiFetch("/opportunity-types").then(setOpportunityTypes).catch(() => setOpportunityTypes([]));
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        apiFetch(`/assignment/rule-sets?entityType=${form.entityType}`).then(setRuleSets).catch(() => setRuleSets([]));
        apiFetch(`/custom-fields?objectType=${form.entityType}`)
            .then((fields: any[]) => setCustomFields(fields.map((field) => ({
                key: field.key,
                label: field.label,
                type: field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : field.fieldType === "CHECKBOX" ? "boolean" : field.options?.length ? "select" : "text",
                options: field.options,
            }))))
            .catch(() => setCustomFields([]));
    }, [open, form.entityType]);

    const baseFields = form.entityType === "OPPORTUNITY" ? OPPORTUNITY_BASE_FIELDS : LEAD_BASE_FIELDS;
    const opportunityFields: ConditionFieldOption[] = form.entityType === "OPPORTUNITY"
        ? [
            { key: "stageId", label: "Stage", type: "select", options: opportunityTypes.flatMap((type) => (type.stages ?? []).map((stage: any) => ({ value: stage.id, label: `${type.name}: ${stage.name}` }))) },
            { key: "opportunityTypeId", label: "Opportunity Type", type: "select", options: opportunityTypes.map((type) => ({ value: type.id, label: type.name })) },
        ]
        : [];
    const conditionFields: ConditionFieldOption[] = [...baseFields, ...opportunityFields, ...customFields];

    // Initialize from existing rule
    useEffect(() => {
        if (rule) {
            setForm({
                name: rule.name,
                description: rule.description || "",
                entityType: rule.entityType,
                type: rule.type,
                priority: rule.priority ?? 100,
                isActive: rule.isActive,
                isDefault: Boolean(rule.isDefault),
                ruleSetId: rule.ruleSetId ?? undefined,
            });

            const ruleConfig = rule.config || {};
            if (ruleConfig.salesGroupId) {
                setTargetType("SALES_GROUP");
                setConfig({ ...ruleConfig, userPool: [] }); // Clear pool if group used
            } else {
                setTargetType("USER_POOL");
                setConfig({ ...ruleConfig, salesGroupId: undefined });
            }
        } else {
            // Reset for new rule
            setForm({
                name: "",
                description: "",
                entityType: "LEAD",
                type: "ROUND_ROBIN",
                priority: 100,
                isActive: true,
                isDefault: false,
                ruleSetId: undefined,
            });
            setConfig({
                userPool: [],
                salesGroupId: undefined,
                fallbackUserId: undefined,
                conditions: [],
                maxAssignmentsPerUser: undefined,
                maxAssignmentsPerWindow: undefined,
                windowPeriod: "DAY",
                activeFrom: undefined,
                activeUntil: undefined,
                requiredSkills: [],
                userWeights: {},
                territoryField: undefined,
            });
            setTargetType("USER_POOL");
        }
    }, [rule, open]);

    const handleSave = async () => {
        const payload = { ...form, config: { ...config } };

        // Clean up config based on type
        if (targetType === "SALES_GROUP") {
            delete payload.config.userPool;
        } else {
            delete payload.config.salesGroupId;
        }

        try {
            await onSave(payload);
            setOpen(false);
        } catch (error) {
            // Handled by parent
        }
    };

    const handleClose = () => setOpen(false);

    const createFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const created = await apiFetch<any>("/assignment/rule-sets", {
                method: "POST",
                body: JSON.stringify({ name: newFolderName.trim(), entityType: form.entityType }),
            });
            setRuleSets((prev) => [...prev, created]);
            setForm({ ...form, ruleSetId: created.id });
            setNewFolderName("");
            toast.success("Folder created");
        } catch (error: any) {
            toast.error(error?.message || "Failed to create folder");
        }
    };

    // In-builder simulation: run the exact production matching logic against a real sample
    // record using THIS unsaved form/config, without saving anything or touching any real
    // rule's round-robin cursor / weighted fairness credit. See distribution-engine.ts's
    // simulateDistribution(draftRule) for the read-only server side of this.
    const [simulateOpen, setSimulateOpen] = useState(false);
    const [sampleRecords, setSampleRecords] = useState<any[]>([]);
    const [selectedRecordId, setSelectedRecordId] = useState("");
    const [simulating, setSimulating] = useState(false);
    const [simulationResult, setSimulationResult] = useState<any>(null);

    const openSimulate = async () => {
        setSimulateOpen(true);
        setSimulationResult(null);
        if (sampleRecords.length === 0) {
            const endpoint = form.entityType === "OPPORTUNITY" ? "/opportunities?limit=50" : "/leads?limit=50";
            try {
                const data = await apiFetch<any>(endpoint);
                const records = Array.isArray(data) ? data : data?.items ?? data?.leads ?? data?.opportunities ?? [];
                setSampleRecords(records);
            } catch {
                toast.error("Failed to load sample records");
            }
        }
    };

    const buildDraftRule = () => {
        const targets: any[] = [];
        if (targetType === "USER_POOL") {
            for (const userId of config.userPool ?? []) {
                targets.push({ userId, isPoolMember: true, isFallback: userId === config.fallbackUserId, weight: config.userWeights?.[userId] ?? null });
            }
        }
        if (config.fallbackUserId && !targets.some((target) => target.userId === config.fallbackUserId)) {
            targets.push({ userId: config.fallbackUserId, isPoolMember: false, isFallback: true, weight: null });
        }

        return {
            entityType: form.entityType,
            strategy: form.type,
            targetGroupId: targetType === "SALES_GROUP" ? config.salesGroupId : null,
            territoryField: config.territoryField || null,
            targets,
            conditions: form.isDefault ? [] : (config.conditions ?? []).filter((condition: CrmCondition) => condition.field),
            quota: {
                maxAssignmentsPerUser: config.maxAssignmentsPerUser || null,
                maxAssignmentsPerWindow: config.maxAssignmentsPerWindow || null,
                windowPeriod: config.windowPeriod || null,
            },
            availability: {
                activeFrom: config.activeFrom || null,
                activeUntil: config.activeUntil || null,
                requiredSkills: config.requiredSkills ?? [],
            },
        };
    };

    const runSimulation = async () => {
        const record = sampleRecords.find((item) => item.id === selectedRecordId);
        if (!record) {
            toast.error("Select a sample record first");
            return;
        }
        setSimulating(true);
        setSimulationResult(null);
        try {
            const outcome = await apiFetch<any>("/assignment/simulate", {
                method: "POST",
                body: JSON.stringify({ entityType: form.entityType, record, draftRule: buildDraftRule() }),
            });
            setSimulationResult(outcome);
        } catch (error: any) {
            toast.error(error?.message || "Simulation failed");
        } finally {
            setSimulating(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
                side="right"
                showCloseButton={false}
                className="w-full gap-0 sm:max-w-[600px] md:max-w-[800px]"
            >
                <SheetHeader className="flex-row items-center justify-between gap-3 border-b p-4">
                    <div>
                        <SheetTitle className="text-base">
                            {rule ? "Edit Assignment Rule" : "Create Assignment Rule"}
                        </SheetTitle>
                        <SheetDescription>
                            Define how leads should be routed to your team.
                        </SheetDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClose}>
                        <X className="size-4" />
                    </Button>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="rule-name-input">Rule Name</Label>
                            <Input
                                id="rule-name-input"
                                placeholder="e.g. Inbound Leads - North America"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rule-description-input">Description</Label>
                            <Textarea
                                id="rule-description-input"
                                placeholder="When this rule should run and who should receive the record"
                                rows={2}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Folder</Label>
                                <Select
                                    value={form.ruleSetId ?? NO_FOLDER}
                                    onValueChange={(value) => setForm({ ...form, ruleSetId: value === NO_FOLDER ? undefined : value })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Ungrouped" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_FOLDER}><em>Ungrouped</em></SelectItem>
                                        {ruleSets.map((ruleSet) => (
                                            <SelectItem key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="New folder name"
                                        className="h-8 text-xs"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createFolder(); } }}
                                    />
                                    <Button type="button" size="sm" variant="outline" onClick={createFolder}>Add</Button>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Entity Type</Label>
                                <Select
                                    value={form.entityType}
                                    onValueChange={(value) => setForm({ ...form, entityType: value, ruleSetId: undefined })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="LEAD">Lead</SelectItem>
                                        <SelectItem value="OPPORTUNITY">Opportunity</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Assignment Strategy</Label>
                                <Select
                                    value={form.type}
                                    onValueChange={(value) => setForm({ ...form, type: value })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ROUND_ROBIN">Round Robin</SelectItem>
                                        <SelectItem value="LOAD_BASED">Load Based</SelectItem>
                                        <SelectItem value="SKILL_BASED">Skill Based</SelectItem>
                                        <SelectItem value="WEIGHTED">Weighted Round Robin</SelectItem>
                                        <SelectItem value="STICKY_TO_OWNER">Account/Owner Affinity</SelectItem>
                                        <SelectItem value="TERRITORY_BASED">Territory Based</SelectItem>
                                    </SelectContent>
                                </Select>
                                {form.type === "STICKY_TO_OWNER" && (
                                    <p className="text-xs text-muted-foreground">
                                        Routes to the same rep who already owns the related record — the parent Lead&apos;s owner for an Opportunity,
                                        or an existing Lead with the same email for a new Lead — when that owner is in the eligible pool below.
                                        Falls back to Round Robin among the eligible pool otherwise.
                                    </p>
                                )}
                                {form.type === "TERRITORY_BASED" && (
                                    <p className="text-xs text-muted-foreground">
                                        Ignores the Routing Target below — instead, every Sales Group whose territories/states/countries/zip codes
                                        list contains the field value you configure below supplies the eligible pool.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rule-priority-input">Priority</Label>
                                <Input
                                    id="rule-priority-input"
                                    type="number"
                                    value={form.priority}
                                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}
                                />
                                <p className="text-xs text-muted-foreground">Higher priority runs first</p>
                            </div>
                        </div>

                        {form.type === "TERRITORY_BASED" && (
                            <div className="rounded-lg border p-4">
                                <p className="mb-1 text-sm font-semibold">Territory Field</p>
                                <p className="mb-3 text-xs text-muted-foreground">
                                    The record field whose value is matched against each Sales Group&apos;s configured territories/states/countries/zip codes.
                                </p>
                                <Input
                                    placeholder="e.g. state, or a custom field key"
                                    value={config.territoryField ?? ""}
                                    onChange={(e) => setConfig({ ...config, territoryField: e.target.value || undefined })}
                                />
                            </div>
                        )}

                        <div className="flex items-start gap-2 rounded-lg border p-4">
                            <Switch checked={Boolean(form.isDefault)} onCheckedChange={(checked) => setForm({ ...form, isDefault: checked })} />
                            <div>
                                <Label>Default (catch-all) rule</Label>
                                <p className="text-xs text-muted-foreground">
                                    Always matches, regardless of Rule Criteria below. Only one default rule can exist per entity type -- marking this one default automatically un-defaults any other.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border p-4">
                            <p className="mb-1 text-sm font-semibold">Activation Window</p>
                            <p className="mb-3 text-xs text-muted-foreground">
                                Optional. Leave either blank for no restriction on that side -- outside this window the rule is skipped entirely, as if it didn&apos;t match.
                            </p>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="rule-active-from-input">Active from</Label>
                                    <Input
                                        id="rule-active-from-input"
                                        type="date"
                                        value={config.activeFrom ?? ""}
                                        onChange={(e) => setConfig({ ...config, activeFrom: e.target.value || undefined })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rule-active-until-input">Active until</Label>
                                    <Input
                                        id="rule-active-until-input"
                                        type="date"
                                        value={config.activeUntil ?? ""}
                                        onChange={(e) => setConfig({ ...config, activeUntil: e.target.value || undefined })}
                                    />
                                </div>
                            </div>
                        </div>

                        {form.type !== "TERRITORY_BASED" && (
                            <div className="rounded-lg border p-4">
                                <p className="mb-3 text-sm font-semibold">Routing Target</p>

                                <div className="mb-4 flex gap-2">
                                    <Button
                                        type="button"
                                        variant={targetType === "USER_POOL" ? "default" : "outline"}
                                        onClick={() => setTargetType("USER_POOL")}
                                    >
                                        <Users className="size-4" />
                                        Specific Users
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={targetType === "SALES_GROUP" ? "default" : "outline"}
                                        onClick={() => setTargetType("SALES_GROUP")}
                                    >
                                        <UsersRound className="size-4" />
                                        Sales Group
                                    </Button>
                                </div>

                                {targetType === "USER_POOL" ? (
                                    <div>
                                        <p className="mb-2 text-sm">Select Users</p>
                                        <div className="max-h-[240px] overflow-y-auto rounded-md border p-2">
                                            <div className="grid grid-cols-2 gap-1">
                                                {users.map((u) => (
                                                    <div key={u.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                                                        <label className="flex flex-1 items-center gap-2">
                                                            <Checkbox
                                                                checked={config.userPool?.includes(u.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const pool = config.userPool || [];
                                                                    if (checked) {
                                                                        setConfig({ ...config, userPool: [...pool, u.id] });
                                                                    } else {
                                                                        const weights = { ...(config.userWeights || {}) };
                                                                        delete weights[u.id];
                                                                        setConfig({ ...config, userPool: pool.filter((id: string) => id !== u.id), userWeights: weights });
                                                                    }
                                                                }}
                                                            />
                                                            {u.name}
                                                        </label>
                                                        {form.type === "WEIGHTED" && config.userPool?.includes(u.id) && (
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                className="h-7 w-16 shrink-0"
                                                                placeholder="1"
                                                                value={config.userWeights?.[u.id] ?? ""}
                                                                onChange={(e) => {
                                                                    const weights = { ...(config.userWeights || {}) };
                                                                    const parsed = Number(e.target.value);
                                                                    if (e.target.value && parsed > 0) weights[u.id] = parsed;
                                                                    else delete weights[u.id];
                                                                    setConfig({ ...config, userWeights: weights });
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        {form.type === "WEIGHTED" && (
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                Share of records each user receives, relative to the others. Defaults to 1 (equal share) when left blank.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label>Select Sales Group</Label>
                                        <Select
                                            value={config.salesGroupId || ""}
                                            onValueChange={(value) => setConfig({ ...config, salesGroupId: value })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select Sales Group" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {salesGroups.map((g) => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                        {g.name} ({g._count?.members || 0} members)
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="rounded-lg border p-4">
                            <p className="mb-1 text-sm font-semibold">Workload Limits &amp; Skills</p>
                            <p className="mb-3 text-xs text-muted-foreground">
                                Unavailable users (see their profile) are always skipped. These are additional, optional filters on top of that.
                            </p>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Max open records per user</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        placeholder="No limit"
                                        value={config.maxAssignmentsPerUser ?? ""}
                                        onChange={(e) => setConfig({ ...config, maxAssignmentsPerUser: e.target.value ? Number(e.target.value) : undefined })}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        If every candidate is already at or over this, the limit is ignored for that pick rather than leaving the record unassigned.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Max new assignments per period</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            placeholder="No limit"
                                            value={config.maxAssignmentsPerWindow ?? ""}
                                            onChange={(e) => setConfig({ ...config, maxAssignmentsPerWindow: e.target.value ? Number(e.target.value) : undefined })}
                                        />
                                        <Select
                                            value={config.windowPeriod ?? "DAY"}
                                            onValueChange={(value) => setConfig({ ...config, windowPeriod: value })}
                                        >
                                            <SelectTrigger className="w-32 shrink-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="DAY">per day</SelectItem>
                                                <SelectItem value="WEEK">per week</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Caps how many NEW records this rule routes to a user in a rolling 24h/7d window, separate from their open-record count above. Also ignored (not left unassigned) once every candidate is at the limit.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Required skills</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="e.g. spanish"
                                            value={newSkillTag}
                                            onChange={(e) => setNewSkillTag(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key !== "Enter" || !newSkillTag.trim()) return;
                                                e.preventDefault();
                                                setConfig({ ...config, requiredSkills: [...new Set([...(config.requiredSkills ?? []), newSkillTag.trim()])] });
                                                setNewSkillTag("");
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                if (!newSkillTag.trim()) return;
                                                setConfig({ ...config, requiredSkills: [...new Set([...(config.requiredSkills ?? []), newSkillTag.trim()])] });
                                                setNewSkillTag("");
                                            }}
                                        >
                                            <Plus className="size-4" />
                                        </Button>
                                    </div>
                                    {(config.requiredSkills ?? []).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {config.requiredSkills.map((skill: string) => (
                                                <Badge key={skill} variant="secondary" className="gap-1 rounded-md">
                                                    {skill}
                                                    <button type="button" onClick={() => setConfig({ ...config, requiredSkills: config.requiredSkills.filter((s: string) => s !== skill) })}>
                                                        <X className="size-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground">Candidate must have every listed skill tag to be eligible.</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border p-4">
                            <p className="mb-3 text-sm font-semibold">Fallback Owner</p>
                            <div className="space-y-2">
                                <Label>Fallback User</Label>
                                <Select
                                    value={config.fallbackUserId || NO_FALLBACK}
                                    onValueChange={(value) =>
                                        setConfig({ ...config, fallbackUserId: value === NO_FALLBACK ? undefined : value })
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_FALLBACK}>
                                            <em>No fallback</em>
                                        </SelectItem>
                                        {users.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Used when the rule matches but no target user is eligible.
                                </p>
                            </div>
                        </div>

                        <div className={cn("rounded-lg border bg-muted/20 p-4", form.isDefault && "pointer-events-none opacity-50")}>
                            <p className="mb-3 text-sm text-muted-foreground">
                                {form.isDefault
                                    ? "Ignored -- a default rule always matches, so any criteria here would never be checked."
                                    : null}
                            </p>
                            <ConditionBuilder
                                title="Rule Criteria"
                                description="All conditions must match before distribution runs. Field list includes this object's system fields plus any custom fields configured for it."
                                fields={conditionFields}
                                conditions={config.conditions ?? []}
                                onChange={(conditions) => setConfig({ ...config, conditions })}
                            />
                        </div>

                        <div className="rounded-lg border p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold">Simulate this draft</p>
                                    <p className="text-xs text-muted-foreground">
                                        Run the real matching logic against a sample record using this unsaved rule -- nothing is written, no cursor/fairness state is touched.
                                    </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={simulateOpen ? () => setSimulateOpen(false) : openSimulate}>
                                    <PlayCircle className="size-4" />
                                    {simulateOpen ? "Hide" : "Simulate"}
                                </Button>
                            </div>

                            {simulateOpen && (
                                <div className="mt-3 space-y-3">
                                    <div className="flex gap-2">
                                        <Select value={selectedRecordId} onValueChange={setSelectedRecordId}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder={sampleRecords.length ? "Select a sample record" : "Loading records..."} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {sampleRecords.map((record) => (
                                                    <SelectItem key={record.id} value={record.id}>{record.name || record.title || record.id}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" size="sm" disabled={!selectedRecordId || simulating} onClick={runSimulation}>
                                            {simulating ? <Loader2 className="size-4 animate-spin" /> : "Run"}
                                        </Button>
                                    </div>

                                    {simulationResult && (
                                        <Alert variant={simulationResult.result?.assignedUserId ? "default" : "destructive"}>
                                            <AlertDescription>
                                                <p className="font-medium">{simulationResult.result?.reason}</p>
                                                {simulationResult.result?.assignedUserId && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Would assign to: {users.find((u) => u.id === simulationResult.result.assignedUserId)?.name ?? simulationResult.result.assignedUserId}
                                                    </p>
                                                )}
                                                {Array.isArray(simulationResult.trace?.[0]?.candidates) && simulationResult.trace[0].candidates.length > 0 && (
                                                    <ul className="mt-2 space-y-0.5 text-xs">
                                                        {simulationResult.trace[0].candidates.map((candidate: any) => (
                                                            <li key={candidate.id}>
                                                                {candidate.name ?? candidate.id}
                                                                {candidate.excludedReason ? ` — excluded: ${candidate.excludedReason}` : candidate.id === simulationResult.result.assignedUserId ? " — selected" : ""}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        Save Rule
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

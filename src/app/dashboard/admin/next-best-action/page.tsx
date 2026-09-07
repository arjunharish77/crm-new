"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ConditionBuilder, type ConditionFieldOption, type CrmCondition } from "@/components/common/condition-builder";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Module = "LEAD" | "OPPORTUNITY";

type Strategy = {
    id: string;
    targetModule: Module;
    name: string;
    isActive: boolean;
    maxVisibleRecommendationsPerUser: number;
    cooldownHours: number;
    dailyActionCapPerUser: number;
    suppressionConditions: { conditions: CrmCondition[]; conditionLogic: "AND" | "OR" };
};

type Rule = {
    id: string;
    name: string;
    actionType: string;
    eligibilityConditions: { conditions: CrmCondition[]; conditionLogic: "AND" | "OR" };
    actionConfig: Record<string, unknown>;
    basePriority: number;
    businessValue: number;
    priority: number;
    isActive: boolean;
    requiresApproval: boolean;
};

const ACTION_TYPES = [
    { value: "CREATE_TASK", label: "Create Task" },
    { value: "CALL_LEAD", label: "Call Lead" },
    { value: "SEND_EMAIL", label: "Send Email (creates a reminder task)" },
    { value: "SEND_WHATSAPP", label: "Send WhatsApp (creates a reminder task)" },
    { value: "SEND_SMS", label: "Send SMS (creates a reminder task)" },
    { value: "ASSIGN_OWNER", label: "Reassign Owner" },
    { value: "ADD_TO_LIST", label: "Add to List (Lead only)" },
    { value: "UPDATE_FIELD", label: "Update Field" },
    { value: "SCHEDULE_ACTIVITY", label: "Schedule Activity" },
    { value: "ESCALATE_TO_MANAGER", label: "Escalate to Manager" },
    { value: "DO_NOTHING", label: "Do Nothing" },
];

const CONDITION_FIELDS: Record<Module, ConditionFieldOption[]> = {
    LEAD: [
        { key: "status", label: "Lead Status", type: "select", options: ["NEW", "CONTACTED", "QUALIFIED", "LOST"] },
        { key: "source", label: "Lead Source", type: "text" },
        { key: "predictiveScore.scoreBand", label: "Score Band", type: "select", options: ["HOT", "WARM", "COLD", "RISK"] },
        { key: "predictiveScore.conversionProbability", label: "Conversion Probability", type: "number" },
        { key: "predictiveScore.stallRisk", label: "Stall Risk", type: "number" },
        { key: "ownerId", label: "Owner User Id", type: "text" },
    ],
    OPPORTUNITY: [
        { key: "stageId", label: "Stage Id", type: "text" },
        { key: "amount", label: "Amount", type: "number" },
        { key: "priority", label: "Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
        { key: "predictiveScore.scoreBand", label: "Score Band", type: "select", options: ["HOT", "WARM", "COLD", "RISK"] },
        { key: "predictiveScore.winProbability", label: "Win Probability", type: "number" },
        { key: "predictiveScore.stallRisk", label: "Stall Risk", type: "number" },
        { key: "ownerId", label: "Owner User Id", type: "text" },
    ],
};

type ConditionGroup = { conditions: CrmCondition[]; conditionLogic: "AND" | "OR" };

const DEFAULT_CONDITION_GROUP: ConditionGroup = { conditions: [], conditionLogic: "AND" };

const EMPTY_RULE_FORM: {
    name: string;
    actionType: string;
    eligibilityConditions: ConditionGroup;
    actionConfig: Record<string, unknown>;
    basePriority: number;
    businessValue: number;
    priority: number;
    isActive: boolean;
    requiresApproval: boolean;
} = {
    name: "",
    actionType: "CREATE_TASK",
    eligibilityConditions: DEFAULT_CONDITION_GROUP,
    actionConfig: {},
    basePriority: 50,
    businessValue: 0,
    priority: 0,
    isActive: true,
    requiresApproval: false,
};

function ModulePanel({ module }: { module: Module }) {
    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingStrategy, setSavingStrategy] = useState(false);
    const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_RULE_FORM);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [strategyData, rulesData] = await Promise.all([
                apiFetch<Strategy | null>(`/next-best-action/strategies/${module}`),
                apiFetch<Rule[]>(`/next-best-action/strategies/${module}/rules`),
            ]);
            setStrategy(strategyData ?? null);
            setRules(Array.isArray(rulesData) ? rulesData : []);
        } catch {
            toast.error("Failed to load Next-Best-Action configuration");
        } finally {
            setLoading(false);
        }
    }, [module]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const strategyOrDefault: Omit<Strategy, "id" | "targetModule"> = strategy ?? {
        name: `${module === "LEAD" ? "Lead" : "Opportunity"} Next-Best-Action Strategy`,
        isActive: true,
        maxVisibleRecommendationsPerUser: 5,
        cooldownHours: 24,
        dailyActionCapPerUser: 20,
        suppressionConditions: DEFAULT_CONDITION_GROUP,
    };

    const saveStrategy = async (patch: Partial<Omit<Strategy, "id" | "targetModule">>) => {
        setSavingStrategy(true);
        try {
            const updated = await apiFetch<Strategy>(`/next-best-action/strategies/${module}`, {
                method: "PUT",
                body: JSON.stringify({ ...strategyOrDefault, ...patch }),
            });
            setStrategy(updated);
            toast.success("Strategy saved");
        } catch (error: any) {
            toast.error(error.message || "Failed to save strategy");
        } finally {
            setSavingStrategy(false);
        }
    };

    const openCreateRule = () => {
        setEditingRuleId(null);
        setForm(EMPTY_RULE_FORM);
        setRuleDialogOpen(true);
    };

    const openEditRule = (rule: Rule) => {
        setEditingRuleId(rule.id);
        setForm({
            name: rule.name,
            actionType: rule.actionType,
            eligibilityConditions: rule.eligibilityConditions ?? DEFAULT_CONDITION_GROUP,
            actionConfig: rule.actionConfig ?? {},
            basePriority: rule.basePriority,
            businessValue: rule.businessValue,
            priority: rule.priority,
            isActive: rule.isActive,
            requiresApproval: Boolean(rule.requiresApproval),
        });
        setRuleDialogOpen(true);
    };

    const saveRule = async () => {
        if (!form.name.trim()) {
            toast.error("Rule name is required");
            return;
        }
        try {
            if (editingRuleId) {
                await apiFetch(`/next-best-action/rules/${editingRuleId}`, { method: "PATCH", body: JSON.stringify(form) });
            } else {
                await apiFetch(`/next-best-action/strategies/${module}/rules`, { method: "POST", body: JSON.stringify(form) });
            }
            toast.success("Rule saved");
            setRuleDialogOpen(false);
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to save rule");
        }
    };

    const deleteRule = async (id: string) => {
        if (!confirm("Delete this rule?")) return;
        try {
            await apiFetch(`/next-best-action/rules/${id}`, { method: "DELETE" });
            toast.success("Rule deleted");
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete rule");
        }
    };

    if (loading) return <TableSkeleton rows={4} columns={2} />;

    return (
        <div className="space-y-4">
            <div className="rounded-[14px] border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold">Strategy Settings</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Guardrails applied across every rule for this module -- suppression, cooldown, caps.
                        </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium">
                        <Switch
                            checked={strategyOrDefault.isActive}
                            disabled={savingStrategy}
                            onCheckedChange={(checked) => saveStrategy({ isActive: checked })}
                        />
                        Active
                    </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label>Max visible recommendations / user</Label>
                        <Input
                            type="number"
                            defaultValue={strategyOrDefault.maxVisibleRecommendationsPerUser}
                            onBlur={(e) => saveStrategy({ maxVisibleRecommendationsPerUser: Number(e.target.value) || 5 })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Cooldown (hours)</Label>
                        <Input
                            type="number"
                            defaultValue={strategyOrDefault.cooldownHours}
                            onBlur={(e) => saveStrategy({ cooldownHours: Number(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Daily action cap / user</Label>
                        <Input
                            type="number"
                            defaultValue={strategyOrDefault.dailyActionCapPerUser}
                            onBlur={(e) => saveStrategy({ dailyActionCapPerUser: Number(e.target.value) || 1 })}
                        />
                    </div>
                </div>
                <div className="mt-4">
                    <ConditionBuilder
                        title="Suppression Conditions"
                        description="Records matching these conditions never get a recommendation (compliance/consent/do-not-contact)."
                        fields={CONDITION_FIELDS[module]}
                        conditions={strategyOrDefault.suppressionConditions?.conditions ?? []}
                        logic={strategyOrDefault.suppressionConditions?.conditionLogic ?? "AND"}
                        onLogicChange={(conditionLogic) =>
                            saveStrategy({ suppressionConditions: { conditions: strategyOrDefault.suppressionConditions?.conditions ?? [], conditionLogic } })
                        }
                        onChange={(conditions) =>
                            saveStrategy({ suppressionConditions: { conditions, conditionLogic: strategyOrDefault.suppressionConditions?.conditionLogic ?? "AND" } })
                        }
                    />
                </div>
            </div>

            <div className="rounded-[14px] border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold">Rules</h2>
                    <Button size="sm" onClick={openCreateRule}>
                        <Plus className="size-4" />
                        Add Rule
                    </Button>
                </div>
                {rules.length === 0 ? (
                    <EmptyState title="No rules yet" description="Add a rule to start generating recommendations for this module." />
                ) : (
                    <div className="space-y-2">
                        {rules.map((rule) => (
                            <div key={rule.id} className="flex items-center justify-between gap-3 rounded-xl border bg-surface-container-low p-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold">{rule.name}</span>
                                        <Badge variant="outline" className="rounded-md text-[0.65rem]">{rule.actionType}</Badge>
                                        {!rule.isActive && <Badge variant="outline" className="rounded-md text-[0.65rem] text-muted-foreground">Inactive</Badge>}
                                        {rule.requiresApproval && <Badge variant="secondary" className="rounded-md text-[0.65rem]">Needs manager approval</Badge>}
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Base priority {rule.basePriority} · Business value {rule.businessValue}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button size="icon-sm" variant="ghost" onClick={() => openEditRule(rule)}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => deleteRule(rule.id)}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <StandardDialog
                open={ruleDialogOpen}
                onClose={() => setRuleDialogOpen(false)}
                title={editingRuleId ? "Edit Rule" : "Add Rule"}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
                        <Button onClick={saveRule}>Save Rule</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Rule Name</Label>
                        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Action Type</Label>
                        <Select value={form.actionType} onValueChange={(value) => setForm((f) => ({ ...f, actionType: value }))}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {ACTION_TYPES.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <ConditionBuilder
                        title="Eligibility Conditions"
                        description="A record must match these to be considered for this rule."
                        fields={CONDITION_FIELDS[module]}
                        conditions={form.eligibilityConditions.conditions}
                        logic={form.eligibilityConditions.conditionLogic}
                        onLogicChange={(conditionLogic) => setForm((f) => ({ ...f, eligibilityConditions: { ...f.eligibilityConditions, conditionLogic } }))}
                        onChange={(conditions) => setForm((f) => ({ ...f, eligibilityConditions: { ...f.eligibilityConditions, conditions } }))}
                    />
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>Base Priority (0-100)</Label>
                            <Input type="number" value={form.basePriority} onChange={(e) => setForm((f) => ({ ...f, basePriority: Number(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Business Value</Label>
                            <Input type="number" value={form.businessValue} onChange={(e) => setForm((f) => ({ ...f, businessValue: Number(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Tie-break Priority</Label>
                            <Input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))} />
                        </div>
                    </div>
                    {(form.actionType === "CREATE_TASK" || form.actionType === "SCHEDULE_ACTIVITY") && (
                        <div className="space-y-1.5">
                            <Label>{form.actionType === "CREATE_TASK" ? "Task Title (optional)" : "Notes (optional)"}</Label>
                            <Input
                                value={(form.actionConfig.taskTitle as string) || (form.actionConfig.notes as string) || ""}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        actionConfig: { ...f.actionConfig, [form.actionType === "CREATE_TASK" ? "taskTitle" : "notes"]: e.target.value },
                                    }))
                                }
                            />
                        </div>
                    )}
                    {form.actionType === "UPDATE_FIELD" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Field Key</Label>
                                <Input
                                    value={(form.actionConfig.fieldKey as string) || ""}
                                    onChange={(e) => setForm((f) => ({ ...f, actionConfig: { ...f.actionConfig, fieldKey: e.target.value } }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Field Value</Label>
                                <Input
                                    value={(form.actionConfig.fieldValue as string) || ""}
                                    onChange={(e) => setForm((f) => ({ ...f, actionConfig: { ...f.actionConfig, fieldValue: e.target.value } }))}
                                />
                            </div>
                        </div>
                    )}
                    {form.actionType === "ADD_TO_LIST" && (
                        <div className="space-y-1.5">
                            <Label>List Id</Label>
                            <Input
                                value={(form.actionConfig.listId as string) || ""}
                                onChange={(e) => setForm((f) => ({ ...f, actionConfig: { ...f.actionConfig, listId: e.target.value } }))}
                            />
                        </div>
                    )}
                    <label className="flex items-center gap-2 text-sm font-medium">
                        <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))} />
                        Active
                    </label>
                    <div className="rounded-lg border p-3">
                        <label className="flex items-center gap-2 text-sm font-medium">
                            <Switch
                                checked={form.requiresApproval}
                                onCheckedChange={(checked) => setForm((f) => ({ ...f, requiresApproval: checked }))}
                            />
                            Requires manager approval
                        </label>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Recommendations from this rule go to the record owner&apos;s manager first, instead of straight to the owner. The owner only sees it once approved.
                        </p>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}

export default function NextBestActionAdminPage() {
    const moduleEnabled = useModuleEnabled("NEXT_BEST_ACTION");

    if (!moduleEnabled) {
        return (
            <div className="mx-auto max-w-[1200px] p-4 md:p-6">
                <EmptyState title="Next-Best-Action isn't enabled" description="Ask a platform admin to enable this module for your tenant." />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] p-4 md:p-6">
            <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <h1 className="text-lg font-extrabold tracking-tight">Next-Best-Action</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                Deterministic recommendation rules for Leads and Opportunities -- no external AI cost, ranked from predictive
                score, SLA risk, owner workload, and rule priority.
            </p>

            <Tabs defaultValue="LEAD" className="mt-4 space-y-4">
                <TabsList>
                    <TabsTrigger value="LEAD">Leads</TabsTrigger>
                    <TabsTrigger value="OPPORTUNITY">Opportunities</TabsTrigger>
                </TabsList>
                <TabsContent value="LEAD"><ModulePanel module="LEAD" /></TabsContent>
                <TabsContent value="OPPORTUNITY"><ModulePanel module="OPPORTUNITY" /></TabsContent>
            </Tabs>
        </div>
    );
}

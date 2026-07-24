"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { ConditionBuilder, type ConditionFieldOption, type CrmCondition } from "@/components/common/condition-builder";

type CommissionRule = {
    id: string;
    name: string;
    partnerId: string | null;
    opportunityTypeId: string | null;
    conditions?: { logic?: string; conditions?: CrmCondition[] };
    ruleType: "FLAT" | "PERCENTAGE";
    value: number;
    priority: number;
    isActive: boolean;
};

const emptyForm = {
    name: "",
    partnerId: "",
    opportunityTypeId: "",
    ruleType: "PERCENTAGE" as "FLAT" | "PERCENTAGE",
    value: 0,
    priority: 0,
    isActive: true,
    conditions: [] as CrmCondition[],
    conditionLogic: "AND" as "AND" | "OR",
};

export default function CommissionRulesPage() {
    const [rules, setRules] = useState<CommissionRule[]>([]);
    const [partners, setPartners] = useState<any[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<CommissionRule | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesData, partnersData, typesData] = await Promise.all([
                apiFetch<CommissionRule[]>("/commission-rules"),
                apiFetch<any[]>("/partners").catch(() => []),
                apiFetch<any[]>("/opportunity-types").catch(() => []),
            ]);
            setRules(Array.isArray(rulesData) ? rulesData : []);
            setPartners(Array.isArray(partnersData) ? partnersData : []);
            setOpportunityTypes(Array.isArray(typesData) ? typesData : []);
        } catch {
            toast.error("Failed to load commission rules");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setDialogOpen(true);
    };

    const openEdit = (rule: CommissionRule) => {
        setEditing(rule);
        setForm({
            name: rule.name,
            partnerId: rule.partnerId ?? "",
            opportunityTypeId: rule.opportunityTypeId ?? "",
            ruleType: rule.ruleType,
            value: rule.value,
            priority: rule.priority,
            isActive: rule.isActive,
            conditions: rule.conditions?.conditions ?? [],
            conditionLogic: (rule.conditions?.logic === "OR" ? "OR" : "AND") as "AND" | "OR",
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                partnerId: form.partnerId || null,
                opportunityTypeId: form.opportunityTypeId || null,
                ruleType: form.ruleType,
                value: Number(form.value),
                priority: Number(form.priority),
                isActive: form.isActive,
                conditions: form.conditions.length > 0 ? { logic: form.conditionLogic, conditions: form.conditions } : {},
            };

            if (editing) {
                await apiFetch(`/commission-rules/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
                toast.success("Commission rule updated");
            } else {
                await apiFetch("/commission-rules", { method: "POST", body: JSON.stringify(payload) });
                toast.success("Commission rule created");
            }
            setDialogOpen(false);
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to save commission rule");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this commission rule?")) return;
        try {
            await apiFetch(`/commission-rules/${id}`, { method: "DELETE" });
            toast.success("Commission rule deleted");
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete commission rule");
        }
    };

    const partnerName = (partnerId: string | null) => partners.find((p) => p.userId === partnerId)?.legalBusinessName ?? partnerId;
    const typeName = (typeId: string | null) => opportunityTypes.find((t) => t.id === typeId)?.name ?? typeId;
    const stageOptions = opportunityTypes.flatMap((type) => (type.stages ?? []).map((stage: any) => ({ value: stage.id, label: `${type.name}: ${stage.name}` })));
    const conditionFields: ConditionFieldOption[] = [
        { key: "amount", label: "Opportunity Amount", type: "number" },
        { key: "stageId", label: "Opportunity Stage", type: "select", options: stageOptions },
        { key: "priority", label: "Opportunity Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH"] },
        { key: "opportunityTypeId", label: "Opportunity Product", type: "select", options: opportunityTypes.map((type) => ({ value: type.id, label: type.name })) },
        { key: "ownerId", label: "Opportunity Owner / Partner", type: "select", options: partners.map((partner) => ({ value: partner.userId, label: partner.legalBusinessName })) },
        { key: "lead.source", label: "Lead Source", type: "select", options: ["Partner", "Google Ads", "Website", "Referral", "Direct", "Portal", "FORM"] },
        { key: "lead.status", label: "Lead Status", type: "select", options: ["NEW", "QUALIFIED", "LOST", "WON"] },
        { key: "lead.company", label: "Lead Company", type: "text" },
        { key: "lead.score", label: "Lead Score", type: "number" },
        { key: "createdAt", label: "Opportunity Created Date", type: "date" },
        { key: "expectedCloseDate", label: "Expected Close Date", type: "date" },
    ];

    return (
        <div className="mx-auto max-w-[1200px] p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-extrabold tracking-tight">Commission Rules</h1>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Tried in priority order (highest first) — the first matching rule wins. Leave partner/product
                        blank to apply broadly.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="size-4" />
                    Add Rule
                </Button>
            </div>

            {loading ? (
                <TableSkeleton rows={4} columns={3} />
            ) : rules.length === 0 ? (
                <EmptyState
                    title="No commission rules yet"
                    description="Add a rule to start calculating partner commission."
                    action={
                        <Button variant="outline" onClick={openCreate}>
                            <Plus className="size-4" />
                            Add Rule
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {rules.map((rule) => (
                        <div key={rule.id} className="rounded-[14px] border bg-card p-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold">{rule.name}</span>
                                        <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                                            priority {rule.priority}
                                        </Badge>
                                        {!rule.isActive && (
                                            <Badge variant="secondary" className="rounded-md text-[0.65rem] font-semibold">
                                                inactive
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {rule.partnerId ? `Partner: ${partnerName(rule.partnerId)}` : "Any partner"}
                                        {" · "}
                                        {rule.opportunityTypeId ? `Product: ${typeName(rule.opportunityTypeId)}` : "Any product"}
                                        {rule.conditions?.conditions?.length ? ` · ${rule.conditions.conditions.length} condition(s)` : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold">
                                        {rule.ruleType === "FLAT" ? `₹${rule.value}` : `${rule.value}%`}
                                    </span>
                                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(rule)} aria-label={`Edit ${rule.name}`}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(rule.id)} aria-label={`Delete ${rule.name}`}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <StandardDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                title={editing ? "Edit Commission Rule" : "Add Commission Rule"}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !form.name}>
                            {saving ? "Saving..." : "Save"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Partner (optional)</Label>
                            <Select
                                value={form.partnerId || "__any__"}
                                onValueChange={(v) => setForm((f) => ({ ...f, partnerId: v === "__any__" ? "" : v }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Any partner" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__any__">Any partner</SelectItem>
                                    {partners.map((p) => (
                                        <SelectItem key={p.userId} value={p.userId}>{p.legalBusinessName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Product (optional)</Label>
                            <Select
                                value={form.opportunityTypeId || "__any__"}
                                onValueChange={(v) => setForm((f) => ({ ...f, opportunityTypeId: v === "__any__" ? "" : v }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Any product" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__any__">Any product</SelectItem>
                                    {opportunityTypes.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select
                                value={form.ruleType}
                                onValueChange={(v) => setForm((f) => ({ ...f, ruleType: v as "FLAT" | "PERCENTAGE" }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                                    <SelectItem value="FLAT">Flat Amount</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>{form.ruleType === "PERCENTAGE" ? "Percentage (%)" : "Flat Amount (₹)"}</Label>
                            <Input
                                type="number"
                                value={form.value}
                                onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Priority</Label>
                            <Input
                                type="number"
                                value={form.priority}
                                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                            />
                            <p className="text-xs text-muted-foreground">Higher tried first</p>
                        </div>
                    </div>

                    <ConditionBuilder
                        title="Eligibility Conditions"
                        description="Use dropdown-backed CRM fields so payout rules are reliable and auditable."
                        fields={conditionFields}
                        conditions={form.conditions}
                        logic={form.conditionLogic}
                        onLogicChange={(conditionLogic) => setForm((f) => ({ ...f, conditionLogic }))}
                        onChange={(conditions) => setForm((f) => ({ ...f, conditions }))}
                    />

                    <div className="flex items-center gap-2">
                        <Switch
                            checked={form.isActive}
                            onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
                            id="commission-rule-active"
                        />
                        <Label htmlFor="commission-rule-active">Active</Label>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}

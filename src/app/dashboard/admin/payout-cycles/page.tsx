"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Plus, RefreshCw, Download, Receipt, CalendarDays, FileText, Building2, ShieldCheck, PauseCircle, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { QueueExportButton } from "@/components/exports/queue-export-button";

type PayoutCycle = {
    id: string;
    cycleLabel: string;
    startDate: string;
    endDate: string;
    status: "OPEN" | "CLOSED";
};

type Payout = {
    id: string;
    partnerId: string;
    totalCommissionAmount: number;
    status: "DRAFT" | "APPROVED" | "INVOICED" | "PAID";
    paymentReference: string | null;
    invoiceId: string | null;
    isHeld: boolean;
    holdReason: string | null;
    partner: { name?: string; email?: string; legalBusinessName?: string } | null;
};

type PayoutSettings = {
    cycleFrequency: "MONTHLY" | "BIWEEKLY" | "CUSTOM_DAYS";
    customIntervalDays: number | null;
    cycleAnchorDay: number;
    companyLegalName: string;
    companyGstin: string;
    companyAddress: {
        line1?: string;
        line2?: string;
        city?: string;
        postalCode?: string;
    } | null;
    companyState: string;
    defaultHsnSacCode: string;
    gstRatePercent: number;
    invoiceNumberPattern: string;
    minimumPayoutAmount: number;
    approvalMode: "MANUAL" | "AUTO_BELOW_THRESHOLD";
    autoApproveBelowAmount: number | null;
    requireInvoiceBeforePayment: boolean;
    allowPartnerSelfInvoice: boolean;
    adjustmentReasons: string[];
    holdReasons: string[];
    payoutVisibilityConfig: {
        mode: "ALL_PARTNERS" | "SELECTED";
        userIds: string[];
        teamIds: string[];
        salesGroupIds: string[];
        partnerOrganizationIds: string[];
    };
};

const DEFAULT_SETTINGS: PayoutSettings = {
    cycleFrequency: "MONTHLY",
    customIntervalDays: null,
    cycleAnchorDay: 1,
    companyLegalName: "",
    companyGstin: "",
    companyAddress: { line1: "", line2: "", city: "", postalCode: "" },
    companyState: "",
    defaultHsnSacCode: "",
    gstRatePercent: 18,
    invoiceNumberPattern: "{prefix}-{counter}",
    minimumPayoutAmount: 0,
    approvalMode: "MANUAL",
    autoApproveBelowAmount: null,
    requireInvoiceBeforePayment: true,
    allowPartnerSelfInvoice: true,
    adjustmentReasons: ["Commission correction", "Duplicate payout", "Clawback", "Goodwill adjustment"],
    holdReasons: ["KYC pending", "Invoice mismatch", "Finance review", "Dispute raised"],
    payoutVisibilityConfig: { mode: "ALL_PARTNERS", userIds: [], teamIds: [], salesGroupIds: [], partnerOrganizationIds: [] },
};

type TargetOption = {
    id: string;
    name?: string | null;
    email?: string | null;
    legalBusinessName?: string | null;
    partnerOrganizationId?: string | null;
    user?: { name?: string | null; email?: string | null } | null;
};

const GST_RATE_OPTIONS = [
    { value: "0", label: "0% - Exempt" },
    { value: "5", label: "5%" },
    { value: "12", label: "12%" },
    { value: "18", label: "18% - Standard services" },
    { value: "28", label: "28%" },
];

const INVOICE_PATTERN_OPTIONS = [
    { value: "{prefix}-{counter}", label: "Simple: PREFIX-1" },
    { value: "{prefix}/{fy}/{counter:04d}", label: "Financial year: PREFIX/FY/0001" },
    { value: "{prefix}/{yyyy}/{counter:04d}", label: "Calendar year: PREFIX/YYYY/0001" },
    { value: "{prefix}/{partner}/{counter:04d}", label: "Partner coded: PREFIX/PARTNER/0001" },
];

const INDIAN_STATE_OPTIONS = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
    "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const STATUS_BADGE_CLASSNAMES: Record<Payout["status"], string> = {
    PAID: "border-primary/20 bg-primary/10 text-primary",
    APPROVED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    INVOICED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    DRAFT: "border-border bg-muted text-muted-foreground",
};

export default function PayoutCyclesPage() {
    const [settings, setSettings] = useState<PayoutSettings>(DEFAULT_SETTINGS);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    const [cycles, setCycles] = useState<PayoutCycle[]>([]);
    const [loadingCycles, setLoadingCycles] = useState(true);
    const [generating, setGenerating] = useState(false);

    const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [loadingPayouts, setLoadingPayouts] = useState(false);
    const [computing, setComputing] = useState(false);

    const [markPaidTarget, setMarkPaidTarget] = useState<Payout | null>(null);
    const [paymentReference, setPaymentReference] = useState("");
    const [holdTarget, setHoldTarget] = useState<Payout | null>(null);
    const [holdReason, setHoldReason] = useState("");
    const [adjustmentTarget, setAdjustmentTarget] = useState<Payout | null>(null);
    const [adjustmentDirection, setAdjustmentDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
    const [adjustmentAmount, setAdjustmentAmount] = useState("");
    const [adjustmentReason, setAdjustmentReason] = useState("");
    const [adjustmentNotes, setAdjustmentNotes] = useState("");
    const [users, setUsers] = useState<TargetOption[]>([]);
    const [teams, setTeams] = useState<TargetOption[]>([]);
    const [salesGroups, setSalesGroups] = useState<TargetOption[]>([]);
    const [partnerOrgs, setPartnerOrgs] = useState<TargetOption[]>([]);

    const fetchSettings = useCallback(async () => {
        try {
            const data = await apiFetch<Partial<PayoutSettings> | null>("/payout-settings");
            if (data) setSettings((s) => ({ ...s, ...data }));
        } catch {
            toast.error("Failed to load payout settings");
        } finally {
            setSettingsLoaded(true);
        }
    }, []);

    const fetchCycles = useCallback(async () => {
        setLoadingCycles(true);
        try {
            const data = await apiFetch<PayoutCycle[]>("/payout-cycles");
            setCycles(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load payout cycles");
        } finally {
            setLoadingCycles(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
        fetchCycles();
    }, [fetchSettings, fetchCycles]);

    useEffect(() => {
        Promise.all([
            apiFetch<TargetOption[]>("/users").catch(() => []),
            apiFetch<TargetOption[]>("/teams").catch(() => []),
            apiFetch<TargetOption[]>("/sales-groups").catch(() => []),
            apiFetch<TargetOption[]>("/partners").catch(() => []),
        ]).then(([userData, teamData, groupData, partnerData]) => {
            setUsers(Array.isArray(userData) ? userData : []);
            setTeams(Array.isArray(teamData) ? teamData : []);
            setSalesGroups(Array.isArray(groupData) ? groupData : []);
            const orgMap = new Map<string, TargetOption>();
            for (const partner of Array.isArray(partnerData) ? partnerData : []) {
                const orgId = partner.partnerOrganizationId;
                if (orgId) orgMap.set(orgId, { id: orgId, name: partner.legalBusinessName ?? partner.user?.name ?? orgId });
            }
            setPartnerOrgs([...orgMap.values()]);
        });
    }, []);

    const fetchPayouts = useCallback(async (cycleId: string) => {
        setLoadingPayouts(true);
        try {
            const data = await apiFetch<Payout[]>(`/payout-cycles/${cycleId}/payouts`);
            setPayouts(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load payouts for this cycle");
        } finally {
            setLoadingPayouts(false);
        }
    }, []);

    const handleSelectCycle = (cycleId: string) => {
        setSelectedCycleId(cycleId);
        fetchPayouts(cycleId);
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await apiFetch("/payout-settings", { method: "PUT", body: JSON.stringify(settings) });
            toast.success("Payout settings saved");
        } catch (error: any) {
            toast.error(error.message || "Failed to save payout settings");
        } finally {
            setSavingSettings(false);
        }
    };

    const toggleVisibilityTarget = (
        key: "userIds" | "teamIds" | "salesGroupIds" | "partnerOrganizationIds",
        id: string,
        checked: boolean
    ) => {
        setSettings((current) => {
            const existing = current.payoutVisibilityConfig?.[key] ?? [];
            return {
                ...current,
                payoutVisibilityConfig: {
                    ...(current.payoutVisibilityConfig ?? DEFAULT_SETTINGS.payoutVisibilityConfig),
                    mode: "SELECTED",
                    [key]: checked ? [...new Set([...existing, id])] : existing.filter((value) => value !== id),
                },
            };
        });
    };

    const updateCompanyAddress = (patch: NonNullable<PayoutSettings["companyAddress"]>) => {
        setSettings((current) => ({
            ...current,
            companyAddress: {
                ...(current.companyAddress ?? {}),
                ...patch,
            },
        }));
    };

    const handleGenerateCycle = async () => {
        setGenerating(true);
        try {
            await apiFetch("/payout-cycles", { method: "POST" });
            toast.success("Payout cycle generated");
            fetchCycles();
        } catch (error: any) {
            toast.error(error.message || "Failed to generate payout cycle");
        } finally {
            setGenerating(false);
        }
    };

    const handleCompute = async () => {
        if (!selectedCycleId) return;
        setComputing(true);
        try {
            await apiFetch(`/payout-cycles/${selectedCycleId}/compute`, { method: "POST" });
            toast.success("Payouts recomputed from the commission ledger");
            fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to compute payouts");
        } finally {
            setComputing(false);
        }
    };

    const handleApprove = async (payoutId: string) => {
        try {
            await apiFetch(`/payouts/${payoutId}/approve`, { method: "POST" });
            toast.success("Payout approved");
            if (selectedCycleId) fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to approve payout");
        }
    };

    const handleMarkPaid = async () => {
        if (!markPaidTarget) return;
        try {
            await apiFetch(`/payouts/${markPaidTarget.id}/mark-paid`, {
                method: "POST",
                body: JSON.stringify({ paymentReference }),
            });
            toast.success("Payout marked as paid");
            setMarkPaidTarget(null);
            setPaymentReference("");
            if (selectedCycleId) fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to mark payout as paid");
        }
    };

    const handleHoldPayout = async () => {
        if (!holdTarget) return;
        try {
            await apiFetch(`/payouts/${holdTarget.id}/hold`, {
                method: "POST",
                body: JSON.stringify({ holdReason }),
            });
            toast.success("Payout placed on hold");
            setHoldTarget(null);
            setHoldReason("");
            if (selectedCycleId) fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to hold payout");
        }
    };

    const handleReleaseHold = async (payoutId: string) => {
        try {
            await apiFetch(`/payouts/${payoutId}/release-hold`, { method: "POST" });
            toast.success("Payout hold released");
            if (selectedCycleId) fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to release payout hold");
        }
    };

    const handleCreateAdjustment = async () => {
        if (!adjustmentTarget) return;
        try {
            await apiFetch(`/payouts/${adjustmentTarget.id}/adjustments`, {
                method: "POST",
                body: JSON.stringify({
                    direction: adjustmentDirection,
                    amount: Number(adjustmentAmount),
                    reason: adjustmentReason,
                    notes: adjustmentNotes,
                }),
            });
            toast.success("Payout adjustment created");
            setAdjustmentTarget(null);
            setAdjustmentAmount("");
            setAdjustmentReason("");
            setAdjustmentNotes("");
            setAdjustmentDirection("CREDIT");
            if (selectedCycleId) fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to create adjustment");
        }
    };

    const [generatingInvoiceFor, setGeneratingInvoiceFor] = useState<string | null>(null);
    const handleGenerateInvoice = async (payoutId: string) => {
        setGeneratingInvoiceFor(payoutId);
        try {
            await apiFetch(`/payouts/${payoutId}/generate-invoice`, { method: "POST" });
            toast.success("Invoice generated");
            if (selectedCycleId) fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to generate invoice");
        } finally {
            setGeneratingInvoiceFor(null);
        }
    };

    return (
        <div className="mx-auto max-w-[1600px] p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-extrabold tracking-tight">Payout Cycles</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                Cycles auto-generate on the interval below. Each cycle sums the commission ledger per partner into a
                Draft → Approved → Paid payout.
            </p>

            <Tabs defaultValue="configuration" className="mt-4 space-y-4">
                <div className="overflow-x-auto pb-1">
                    <TabsList className="h-10 min-w-max">
                        <TabsTrigger value="configuration">Configuration</TabsTrigger>
                        <TabsTrigger value="visibility">Visibility</TabsTrigger>
                        <TabsTrigger value="billing">Billing Identity</TabsTrigger>
                        <TabsTrigger value="cycles">Cycles & Payouts</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="configuration" className="space-y-4">
            <Tabs defaultValue="cycle-rules" className="space-y-4">
                <div className="overflow-x-auto pb-1">
                    <TabsList className="h-10 min-w-max">
                        <TabsTrigger value="cycle-rules">Cycle Rules</TabsTrigger>
                        <TabsTrigger value="tax-invoice">Tax & Invoice</TabsTrigger>
                        <TabsTrigger value="finance-controls">Finance Controls</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="cycle-rules">
                <div className="rounded-[14px] border bg-card p-4">
                    <div className="mb-4 flex items-start gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            <CalendarDays className="size-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold">Cycle Rules</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Controls how the next payout period is generated and where calendar cycles anchor.
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Frequency</Label>
                            <Select
                                disabled={!settingsLoaded}
                                value={settings.cycleFrequency}
                                onValueChange={(v) => setSettings((s) => ({ ...s, cycleFrequency: v as PayoutSettings["cycleFrequency"] }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Frequency" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                                    <SelectItem value="BIWEEKLY">Bi-weekly</SelectItem>
                                    <SelectItem value="CUSTOM_DAYS">Custom interval</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Anchor Day</Label>
                            <Select
                                disabled={!settingsLoaded}
                                value={String(settings.cycleAnchorDay ?? 1)}
                                onValueChange={(value) => setSettings((s) => ({ ...s, cycleAnchorDay: Number(value) }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 28 }).map((_, index) => (
                                        <SelectItem key={index + 1} value={String(index + 1)}>
                                            Day {index + 1}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {settings.cycleFrequency === "CUSTOM_DAYS" && (
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Custom Interval</Label>
                                <Select
                                    value={String(settings.customIntervalDays ?? 30)}
                                    onValueChange={(value) => setSettings((s) => ({ ...s, customIntervalDays: Number(value) }))}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="7">Every 7 days</SelectItem>
                                        <SelectItem value="14">Every 14 days</SelectItem>
                                        <SelectItem value="30">Every 30 days</SelectItem>
                                        <SelectItem value="45">Every 45 days</SelectItem>
                                        <SelectItem value="60">Every 60 days</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded}>
                            {savingSettings ? "Saving..." : "Save Settings"}
                        </Button>
                        <Button variant="outline" onClick={handleGenerateCycle} disabled={generating}>
                            <Plus className="size-4" />
                            {generating ? "Generating..." : "Generate Next Cycle"}
                        </Button>
                    </div>
                </div>
                </TabsContent>

                <TabsContent value="tax-invoice">
                <div className="rounded-[14px] border bg-card p-4">
                    <div className="mb-4 flex items-start gap-3">
                        <div className="rounded-lg bg-tertiary/10 p-2 text-tertiary">
                            <FileText className="size-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold">Invoice & Tax Rules</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Applies to partner-generated invoices and finance exports for approved payouts.
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Default HSN/SAC Code</Label>
                            <Input
                                value={settings.defaultHsnSacCode}
                                onChange={(e) => setSettings((s) => ({ ...s, defaultHsnSacCode: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>GST Rate (%)</Label>
                            <Select
                                value={String(settings.gstRatePercent)}
                                onValueChange={(value) => setSettings((s) => ({ ...s, gstRatePercent: Number(value) }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {GST_RATE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Invoice Number Pattern</Label>
                            <Select
                                value={settings.invoiceNumberPattern}
                                onValueChange={(value) => setSettings((s) => ({ ...s, invoiceNumberPattern: value }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INVOICE_PATTERN_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Button className="mt-4" onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded}>
                        {savingSettings ? "Saving..." : "Save Tax Rules"}
                    </Button>
                </div>
                </TabsContent>

                <TabsContent value="finance-controls">
            <div className="rounded-[14px] border bg-card p-4">
                <div className="mb-4 flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <ShieldCheck className="size-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold">Approval & Finance Controls</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Enforced on approve/pay actions so finance controls are not just UI hints.
                        </p>
                    </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                        <Label>Minimum Payout Amount</Label>
                        <Input
                            type="number"
                            value={settings.minimumPayoutAmount}
                            onChange={(e) => setSettings((s) => ({ ...s, minimumPayoutAmount: Number(e.target.value) || 0 }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Approval Mode</Label>
                        <Select
                            value={settings.approvalMode}
                            onValueChange={(value) => setSettings((s) => ({ ...s, approvalMode: value as PayoutSettings["approvalMode"] }))}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MANUAL">Manual approval</SelectItem>
                                <SelectItem value="AUTO_BELOW_THRESHOLD">Auto below threshold</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Auto-Approve Below</Label>
                        <Input
                            type="number"
                            value={settings.autoApproveBelowAmount ?? ""}
                            onChange={(e) => setSettings((s) => ({ ...s, autoApproveBelowAmount: e.target.value ? Number(e.target.value) : null }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Hold Reasons</Label>
                        <Input
                            value={(settings.holdReasons ?? []).join(", ")}
                            onChange={(e) => setSettings((s) => ({ ...s, holdReasons: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))}
                        />
                    </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="flex items-center justify-between gap-3 rounded-xl border bg-surface-container-low p-3">
                        <span className="text-sm font-semibold">Require invoice before payment</span>
                        <Switch
                            checked={settings.requireInvoiceBeforePayment}
                            onCheckedChange={(checked) => setSettings((s) => ({ ...s, requireInvoiceBeforePayment: checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-xl border bg-surface-container-low p-3">
                        <span className="text-sm font-semibold">Allow partner self-invoice</span>
                        <Switch
                            checked={settings.allowPartnerSelfInvoice}
                            onCheckedChange={(checked) => setSettings((s) => ({ ...s, allowPartnerSelfInvoice: checked }))}
                        />
                    </label>
                    <div className="space-y-2">
                        <Label>Adjustment Reasons</Label>
                        <Input
                            value={(settings.adjustmentReasons ?? []).join(", ")}
                            onChange={(e) => setSettings((s) => ({ ...s, adjustmentReasons: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))}
                        />
                    </div>
                </div>
                <Button className="mt-4" onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded}>
                    {savingSettings ? "Saving..." : "Save Finance Controls"}
                </Button>
            </div>
                </TabsContent>
            </Tabs>
                </TabsContent>

                <TabsContent value="visibility">
            <div className="rounded-[14px] border bg-card p-4">
                <div className="mb-4 flex items-start gap-3">
                    <div className="rounded-lg bg-secondary/10 p-2 text-secondary">
                        <ShieldCheck className="size-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold">Payout Module Visibility</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Choose which partner logins, internal teams, sales groups, or partner organizations can see payout self-service.
                        </p>
                    </div>
                </div>
                <div className="max-w-sm space-y-2">
                    <Label>Visibility Mode</Label>
                    <Select
                        value={settings.payoutVisibilityConfig?.mode ?? "ALL_PARTNERS"}
                        onValueChange={(value) => setSettings((current) => ({
                            ...current,
                            payoutVisibilityConfig: { ...(current.payoutVisibilityConfig ?? DEFAULT_SETTINGS.payoutVisibilityConfig), mode: value as "ALL_PARTNERS" | "SELECTED" },
                        }))}
                    >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL_PARTNERS">All active partners</SelectItem>
                            <SelectItem value="SELECTED">Selected users, teams, groups, and partner orgs</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {settings.payoutVisibilityConfig?.mode === "SELECTED" ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-4">
                        <TargetChecklist title="Users" items={users} selected={settings.payoutVisibilityConfig.userIds} onToggle={(id, checked) => toggleVisibilityTarget("userIds", id, checked)} />
                        <TargetChecklist title="Teams" items={teams} selected={settings.payoutVisibilityConfig.teamIds} onToggle={(id, checked) => toggleVisibilityTarget("teamIds", id, checked)} />
                        <TargetChecklist title="Sales Groups" items={salesGroups} selected={settings.payoutVisibilityConfig.salesGroupIds} onToggle={(id, checked) => toggleVisibilityTarget("salesGroupIds", id, checked)} />
                        <TargetChecklist title="Partner Organizations" items={partnerOrgs} selected={settings.payoutVisibilityConfig.partnerOrganizationIds} onToggle={(id, checked) => toggleVisibilityTarget("partnerOrganizationIds", id, checked)} />
                    </div>
                ) : null}
                <Button className="mt-4" onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded}>
                    {savingSettings ? "Saving..." : "Save Visibility"}
                </Button>
            </div>
                </TabsContent>

                <TabsContent value="billing">
            <div className="rounded-[14px] border bg-card p-4">
                <div className="mb-4 flex items-start gap-3">
                    <div className="rounded-lg bg-secondary/10 p-2 text-secondary">
                        <Building2 className="size-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold">Company Billing Identity</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Required before any partner can generate an invoice. Partners invoice this business for commission.
                        </p>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Company Legal Name</Label>
                            <Input
                                value={settings.companyLegalName}
                                onChange={(e) => setSettings((s) => ({ ...s, companyLegalName: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Company GSTIN</Label>
                            <Input
                                value={settings.companyGstin}
                                onChange={(e) => setSettings((s) => ({ ...s, companyGstin: e.target.value.toUpperCase() }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Company State</Label>
                            <Select
                                value={settings.companyState || "__none__"}
                                onValueChange={(value) => setSettings((s) => ({ ...s, companyState: value === "__none__" ? "" : value }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Select state</SelectItem>
                                    {INDIAN_STATE_OPTIONS.map((state) => (
                                        <SelectItem key={state} value={state}>{state}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Used for CGST+SGST vs IGST place-of-supply logic</p>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-4">
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Address Line 1</Label>
                            <Input
                                value={settings.companyAddress?.line1 ?? ""}
                                onChange={(e) => updateCompanyAddress({ line1: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Address Line 2</Label>
                            <Input
                                value={settings.companyAddress?.line2 ?? ""}
                                onChange={(e) => updateCompanyAddress({ line2: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label>City</Label>
                            <Input
                                value={settings.companyAddress?.city ?? ""}
                                onChange={(e) => updateCompanyAddress({ city: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Postal Code</Label>
                            <Input
                                value={settings.companyAddress?.postalCode ?? ""}
                                onChange={(e) => updateCompanyAddress({ postalCode: e.target.value })}
                            />
                        </div>
                    </div>
                    <Button onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded}>
                        {savingSettings ? "Saving..." : "Save Billing Identity"}
                    </Button>
                </div>
            </div>
                </TabsContent>

                <TabsContent value="cycles">
            <div className="flex flex-col gap-4 md:flex-row">
                <div className="w-full shrink-0 md:w-80">
                    <h2 className="mb-2 text-sm font-bold">Cycles</h2>
                    {loadingCycles ? (
                        <TableSkeleton rows={4} columns={1} />
                    ) : cycles.length === 0 ? (
                        <EmptyState title="No cycles yet" description="Generate the first payout cycle above." />
                    ) : (
                        <div className="space-y-2">
                            {cycles.map((cycle) => (
                                <button
                                    key={cycle.id}
                                    type="button"
                                    onClick={() => handleSelectCycle(cycle.id)}
                                    className={cn(
                                        "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        selectedCycleId === cycle.id ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:bg-accent/50"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold">{cycle.cycleLabel}</span>
                                        <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                                            {cycle.status}
                                        </Badge>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    {!selectedCycleId ? (
                        <EmptyState title="Select a cycle" description="Pick a cycle on the left to review partner payouts." />
                    ) : (
                        <>
                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="text-sm font-bold">Payouts</h2>
                                <div className="flex flex-wrap items-center gap-2">
                                    <QueueExportButton
                                        moduleName="PAYOUTS"
                                        filters={{ exportScope: "CYCLE_FINANCE", payoutCycleId: selectedCycleId }}
                                        label="Export CSV"
                                        size="sm"
                                        variant="ghost"
                                        disabled={!selectedCycleId}
                                    />
                                    <Button variant="ghost" size="sm" onClick={handleCompute} disabled={computing}>
                                        <RefreshCw className="size-4" />
                                        {computing ? "Computing..." : "Recompute from ledger"}
                                    </Button>
                                </div>
                            </div>

                            {loadingPayouts ? (
                                <TableSkeleton rows={4} columns={3} />
                            ) : payouts.length === 0 ? (
                                <EmptyState title="No payouts yet" description="Click 'Recompute from ledger' to sum commission earned in this cycle's date range." />
                            ) : (
                                <div className="space-y-3">
                                    {payouts.map((payout) => (
                                        <div key={payout.id} className="rounded-[14px] border bg-card p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-bold">
                                                        {payout.partner?.legalBusinessName || payout.partner?.name || payout.partnerId}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{payout.partner?.email}</p>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2.5">
                                                    <span className="text-sm font-bold">
                                                        ₹{payout.totalCommissionAmount.toLocaleString()}
                                                    </span>
                                                    <Badge variant="outline" className={cn("rounded-md text-[0.65rem] font-semibold", STATUS_BADGE_CLASSNAMES[payout.status])}>
                                                        {payout.status}
                                                    </Badge>
                                                    {payout.isHeld && (
                                                        <Badge variant="outline" className="rounded-md border-destructive/20 bg-destructive/10 text-[0.65rem] font-semibold text-destructive">
                                                            HELD
                                                        </Badge>
                                                    )}
                                                    {!payout.isHeld && payout.status === "DRAFT" && (
                                                        <Button size="sm" variant="outline" onClick={() => handleApprove(payout.id)}>Approve</Button>
                                                    )}
                                                    {!payout.isHeld && (payout.status === "DRAFT" || payout.status === "APPROVED") && (
                                                        <Button size="sm" variant="ghost" onClick={() => {
                                                            setAdjustmentTarget(payout);
                                                            setAdjustmentReason(settings.adjustmentReasons?.[0] ?? "");
                                                        }}>
                                                            <CircleDollarSign className="size-4" />
                                                            Adjust
                                                        </Button>
                                                    )}
                                                    {!payout.isHeld && payout.status === "APPROVED" && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleGenerateInvoice(payout.id)}
                                                            disabled={generatingInvoiceFor === payout.id}
                                                        >
                                                            <Receipt className="size-4" />
                                                            {generatingInvoiceFor === payout.id ? "Generating..." : "Generate Invoice"}
                                                        </Button>
                                                    )}
                                                    {payout.isHeld ? (
                                                        <Button size="sm" variant="outline" onClick={() => handleReleaseHold(payout.id)}>Release Hold</Button>
                                                    ) : payout.status !== "PAID" ? (
                                                        <Button size="sm" variant="ghost" onClick={() => {
                                                            setHoldTarget(payout);
                                                            setHoldReason(settings.holdReasons?.[0] ?? "");
                                                        }}>
                                                            <PauseCircle className="size-4" />
                                                            Hold
                                                        </Button>
                                                    ) : null}
                                                    {payout.invoiceId && (
                                                        <Button size="sm" variant="ghost" asChild>
                                                            <a href={`/api/partner-invoices/${payout.invoiceId}/pdf`} target="_blank" rel="noreferrer">
                                                                <Download className="size-4" />
                                                                Invoice
                                                            </a>
                                                        </Button>
                                                    )}
                                                    {(payout.status === "APPROVED" || payout.status === "INVOICED") && (
                                                        <Button size="sm" onClick={() => setMarkPaidTarget(payout)} disabled={payout.isHeld}>Mark Paid</Button>
                                                    )}
                                                    {payout.status === "PAID" && payout.paymentReference && (
                                                        <span className="text-xs text-muted-foreground">Ref: {payout.paymentReference}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {payout.isHeld && payout.holdReason ? (
                                                <p className="mt-2 text-xs text-destructive">Hold reason: {payout.holdReason}</p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
                </TabsContent>
            </Tabs>

            <StandardDialog
                open={!!markPaidTarget}
                onClose={() => setMarkPaidTarget(null)}
                title="Mark Payout as Paid"
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setMarkPaidTarget(null)}>Cancel</Button>
                        <Button onClick={handleMarkPaid} disabled={!paymentReference.trim()}>Confirm</Button>
                    </>
                }
            >
                <div className="space-y-2">
                    <Label>Payment Reference / UTR</Label>
                    <Input
                        placeholder="Enter the bank transfer reference"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                    />
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!holdTarget}
                onClose={() => setHoldTarget(null)}
                title="Place Payout on Hold"
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setHoldTarget(null)}>Cancel</Button>
                        <Button onClick={handleHoldPayout} disabled={!holdReason.trim()}>Hold Payout</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label>Hold Reason</Label>
                        <Select value={holdReason || "__custom__"} onValueChange={(value) => setHoldReason(value === "__custom__" ? "" : value)}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                                {(settings.holdReasons ?? []).map((reason) => (
                                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                ))}
                                <SelectItem value="__custom__">Custom reason</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Input
                        placeholder="Custom hold reason"
                        value={holdReason}
                        onChange={(e) => setHoldReason(e.target.value)}
                    />
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!adjustmentTarget}
                onClose={() => setAdjustmentTarget(null)}
                title="Create Payout Adjustment"
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setAdjustmentTarget(null)}>Cancel</Button>
                        <Button onClick={handleCreateAdjustment} disabled={!adjustmentReason.trim() || !(Number(adjustmentAmount) > 0)}>
                            Create Adjustment
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Direction</Label>
                            <Select value={adjustmentDirection} onValueChange={(value) => setAdjustmentDirection(value as "CREDIT" | "DEBIT")}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CREDIT">Credit partner</SelectItem>
                                    <SelectItem value="DEBIT">Debit partner</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Amount</Label>
                            <Input type="number" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Reason</Label>
                        <Select value={adjustmentReason || "__custom__"} onValueChange={(value) => setAdjustmentReason(value === "__custom__" ? "" : value)}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Select reason" /></SelectTrigger>
                            <SelectContent>
                                {(settings.adjustmentReasons ?? []).map((reason) => (
                                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                ))}
                                <SelectItem value="__custom__">Custom reason</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Input placeholder="Custom reason" value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} />
                    <Input placeholder="Notes (optional)" value={adjustmentNotes} onChange={(e) => setAdjustmentNotes(e.target.value)} />
                </div>
            </StandardDialog>
        </div>
    );
}

function TargetChecklist({
    title,
    items,
    selected,
    onToggle,
}: {
    title: string;
    items: TargetOption[];
    selected: string[];
    onToggle: (id: string, checked: boolean) => void;
}) {
    return (
        <div className="rounded-xl border bg-surface-container-low p-3">
            <div className="mb-2 text-xs font-bold uppercase text-muted-foreground">{title}</div>
            <div className="max-h-56 space-y-2 overflow-auto pr-1">
                {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No options found.</p>
                ) : items.map((item) => {
                    const label = item.name || item.legalBusinessName || item.email || item.id;
                    return (
                        <label key={item.id} className="flex items-start gap-2 rounded-lg bg-card p-2 text-sm">
                            <Checkbox
                                checked={selected.includes(item.id)}
                                onCheckedChange={(checked) => onToggle(item.id, checked === true)}
                            />
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{label}</span>
                                {item.email ? <span className="block truncate text-xs text-muted-foreground">{item.email}</span> : null}
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

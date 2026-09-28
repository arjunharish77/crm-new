"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Plus, RefreshCw, Download, Receipt, CalendarDays, FileText, Building2, ShieldCheck, PauseCircle, CircleDollarSign, FileWarning, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { useFeature } from "@/components/auth/feature-gate";
import { formatWorkspaceDateTime } from "@/lib/date-format";

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

type PayoutDispute = {
    id: string;
    payoutId: string;
    reason: string;
    status: "OPEN" | "RESOLVED" | "DISMISSED";
    resolutionNotes: string | null;
    createdAt: string;
    partner: { name?: string; email?: string } | null;
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
    const payoutsEnabled = useFeature("payoutsEnabled");
    const [settings, setSettings] = useState<PayoutSettings>(DEFAULT_SETTINGS);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    const [cycles, setCycles] = useState<PayoutCycle[]>([]);
    const [loadingCycles, setLoadingCycles] = useState(true);
    const [generating, setGenerating] = useState(false);

    const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [loadingPayouts, setLoadingPayouts] = useState(false);
    const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
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

    const [targetsError, setTargetsError] = useState(false);
    const [targetsLoaded, setTargetsLoaded] = useState(false);
    const [settingsError, setSettingsError] = useState(false);
    const [cyclesError, setCyclesError] = useState(false);
    const [payoutsError, setPayoutsError] = useState(false);
    const [disputesError, setDisputesError] = useState(false);
    const payoutRequestVersion = useRef(0);

    const fetchSettings = useCallback(async () => {
        setSettingsLoaded(false);
        setSettingsError(false);
        try {
            const data = await apiFetch<Partial<PayoutSettings> | null>("/payout-settings");
            if (data) setSettings((s) => ({ ...s, ...data }));
            setSettingsLoaded(true);
        } catch {
            setSettingsError(true);
        }
    }, []);

    const fetchCycles = useCallback(async () => {
        setLoadingCycles(true);
        setCyclesError(false);
        try {
            const data = await apiFetch<PayoutCycle[]>("/payout-cycles");
            setCycles(Array.isArray(data) ? data : []);
        } catch {
            setCyclesError(true);
        } finally {
            setLoadingCycles(false);
        }
    }, []);

    const [disputes, setDisputes] = useState<PayoutDispute[]>([]);
    const [loadingDisputes, setLoadingDisputes] = useState(false);
    const [resolvingDispute, setResolvingDispute] = useState<string | null>(null);

    const fetchDisputes = useCallback(async () => {
        setLoadingDisputes(true);
        setDisputesError(false);
        try {
            const data = await apiFetch<PayoutDispute[]>("/payout-disputes?status=OPEN");
            setDisputes(Array.isArray(data) ? data : []);
        } catch {
            setDisputesError(true);
        } finally {
            setLoadingDisputes(false);
        }
    }, []);

    const handleResolveDispute = async (disputeId: string, status: "RESOLVED" | "DISMISSED") => {
        const notes = window.prompt(status === "RESOLVED" ? "Resolution notes (optional):" : "Dismissal notes (optional):");
        if (notes === null) return;
        setResolvingDispute(disputeId);
        try {
            await apiFetch(`/payout-disputes/${disputeId}`, {
                method: "PATCH",
                body: JSON.stringify({ status, resolutionNotes: notes }),
            });
            toast.success(status === "RESOLVED" ? "Dispute resolved" : "Dispute dismissed");
            fetchDisputes();
        } catch (error: any) {
            toast.error(error.message || "Failed to update dispute");
        } finally {
            setResolvingDispute(null);
        }
    };

    useEffect(() => {
        fetchSettings();
        fetchCycles();
        fetchDisputes();
    }, [fetchSettings, fetchCycles, fetchDisputes]);

    const fetchTargets = useCallback(async () => {
        setTargetsError(false);
        setTargetsLoaded(false);
        return Promise.all([
            apiFetch<TargetOption[]>("/users"),
            apiFetch<TargetOption[]>("/teams"),
            apiFetch<TargetOption[]>("/sales-groups"),
            apiFetch<TargetOption[]>("/partners"),
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
            setTargetsLoaded(true);
        }).catch(() => setTargetsError(true));
    }, []);

    useEffect(() => { fetchTargets(); }, [fetchTargets]);

    const fetchPayouts = useCallback(async (cycleId: string) => {
        const version = ++payoutRequestVersion.current;
        setLoadingPayouts(true);
        setPayoutsError(false);
        setSelectedPayoutIds([]);
        try {
            const data = await apiFetch<Payout[]>(`/payout-cycles/${cycleId}/payouts`);
            if (version === payoutRequestVersion.current) setPayouts(Array.isArray(data) ? data : []);
        } catch {
            if (version === payoutRequestVersion.current) setPayoutsError(true);
        } finally {
            if (version === payoutRequestVersion.current) setLoadingPayouts(false);
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

    // Bulk approve -- only meaningful for DRAFT, non-held payouts (the same eligibility the
    // single-row Approve button already enforces). Ineligible selections are silently
    // skipped rather than erroring the whole batch, and each approval is independent so one
    // failure (e.g. below-minimum threshold) doesn't block the rest.
    const handleBulkApprove = async () => {
        const eligible = payouts.filter((payout) => selectedPayoutIds.includes(payout.id) && !payout.isHeld && payout.status === "DRAFT");
        if (eligible.length === 0) {
            toast.error("No selected payouts are eligible for approval");
            return;
        }
        let approved = 0;
        let failed = 0;
        for (const payout of eligible) {
            try {
                await apiFetch(`/payouts/${payout.id}/approve`, { method: "POST" });
                approved += 1;
            } catch {
                failed += 1;
            }
        }
        toast.success(`${approved} payout${approved === 1 ? "" : "s"} approved${failed ? `, ${failed} failed` : ""}`);
        setSelectedPayoutIds([]);
        if (selectedCycleId) fetchPayouts(selectedCycleId);
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

    const [reissueTarget, setReissueTarget] = useState<Payout | null>(null);
    const [reissueReason, setReissueReason] = useState("");
    const [reissuing, setReissuing] = useState(false);
    const handleReissueInvoice = async () => {
        if (!reissueTarget?.invoiceId) return;
        setReissuing(true);
        try {
            await apiFetch(`/partner-invoices/${reissueTarget.invoiceId}/reissue`, {
                method: "POST",
                body: JSON.stringify({ reason: reissueReason }),
            });
            toast.success("Invoice cancelled and reissued");
            setReissueTarget(null);
            setReissueReason("");
            if (selectedCycleId) fetchPayouts(selectedCycleId);
        } catch (error: any) {
            toast.error(error.message || "Failed to reissue invoice");
        } finally {
            setReissuing(false);
        }
    };

    if (!payoutsEnabled) {
        return (
            <div className="@container/payouts min-w-0">
                <EmptyState title="Payouts isn't enabled" description="Enable the Payouts feature flag for this tenant to configure cycles, commission, and invoicing." />
            </div>
        );
    }

    if (settingsError) return <div className="min-w-0"><PageHeader title="Payout Cycles" /><ErrorState description="Payout settings could not be loaded." onRetry={fetchSettings} /></div>;
    if (!settingsLoaded) return <div className="min-w-0"><PageHeader title="Payout Cycles" /><TableSkeleton rows={4} columns={2} /></div>;

    return (
        <div className="@container/payouts min-w-0">
            <PageHeader title="Payout Cycles" description="Configure payout periods, review partner payouts and manage disputes." />
            {targetsError && <ErrorState description="Payout visibility options could not be loaded. Saving is unavailable until they load." onRetry={fetchTargets} />}
            <Tabs defaultValue="configuration" className="mt-4 space-y-4">
                <div className="overflow-x-auto pb-1">
                    <TabsList className="h-10 min-w-max">
                        <TabsTrigger value="configuration">Configuration</TabsTrigger>
                        <TabsTrigger value="visibility">Visibility</TabsTrigger>
                        <TabsTrigger value="billing">Billing Identity</TabsTrigger>
                        <TabsTrigger value="cycles">Cycles & Payouts</TabsTrigger>
                        <TabsTrigger value="disputes">
                            Disputes{disputes.length > 0 ? ` (${disputes.length})` : ""}
                        </TabsTrigger>
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
                            <Label htmlFor="payout-field-1">Frequency</Label>
                            <Select
                                disabled={!settingsLoaded}
                                value={settings.cycleFrequency}
                                onValueChange={(v) => setSettings((s) => ({ ...s, cycleFrequency: v as PayoutSettings["cycleFrequency"] }))}
                            >
                                <SelectTrigger id="payout-field-1" className="w-full">
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
                            <Label htmlFor="payout-field-2">Anchor Day</Label>
                            <Select
                                disabled={!settingsLoaded}
                                value={String(settings.cycleAnchorDay ?? 1)}
                                onValueChange={(value) => setSettings((s) => ({ ...s, cycleAnchorDay: Number(value) }))}
                            >
                                <SelectTrigger id="payout-field-2" className="w-full">
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
                                <Label htmlFor="payout-field-3">Custom Interval</Label>
                                <Select
                                    value={String(settings.customIntervalDays ?? 30)}
                                    onValueChange={(value) => setSettings((s) => ({ ...s, customIntervalDays: Number(value) }))}
                                >
                                    <SelectTrigger id="payout-field-3" className="w-full">
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
                        <Button onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded || !targetsLoaded}>
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
                    <div className="grid gap-4 @min-[850px]/payouts:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="payout-field-4">Default HSN/SAC Code</Label>
                            <Input id="payout-field-4"
                                value={settings.defaultHsnSacCode}
                                onChange={(e) => setSettings((s) => ({ ...s, defaultHsnSacCode: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payout-field-5">GST Rate (%)</Label>
                            <Select
                                value={String(settings.gstRatePercent)}
                                onValueChange={(value) => setSettings((s) => ({ ...s, gstRatePercent: Number(value) }))}
                            >
                                <SelectTrigger id="payout-field-5" className="w-full">
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
                            <Label htmlFor="payout-field-6">Invoice Number Pattern</Label>
                            <Select
                                value={settings.invoiceNumberPattern}
                                onValueChange={(value) => setSettings((s) => ({ ...s, invoiceNumberPattern: value }))}
                            >
                                <SelectTrigger id="payout-field-6" className="w-full">
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
                    <Button className="mt-4" onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded || !targetsLoaded}>
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
                <div className="grid gap-4 @min-[1000px]/payouts:grid-cols-4">
                    <div className="space-y-2">
                        <Label htmlFor="payout-field-7">Minimum Payout Amount</Label>
                        <Input id="payout-field-7"
                            type="number"
                            value={settings.minimumPayoutAmount}
                            onChange={(e) => setSettings((s) => ({ ...s, minimumPayoutAmount: Number(e.target.value) || 0 }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="payout-field-8">Approval Mode</Label>
                        <Select
                            value={settings.approvalMode}
                            onValueChange={(value) => setSettings((s) => ({ ...s, approvalMode: value as PayoutSettings["approvalMode"] }))}
                        >
                            <SelectTrigger id="payout-field-8" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MANUAL">Manual approval</SelectItem>
                                <SelectItem value="AUTO_BELOW_THRESHOLD">Auto below threshold</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="payout-field-9">Auto-Approve Below</Label>
                        <Input id="payout-field-9"
                            type="number"
                            value={settings.autoApproveBelowAmount ?? ""}
                            onChange={(e) => setSettings((s) => ({ ...s, autoApproveBelowAmount: e.target.value ? Number(e.target.value) : null }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="payout-field-10">Hold Reasons</Label>
                        <Input id="payout-field-10"
                            value={(settings.holdReasons ?? []).join(", ")}
                            onChange={(e) => setSettings((s) => ({ ...s, holdReasons: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))}
                        />
                    </div>
                </div>
                <div className="mt-4 grid gap-4 @min-[850px]/payouts:grid-cols-3">
                    <label className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface-container-low p-3">
                        <span className="text-sm font-semibold">Require invoice before payment</span>
                        <Switch
                            checked={settings.requireInvoiceBeforePayment}
                            onCheckedChange={(checked) => setSettings((s) => ({ ...s, requireInvoiceBeforePayment: checked }))}
                        />
                    </label>
                    <label className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface-container-low p-3">
                        <span className="text-sm font-semibold">Allow partner self-invoice</span>
                        <Switch
                            checked={settings.allowPartnerSelfInvoice}
                            onCheckedChange={(checked) => setSettings((s) => ({ ...s, allowPartnerSelfInvoice: checked }))}
                        />
                    </label>
                    <div className="space-y-2">
                        <Label htmlFor="payout-field-11">Adjustment Reasons</Label>
                        <Input id="payout-field-11"
                            value={(settings.adjustmentReasons ?? []).join(", ")}
                            onChange={(e) => setSettings((s) => ({ ...s, adjustmentReasons: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))}
                        />
                    </div>
                </div>
                <Button className="mt-4" onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded || !targetsLoaded}>
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
                    <Label htmlFor="payout-field-12">Visibility Mode</Label>
                    <Select
                        value={settings.payoutVisibilityConfig?.mode ?? "ALL_PARTNERS"}
                        onValueChange={(value) => setSettings((current) => ({
                            ...current,
                            payoutVisibilityConfig: { ...(current.payoutVisibilityConfig ?? DEFAULT_SETTINGS.payoutVisibilityConfig), mode: value as "ALL_PARTNERS" | "SELECTED" },
                        }))}
                    >
                        <SelectTrigger id="payout-field-12" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL_PARTNERS">All active partners</SelectItem>
                            <SelectItem value="SELECTED">Selected users, teams, groups, and partner orgs</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {settings.payoutVisibilityConfig?.mode === "SELECTED" ? (
                    <div className="mt-4 grid gap-4 @min-[1000px]/payouts:grid-cols-2">
                        <TargetChecklist title="Users" items={users} selected={settings.payoutVisibilityConfig.userIds} onToggle={(id, checked) => toggleVisibilityTarget("userIds", id, checked)} />
                        <TargetChecklist title="Teams" items={teams} selected={settings.payoutVisibilityConfig.teamIds} onToggle={(id, checked) => toggleVisibilityTarget("teamIds", id, checked)} />
                        <TargetChecklist title="Sales Groups" items={salesGroups} selected={settings.payoutVisibilityConfig.salesGroupIds} onToggle={(id, checked) => toggleVisibilityTarget("salesGroupIds", id, checked)} />
                        <TargetChecklist title="Partner Organizations" items={partnerOrgs} selected={settings.payoutVisibilityConfig.partnerOrganizationIds} onToggle={(id, checked) => toggleVisibilityTarget("partnerOrganizationIds", id, checked)} />
                    </div>
                ) : null}
                <Button className="mt-4" onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded || !targetsLoaded}>
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
                    <div className="grid gap-4 @min-[850px]/payouts:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="payout-field-13">Company Legal Name</Label>
                            <Input id="payout-field-13"
                                value={settings.companyLegalName}
                                onChange={(e) => setSettings((s) => ({ ...s, companyLegalName: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payout-field-14">Company GSTIN</Label>
                            <Input id="payout-field-14"
                                value={settings.companyGstin}
                                onChange={(e) => setSettings((s) => ({ ...s, companyGstin: e.target.value.toUpperCase() }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payout-field-15">Company State</Label>
                            <Select
                                value={settings.companyState || "__none__"}
                                onValueChange={(value) => setSettings((s) => ({ ...s, companyState: value === "__none__" ? "" : value }))}
                            >
                                <SelectTrigger id="payout-field-15" className="w-full">
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
                    <div className="grid gap-4 @min-[1000px]/payouts:grid-cols-4">
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="payout-field-16">Address Line 1</Label>
                            <Input id="payout-field-16"
                                value={settings.companyAddress?.line1 ?? ""}
                                onChange={(e) => updateCompanyAddress({ line1: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="payout-field-17">Address Line 2</Label>
                            <Input id="payout-field-17"
                                value={settings.companyAddress?.line2 ?? ""}
                                onChange={(e) => updateCompanyAddress({ line2: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="payout-field-18">City</Label>
                            <Input id="payout-field-18"
                                value={settings.companyAddress?.city ?? ""}
                                onChange={(e) => updateCompanyAddress({ city: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="payout-field-19">Postal Code</Label>
                            <Input id="payout-field-19"
                                value={settings.companyAddress?.postalCode ?? ""}
                                onChange={(e) => updateCompanyAddress({ postalCode: e.target.value })}
                            />
                        </div>
                    </div>
                    <Button onClick={handleSaveSettings} disabled={savingSettings || !settingsLoaded || !targetsLoaded}>
                        {savingSettings ? "Saving..." : "Save Billing Identity"}
                    </Button>
                </div>
            </div>
                </TabsContent>

                <TabsContent value="cycles">
            <div className="flex flex-col gap-4 @min-[1000px]/payouts:flex-row">
                <div className="w-full min-w-0 shrink-0 @min-[1000px]/payouts:w-72">
                    <h2 className="mb-2 text-sm font-bold">Cycles</h2>
                    {cyclesError ? <ErrorState description="Payout cycles could not be loaded." onRetry={fetchCycles} /> : loadingCycles ? (
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
                                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <span className="min-w-0 break-words text-sm font-semibold">{cycle.cycleLabel}</span>
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
                        <EmptyState title="Select a cycle" description="Pick a cycle to review partner payouts." />
                    ) : (
                        <>
                            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                                <h2 className="text-sm font-bold">Payouts</h2>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
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

                            {payoutsError ? <ErrorState description="Cycle payouts could not be loaded." onRetry={() => selectedCycleId && fetchPayouts(selectedCycleId)} /> : loadingPayouts ? (
                                <TableSkeleton rows={4} columns={3} />
                            ) : payouts.length === 0 ? (
                                <EmptyState title="No payouts yet" description="Click 'Recompute from ledger' to sum commission earned in this cycle's date range." />
                            ) : (
                                <div className="space-y-3">
                                    {payouts.map((payout) => (
                                        <div key={payout.id} className="rounded-[14px] border bg-card p-4">
                                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                                                <div className="flex min-w-0 flex-wrap items-center gap-3">
                                                    <Checkbox
                                                        checked={selectedPayoutIds.includes(payout.id)}
                                                        onCheckedChange={(checked) => {
                                                            setSelectedPayoutIds((prev) =>
                                                                checked ? [...prev, payout.id] : prev.filter((id) => id !== payout.id)
                                                            );
                                                        }}
                                                        aria-label={`Select payout for ${payout.partner?.legalBusinessName || payout.partner?.name || payout.partnerId}`}
                                                    />
                                                    <div className="min-w-0 flex-1 basis-48 break-words">
                                                        <p className="text-sm font-bold">
                                                            {payout.partner?.legalBusinessName || payout.partner?.name || payout.partnerId}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">{payout.partner?.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
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
                                                    {payout.invoiceId && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setReissueTarget(payout);
                                                                setReissueReason("");
                                                            }}
                                                        >
                                                            <FileWarning className="size-4" />
                                                            Cancel & Reissue
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

                <TabsContent value="disputes">
                    <div className="rounded-[14px] border bg-card p-4">
                        <div className="mb-4 flex items-start gap-3">
                            <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
                                <MessageSquareWarning className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold">Open Payout Disputes</h2>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Raised by partners from their payout details view. Resolve or dismiss once reviewed.
                                </p>
                            </div>
                        </div>
                        {disputesError ? <ErrorState description="Payout disputes could not be loaded." onRetry={fetchDisputes} /> : loadingDisputes ? (
                            <TableSkeleton rows={3} columns={2} />
                        ) : disputes.length === 0 ? (
                            <EmptyState title="No open disputes" description="Partner-raised payout disputes will show up here." />
                        ) : (
                            <div className="space-y-3">
                                {disputes.map((dispute) => (
                                    <div key={dispute.id} className="rounded-xl border bg-surface-container-low p-3">
                                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold">{dispute.partner?.name || dispute.partner?.email || "Unknown partner"}</p>
                                                <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(dispute.createdAt)}</p>
                                            </div>
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={resolvingDispute === dispute.id}
                                                    onClick={() => handleResolveDispute(dispute.id, "DISMISSED")}
                                                >
                                                    Dismiss
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    disabled={resolvingDispute === dispute.id}
                                                    onClick={() => handleResolveDispute(dispute.id, "RESOLVED")}
                                                >
                                                    Mark Resolved
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="mt-2 text-sm">{dispute.reason}</p>
                                    </div>
                                ))}
                            </div>
                        )}
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
                    <Label htmlFor="payout-field-20">Payment Reference / UTR</Label>
                    <Input id="payout-field-20"
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
                        <Label htmlFor="payout-field-21">Hold Reason</Label>
                        <Select value={holdReason || "__custom__"} onValueChange={(value) => setHoldReason(value === "__custom__" ? "" : value)}>
                            <SelectTrigger id="payout-field-21" className="w-full">
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
                            <Label htmlFor="payout-field-22">Direction</Label>
                            <Select value={adjustmentDirection} onValueChange={(value) => setAdjustmentDirection(value as "CREDIT" | "DEBIT")}>
                                <SelectTrigger id="payout-field-22" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CREDIT">Credit partner</SelectItem>
                                    <SelectItem value="DEBIT">Debit partner</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payout-field-23">Amount</Label>
                            <Input id="payout-field-23" type="number" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="payout-field-24">Reason</Label>
                        <Select value={adjustmentReason || "__custom__"} onValueChange={(value) => setAdjustmentReason(value === "__custom__" ? "" : value)}>
                            <SelectTrigger id="payout-field-24" className="w-full"><SelectValue placeholder="Select reason" /></SelectTrigger>
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

            <StandardDialog
                open={!!reissueTarget}
                onClose={() => setReissueTarget(null)}
                title="Cancel & Reissue Invoice"
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setReissueTarget(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleReissueInvoice} disabled={!reissueReason.trim() || reissuing}>
                            {reissuing ? "Reissuing..." : "Cancel & Reissue"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        This cancels the current invoice (kept for audit history, marked CANCELLED) and immediately
                        generates a fresh invoice with a new number against the same payout. Use this for a
                        credit-note style correction — e.g. wrong GST/company details — not for a commission amount
                        change (use Adjust for that).
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="payout-field-25">Reason</Label>
                        <Input id="payout-field-25"
                            placeholder="e.g. Incorrect GSTIN on original invoice"
                            value={reissueReason}
                            onChange={(e) => setReissueReason(e.target.value)}
                        />
                    </div>
                </div>
            </StandardDialog>

            <BulkActionsToolbar
                selectedCount={selectedPayoutIds.length}
                onClearSelection={() => setSelectedPayoutIds([])}
                module="payouts"
                onApprove={handleBulkApprove}
            />
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

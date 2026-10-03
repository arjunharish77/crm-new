"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsSections } from "@/components/layout/settings-sections";
import { CalendarDays, FileText, Building2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { useFeature } from "@/components/auth/feature-gate";

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

export default function PayoutCyclesPage() {
    const payoutsEnabled = useFeature("payoutsEnabled");
    const [settings, setSettings] = useState<PayoutSettings>(DEFAULT_SETTINGS);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    const [users, setUsers] = useState<TargetOption[]>([]);
    const [teams, setTeams] = useState<TargetOption[]>([]);
    const [salesGroups, setSalesGroups] = useState<TargetOption[]>([]);
    const [partnerOrgs, setPartnerOrgs] = useState<TargetOption[]>([]);

    const [targetsError, setTargetsError] = useState(false);
    const [targetsLoaded, setTargetsLoaded] = useState(false);
    const [settingsError, setSettingsError] = useState(false);

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

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

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

    if (!payoutsEnabled) {
        return (
            <div className="@container/payouts min-w-0">
                <EmptyState title="Payouts isn't enabled" description="Enable the Payouts feature flag for this tenant to configure cycles, commission, and invoicing." />
            </div>
        );
    }

    if (settingsError) return <div className="min-w-0"><PageHeader title="Payout rules" /><ErrorState description="Payout settings could not be loaded." onRetry={fetchSettings} /></div>;
    if (!settingsLoaded) return <div className="min-w-0"><PageHeader title="Payout rules" /><TableSkeleton rows={4} columns={2} /></div>;

    return (
        <div className="@container/payouts min-w-0">
            <PageHeader
                title="Payout rules"
                description="Cycle length, tax and invoices, approvals, who sees payouts, and your billing identity."
                secondaryActions={<Button variant="outline" asChild><Link href="/dashboard/payouts">Open Payouts</Link></Button>}
            />
            {targetsError && <ErrorState description="Payout visibility options could not be loaded. Saving is unavailable until they load." onRetry={fetchTargets} />}
            <div className="mt-4">
            <SettingsSections
                label="Payout rules"
                sections={[
                    { id: "cycle-rules", label: "Cycle rules", content: (
                        <>
                <div className="rounded-xl border bg-card p-4">
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
                    </div>
                </div>
                        </>
                    ) },
                    { id: "tax-invoice", label: "Tax and invoices", content: (
                        <>
                <div className="rounded-xl border bg-card p-4">
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
                        </>
                    ) },
                    { id: "finance-controls", label: "Approvals and finance controls", content: (
                        <>
            <div className="rounded-xl border bg-card p-4">
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
                        </>
                    ) },
                    { id: "visibility", label: "Who sees payouts", content: (
                        <>
            <div className="rounded-xl border bg-card p-4">
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
                        </>
                    ) },
                    { id: "billing", label: "Billing identity", content: (
                        <>
            <div className="rounded-xl border bg-card p-4">
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
                        </>
                    ) },
                ]}
            />
            </div>

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

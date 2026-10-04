"use client";
import { useAskText, useConfirm } from "@/components/common/dialogs-provider";
import { MODULE_COVERAGE_NOTES } from "@/lib/tenant-provisioning";
import { dependencyViolations, moduleChangeBlockedReason, requiredModules } from "@/lib/module-dependencies";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SettingsSections } from "@/components/layout/settings-sections";
import { ErrorState } from "@/components/common/error-state";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatWorkspaceDate, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { ArrowLeft, UserCog, Activity, Users, Flag, LayoutGrid, ShieldOff, ShieldCheck, Wrench, FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";
import { StandardDialog } from "@/components/common/standard-dialog";
import { TenantUsageLimits } from "@/components/admin/tenant-usage-limits";
import { ModuleHealthBadge, ModuleHealthIssues, healthWorthShowing, type ModuleHealth } from "@/components/admin/module-health";

type ModuleEntitlement = {
    key: string;
    name: string;
    category: string;
    isCore: boolean;
    status: "ENABLED" | "DISABLED" | "SUSPENDED" | "TRIAL";
    trialEndsAt?: string | null;
    pausedCount?: number;
};

type ModuleAccessRequest = {
    id: string;
    moduleKey: string;
    moduleName: string;
    message: string | null;
    createdAt: string;
    requestedByName: string | null;
    requestedByEmail: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const dateInputValue = (date: Date) => date.toISOString().slice(0, 10);
// End of the chosen day in the admin's browser time zone.
const trialEndIso = (value: string) => new Date(`${value}T23:59:59`).toISOString();

const MODULE_STATUS_BADGE: Record<ModuleEntitlement["status"], string> = {
    ENABLED: "border-primary/20 bg-primary/10 text-primary",
    TRIAL: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    SUSPENDED: "border-destructive/20 bg-destructive/10 text-destructive",
    DISABLED: "border-border bg-muted text-muted-foreground",
};

type TenantFeatureFlags = {
    opportunityEnabled: boolean;
    automationEnabled: boolean;
    salesGroupsEnabled: boolean;
    formBuilderEnabled: boolean;
    advancedReporting: boolean;
    apiAccessEnabled: boolean;
    payoutsEnabled: boolean;
    gamificationEnabled: boolean;
};

// Only the flags that aren't modules (decision 15). Opportunities, Automations, Forms, Advanced
// reporting, Payouts and Gamification are switched in Modules.
const FEATURE_FLAG_LABELS: Partial<Record<keyof TenantFeatureFlags, string>> = {
    apiAccessEnabled: "API access",
    salesGroupsEnabled: "Sales groups",
};

export default function TenantDetailPage() {
    const confirm = useConfirm();
    const askText = useAskText();
    const params = useParams();
    const router = useRouter();
    const { login } = useAuth();
    const tenantId = params.id as string;

    const [config, setConfig] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [featureFlags, setFeatureFlags] = useState<TenantFeatureFlags | null>(null);
    const [savingFlag, setSavingFlag] = useState<string | null>(null);
    const [modules, setModules] = useState<ModuleEntitlement[]>([]);
    const [savingModule, setSavingModule] = useState<string | null>(null);
    const [moduleChange, setModuleChange] = useState<{ module: ModuleEntitlement; status: ModuleEntitlement["status"] } | null>(null);
    const [moduleImpact, setModuleImpact] = useState<{ items: { label: string; count: number | null }[]; blockedReason: string | null } | null>(null);
    const [moduleImpactFailed, setModuleImpactFailed] = useState(false);
    const [moduleReason, setModuleReason] = useState("");
    const [moduleChangeError, setModuleChangeError] = useState("");
    const [moduleTrialEnd, setModuleTrialEnd] = useState("");
    const [accessRequests, setAccessRequests] = useState<ModuleAccessRequest[]>([]);
    const [moduleHealth, setModuleHealth] = useState<Record<string, ModuleHealth>>({});
    const [moduleHealthState, setModuleHealthState] = useState<"loading" | "ready" | "error">("loading");
    const [resolving, setResolving] = useState<{ request: ModuleAccessRequest; decision: "APPROVED" | "DECLINED" } | null>(null);
    const [resolveStatus, setResolveStatus] = useState<"ENABLED" | "TRIAL">("ENABLED");
    const [resolveTrialEnd, setResolveTrialEnd] = useState("");
    const [resolveNote, setResolveNote] = useState("");
    const [resolveError, setResolveError] = useState("");
    const [resolveSaving, setResolveSaving] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [savingEnvironment, setSavingEnvironment] = useState(false);
    const [maintenanceDraft, setMaintenanceDraft] = useState({ active: false, message: "" });
    const [savingMaintenance, setSavingMaintenance] = useState(false);
    const [impersonateTarget, setImpersonateTarget] = useState<{ id: string; email: string } | null>(null);
    const [impersonateReason, setImpersonateReason] = useState("");
    const [impersonating, setImpersonating] = useState(false);
    const [demoStatus, setDemoStatus] = useState<{ leadCount: number; opportunityCount: number } | null>(null);
    const [seedingDemo, setSeedingDemo] = useState(false);
    const [resettingDemo, setResettingDemo] = useState(false);

    // Pending requests are supplementary; a failure here must not hide the Modules section.
    const fetchAccessRequests = () => {
        apiFetch<ModuleAccessRequest[]>(`/platform-admin/module-requests?tenantId=${encodeURIComponent(String(tenantId))}&status=PENDING`)
            .then((rows) => setAccessRequests(Array.isArray(rows) ? rows : []))
            .catch(() => setAccessRequests([]));
    };

    // Health is computed live and supplementary: a failure shows a retry, never hides Modules.
    const fetchModuleHealth = () => {
        setModuleHealthState("loading");
        apiFetch<unknown>(`/platform-admin/tenants/${tenantId}/module-health`)
            .then((rows) => {
                if (!Array.isArray(rows)) throw new Error("Unexpected module health response");
                setModuleHealth(Object.fromEntries((rows as ModuleHealth[]).map((row) => [row.moduleKey, row])));
                setModuleHealthState("ready");
            })
            .catch(() => setModuleHealthState("error"));
    };

    const fetchModules = () => {
        apiFetch<ModuleEntitlement[]>(`/platform-admin/tenants/${tenantId}/modules`).then(setModules).catch(() => setLoadError(true));
        fetchAccessRequests();
        fetchModuleHealth();
    };

    const openResolve = (request: ModuleAccessRequest, decision: "APPROVED" | "DECLINED") => {
        setResolving({ request, decision });
        setResolveStatus("ENABLED");
        setResolveTrialEnd(dateInputValue(new Date(Date.now() + 14 * DAY_MS)));
        setResolveNote("");
        setResolveError("");
    };

    const confirmResolve = async () => {
        if (!resolving) return;
        setResolveSaving(true);
        setResolveError("");
        try {
            await apiFetch(`/platform-admin/module-requests/${resolving.request.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    decision: resolving.decision,
                    note: resolveNote.trim() || null,
                    ...(resolving.decision === "APPROVED" ? { status: resolveStatus, trialEndsAt: resolveStatus === "TRIAL" && resolveTrialEnd ? trialEndIso(resolveTrialEnd) : null } : {}),
                }),
            });
            toast.success(resolving.decision === "APPROVED" ? `${resolving.request.moduleName} approved` : "Request declined");
            setResolving(null);
            fetchModules();
        } catch (error: any) {
            setResolveError(error.message || "Failed to resolve the request");
        } finally {
            setResolveSaving(false);
        }
    };

    const fetchDemoStatus = () => {
        apiFetch<{ leadCount: number; opportunityCount: number }>(`/platform-admin/tenants/${tenantId}/demo-data`)
            .then(setDemoStatus)
            .catch(() => setLoadError(true));
    };

    const loadTenant = useCallback(() => {
        if (tenantId) {
            setLoading(true);
            setLoadError(false);
            Promise.all([
                apiFetch(`/platform-admin/tenants/${tenantId}/config`),
                apiFetch(`/platform-admin/tenants/${tenantId}/users`),
                apiFetch<TenantFeatureFlags>(`/platform-admin/tenants/${tenantId}/feature-flags`),
                apiFetch<ModuleEntitlement[]>(`/platform-admin/tenants/${tenantId}/modules`),
                apiFetch<{ leadCount: number; opportunityCount: number }>(`/platform-admin/tenants/${tenantId}/demo-data`),
            ]).then(([configData, usersData, flagsData, moduleData, demoData]: any[]) => {
                setConfig(configData);
                setMaintenanceDraft({ active: !!configData?.maintenanceActive, message: configData?.maintenanceMessage || "" });
                setUsers(usersData);
                setFeatureFlags(flagsData);
                setModules(moduleData);
                fetchAccessRequests();
                fetchModuleHealth();
                setDemoStatus(demoData);
            }).catch(() => setLoadError(true))
                .finally(() => setLoading(false));
        }
    }, [tenantId]);

    useEffect(() => { loadTenant(); }, [loadTenant]);

    const handleSeedDemoData = async () => {
        setSeedingDemo(true);
        try {
            const result = await apiFetch<{ leadsCreated: number; opportunitiesCreated: number; opportunitiesSkippedReason: string | null }>(
                `/platform-admin/tenants/${tenantId}/demo-data/seed`,
                { method: "POST" },
            );
            toast.success(`Seeded ${result.leadsCreated} demo leads and ${result.opportunitiesCreated} demo opportunities`);
            if (result.opportunitiesSkippedReason) toast.info(result.opportunitiesSkippedReason);
            fetchDemoStatus();
        } catch (error: any) {
            toast.error(error.message || "Failed to seed demo data");
        } finally {
            setSeedingDemo(false);
        }
    };

    const handleResetDemoData = async () => {
        if (!(await confirm({ title: "Delete this workspace's demo data?", description: "Only records added as demo data are removed. Real leads, opportunities and everything else are left alone.", confirmLabel: "Delete demo data", destructive: true }))) return;
        setResettingDemo(true);
        try {
            await apiFetch(`/platform-admin/tenants/${tenantId}/demo-data/reset`, { method: "POST" });
            toast.success("Demo data reset");
            fetchDemoStatus();
        } catch (error: any) {
            toast.error(error.message || "Failed to reset demo data");
        } finally {
            setResettingDemo(false);
        }
    };

    // Per-module state, the same rule the server uses for dependency checks (the status alone,
    // decision 15) -- see src/lib/module-dependencies.ts.
    const moduleNames = Object.fromEntries(modules.map((module) => [module.key, module.name]));
    const moduleName = (key: string) => moduleNames[key] ?? key;
    const moduleStates = Object.fromEntries(modules.map((module) => [module.key, module.status === "ENABLED" || module.status === "TRIAL"]));
    const dependencyWarnings = dependencyViolations(moduleStates, moduleName);

    const handleModuleStatusChange = async (module: ModuleEntitlement, status: ModuleEntitlement["status"]) => {
        if (status === module.status) return;
        setModuleChange({ module, status });
        const currentEnd = module.trialEndsAt ? new Date(module.trialEndsAt) : null;
        setModuleTrialEnd(dateInputValue(currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date(Date.now() + 14 * DAY_MS)));
        setModuleReason("");
        setModuleChangeError("");
        setModuleImpactFailed(false);
        const disabling = status === "DISABLED" || status === "SUSPENDED";
        if (!disabling) {
            setModuleImpact({ items: [], blockedReason: moduleChangeBlockedReason(moduleStates, module.key, true, moduleName) });
            return;
        }
        setModuleImpact(null);
        try {
            const impact: any = await apiFetch(`/platform-admin/tenants/${tenantId}/modules/${module.key}/impact`);
            setModuleImpact({
                items: Array.isArray(impact?.items) ? impact.items : [],
                blockedReason: typeof impact?.blockedReason === "string" ? impact.blockedReason : moduleChangeBlockedReason(moduleStates, module.key, false, moduleName),
            });
        } catch {
            // The preview is advisory; the server still enforces dependencies on save.
            setModuleImpactFailed(true);
            setModuleImpact({ items: [], blockedReason: moduleChangeBlockedReason(moduleStates, module.key, false, moduleName) });
        }
    };

    const confirmModuleStatusChange = async () => {
        if (!moduleChange) return;
        const { module, status } = moduleChange;
        setSavingModule(module.key);
        setModuleChangeError("");
        try {
            await apiFetch(`/platform-admin/tenants/${tenantId}/modules/${module.key}`, {
                method: "PATCH",
                body: JSON.stringify({ status, reason: moduleReason.trim() || null, trialEndsAt: status === "TRIAL" && moduleTrialEnd ? trialEndIso(moduleTrialEnd) : null }),
            });
            toast.success(`${module.name} set to ${status}`);
            setModuleChange(null);
            fetchModules();
        } catch (error: any) {
            // Keep the dialog (and the typed reason) open so the admin can read why and retry.
            setModuleChangeError(error.message || "Failed to update module status");
        } finally {
            setSavingModule(null);
        }
    };

    const handleToggleSuspend = async () => {
        const suspending = config.tenant.status !== "SUSPENDED";
        // A suspension needs a reason; both are recorded in the workspace's audit log (Section 8 #12).
        const reason = await askText(suspending
            ? { title: "Suspend this workspace?", description: "Everyone in it is signed out straight away and can't sign in until it is unsuspended. Their data is kept.", label: "Reason (kept in the workspace's audit log)", required: true, confirmLabel: "Suspend workspace", destructive: true, typedConfirmation: config.tenant.name }
            : { title: "Unsuspend this workspace?", description: "Its users can sign in again.", label: "Note (optional, kept in the workspace's audit log)", confirmLabel: "Unsuspend" });
        if (reason === null) return;
        setSavingStatus(true);
        try {
            const result = await apiFetch<{ pendingApproval?: boolean }>(`/platform-admin/tenants/${tenantId}/${suspending ? "suspend" : "unsuspend"}`, { method: "POST", body: JSON.stringify({ reason }) });
            if (result?.pendingApproval) {
                toast.success("Request submitted -- a different platform admin must approve it before this takes effect.");
                return;
            }
            setConfig({ ...config, tenant: { ...config.tenant, status: suspending ? "SUSPENDED" : "ACTIVE" } });
            toast.success(suspending ? "Tenant suspended" : "Tenant unsuspended");
        } catch (error: any) {
            toast.error(error.message || "Failed to update tenant status");
        } finally {
            setSavingStatus(false);
        }
    };

    const handleEnvironmentChange = async (environment: string) => {
        setSavingEnvironment(true);
        try {
            await apiFetch(`/platform-admin/tenants/${tenantId}/environment`, { method: "PATCH", body: JSON.stringify({ environment }) });
            setConfig({ ...config, tenant: { ...config.tenant, environment } });
            toast.success(`Environment set to ${environment}`);
        } catch (error: any) {
            toast.error(error.message || "Failed to update environment");
        } finally {
            setSavingEnvironment(false);
        }
    };

    const handleSaveMaintenance = async () => {
        setSavingMaintenance(true);
        try {
            await apiFetch(`/platform-admin/tenants/${tenantId}/maintenance`, {
                method: "PATCH",
                body: JSON.stringify({ active: maintenanceDraft.active, message: maintenanceDraft.message || null }),
            });
            toast.success("Maintenance banner updated");
        } catch (error: any) {
            toast.error(error.message || "Failed to update maintenance banner");
        } finally {
            setSavingMaintenance(false);
        }
    };

    const handleToggleFlag = async (key: keyof TenantFeatureFlags, checked: boolean) => {
        if (!featureFlags) return;
        setSavingFlag(key);
        const previous = featureFlags;
        setFeatureFlags({ ...featureFlags, [key]: checked });
        try {
            const updated = await apiFetch<TenantFeatureFlags>(`/platform-admin/tenants/${tenantId}/feature-flags`, {
                method: "PATCH",
                body: JSON.stringify({ [key]: checked }),
            });
            setFeatureFlags(updated);
            toast.success(`${FEATURE_FLAG_LABELS[key]} ${checked ? "enabled" : "disabled"}`);
        } catch (error: any) {
            setFeatureFlags(previous);
            toast.error(error.message || "Failed to update feature flag");
        } finally {
            setSavingFlag(null);
        }
    };

    const handleImpersonate = async (userId: string, reason: string) => {
        try {
            const data = await apiFetch('/platform-admin/impersonate', {
                method: 'POST',
                body: JSON.stringify({ userId, tenantId, reason })
            });

            // Gap checklist: "privileged action controls" -- when a tenant/platform admin has
            // turned on approval-required for impersonation, this returns a pending request
            // instead of a token. A different platform admin has to approve it, then this
            // admin comes back to /platform-admin/privileged-actions to actually start the
            // session (see privileged-actions.ts for why it can't be handed to the approver).
            if (data.pendingApproval) {
                toast.success("Impersonation request submitted -- a different platform admin must approve it before you can start the session.");
                return;
            }

            // F06 fix (WP05): the impersonate route now sets the impersonation session as an
            // HttpOnly cookie directly on its own response (overwriting this admin's own
            // session cookie) -- no raw token to stash in sessionStorage or hand to login()
            // anymore. Exiting impersonation later is handled server-side by
            // /api/platform-admin/exit-impersonation, which knows how to return to this admin
            // via the impersonation session's own `impersonatedBy` reference.
            await login();
            toast.success(`Impersonating ${data.user.email}`);

            // Redirect to dashboard
            router.push('/dashboard');
        } catch (error: any) {
            toast.error(error.message || "Impersonation failed");
        }
    };

    const submitImpersonate = async () => {
        if (!impersonateTarget || !impersonateReason.trim()) return;
        setImpersonating(true);
        try {
            await handleImpersonate(impersonateTarget.id, impersonateReason.trim());
        } finally {
            setImpersonating(false);
            setImpersonateTarget(null);
            setImpersonateReason("");
        }
    };

    if (loadError) return <ErrorState description="Tenant details could not be loaded." onRetry={loadTenant} />;
    if (loading) return <div className="p-8">Loading...</div>;
    if (!config) return <div className="p-8">Tenant not found</div>;

    const { tenant } = config;

    return (
        <div className="@container/tenant min-w-0 space-y-6">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-4">
                    <Button variant="ghost" size="icon" aria-label="Back to tenants" onClick={() => router.push("/platform-admin/tenants")}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1 basis-48">
                        <h1 className="break-words text-2xl font-bold tracking-tight">{tenant.name}</h1>
                        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant={tenant.status === 'ACTIVE' ? 'default' : 'destructive'}>
                                {tenant.status}
                            </Badge>
                            <Badge variant="outline">{tenant.environment || 'PRODUCTION'}</Badge>
                            <span>Plan: {tenant.plan || 'Basic'}</span>
                        </div>
                    </div>
                </div>
                <Button
                    variant={tenant.status === 'ACTIVE' ? 'destructive' : 'default'}
                    className="h-auto min-h-9 max-w-full whitespace-normal break-words"
                    disabled={savingStatus}
                    onClick={handleToggleSuspend}
                >
                    {tenant.status === 'ACTIVE' ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    {tenant.status === 'ACTIVE' ? 'Suspend Tenant' : 'Unsuspend Tenant'}
                </Button>
            </div>

            <SettingsSections key={tenantId} label="Tenant section" sections={[
                { id: "operations", label: "Environment & demo", content: <div className="min-w-0 space-y-4">
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                        <Wrench className="h-4 w-4" />
                        Environment &amp; Maintenance
                    </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-4">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
                        <div>
                            <Label htmlFor="tenant-environment">Environment</Label>
                            <p className="text-xs text-muted-foreground">Classifies this tenant for reporting/billing exclusion of sandbox and test workspaces.</p>
                        </div>
                        <Select value={tenant.environment || 'PRODUCTION'} disabled={savingEnvironment} onValueChange={handleEnvironmentChange}>
                            <SelectTrigger id="tenant-environment" className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PRODUCTION">Production</SelectItem>
                                <SelectItem value="SANDBOX">Sandbox</SelectItem>
                                <SelectItem value="TEST">Test</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
                        <div>
                            <Label htmlFor="tenant-maintenance">Maintenance Banner</Label>
                            <p className="text-xs text-muted-foreground">Shows an informational banner to this tenant&apos;s users without blocking access.</p>
                        </div>
                        <Switch id="tenant-maintenance"
                            checked={maintenanceDraft.active}
                            onCheckedChange={(checked) => setMaintenanceDraft({ ...maintenanceDraft, active: checked })}
                        />
                    </div>
                    {maintenanceDraft.active && (
                        <Input
                            aria-label="Maintenance message" placeholder="Message shown to this tenant's users"
                            value={maintenanceDraft.message}
                            onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, message: e.target.value })}
                        />
                    )}
                    <div className="flex justify-end">
                        <Button size="sm" disabled={savingMaintenance} onClick={handleSaveMaintenance}>Save Maintenance Banner</Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                        <FlaskConical className="h-4 w-4" />
                        Demo Data
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Seeds a small set of clearly-labeled sample leads (and opportunities, if a pipeline is already configured) for exploring this workspace. Every seeded record is flagged internally so it can be safely removed later without touching any real data.
                    </p>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-xl border p-3">
                        <div className="text-sm">
                            {demoStatus ? (
                                <span>
                                    <strong>{demoStatus.leadCount}</strong> demo lead{demoStatus.leadCount === 1 ? "" : "s"} and{" "}
                                    <strong>{demoStatus.opportunityCount}</strong> demo opportunit{demoStatus.opportunityCount === 1 ? "y" : "ies"} currently seeded
                                </span>
                            ) : (
                                <span className="text-muted-foreground">Demo data status unavailable</span>
                            )}
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={seedingDemo} onClick={handleSeedDemoData}>
                                {seedingDemo ? "Seeding..." : "Seed Demo Data"}
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                disabled={resettingDemo || !demoStatus || (demoStatus.leadCount === 0 && demoStatus.opportunityCount === 0)}
                                onClick={handleResetDemoData}
                            >
                                {resettingDemo ? "Resetting..." : "Reset Demo Data"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

                </div> },
                { id: "users", label: "Users & usage", content: <div className="min-w-0 space-y-4">
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="text-base">Usage &amp; limits</CardTitle>
                    <p className="text-sm text-muted-foreground">{users.length} provisioned user{users.length === 1 ? "" : "s"} in total (active and inactive).</p>
                </CardHeader>
                <CardContent>
                    <TenantUsageLimits endpoint={`/platform-admin/tenants/${tenantId}/usage`} editable />
                </CardContent>
            </Card>

            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle>User Management</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Scrolls inside the card on narrow screens instead of widening the whole page. */}
                    <div className="min-w-0 overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((u) => (
                                <TableRow key={u.id}>
                                    <TableCell className="font-medium">{u.name}</TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    <TableCell>{u.role?.name || 'User'}</TableCell>
                                    <TableCell>{formatWorkspaceRelativeTime(u.createdAt)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setImpersonateTarget({ id: u.id, email: u.email }); setImpersonateReason(""); }}
                                            className="ml-auto"
                                        >
                                            <UserCog className="h-4 w-4 mr-2" />
                                            Impersonate
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                </CardContent>
            </Card>

                </div> },
                { id: "features", label: "Feature flags", content: <div className="min-w-0 space-y-4">
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                        <Flag className="h-4 w-4" />
                        Feature flags
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Switches that aren&apos;t modules. Opportunities, Automations, Forms, Reports, Payouts and Gamification are switched in Modules. Changes save straight away.</p>
                </CardHeader>
                <CardContent>
                    {!featureFlags ? (
                        <p className="text-sm text-muted-foreground">Failed to load feature flags.</p>
                    ) : (
                        <div className="grid gap-3 @min-[700px]/tenant:grid-cols-2">
                            {(Object.keys(FEATURE_FLAG_LABELS) as (keyof TenantFeatureFlags)[]).map((key) => (
                                <label key={key} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                                    <Label className="text-sm font-medium">{FEATURE_FLAG_LABELS[key]}</Label>
                                    <Switch aria-label={FEATURE_FLAG_LABELS[key]}
                                        checked={!!featureFlags[key]}
                                        disabled={savingFlag === key}
                                        onCheckedChange={(checked) => handleToggleFlag(key, checked)}
                                    />
                                </label>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

                </div> },
                { id: "modules", label: "Modules", content: <div className="min-w-0 space-y-4">
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                        <LayoutGrid className="h-4 w-4" />
                        Modules
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{modules.length} catalog modules. Core modules stay enabled. Enabled and Trial permit module access; also review the separate Feature flags section and tenant role permissions. Changes save immediately.</p>
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                        <span className="min-w-0 break-words">
                            {moduleHealthState === "loading" ? "Checking module health…" : moduleHealthState === "error" ? "Module health could not be checked." : "Health checked just now. Failing connectors and backed-up work notify admins once a day."}
                        </span>
                        <Button size="sm" variant="outline" className="h-auto min-h-8 max-w-full whitespace-normal break-words" disabled={moduleHealthState === "loading"} onClick={fetchModuleHealth}>Recheck health</Button>
                    </div>
                </CardHeader>
                {/* Tighter padding on small screens: at 200% text the default rem padding left the status picker too narrow to show "Enabled". */}
                <CardContent className="px-3 sm:px-6">
                    {dependencyWarnings.length > 0 && (
                        <div role="alert" className="mb-3 space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                            <p className="font-medium">Module dependency problems</p>
                            {dependencyWarnings.map((warning) => <p key={warning.moduleKey} className="break-words">{warning.message}</p>)}
                        </div>
                    )}
                    {accessRequests.length > 0 && (
                        <section aria-label="Pending module requests" className="mb-3 space-y-2 rounded-xl border p-3">
                            <p className="text-sm font-medium">Pending requests from this tenant</p>
                            {accessRequests.map((request) => (
                                <div key={request.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0">
                                    <div className="min-w-0 flex-1 basis-48 break-words text-sm">
                                        <p className="font-medium">{request.moduleName}</p>
                                        <p className="text-xs text-muted-foreground">{request.requestedByName || request.requestedByEmail || "A tenant admin"} · {formatWorkspaceDate(request.createdAt)}</p>
                                        {request.message && <p className="mt-1 text-xs">&ldquo;{request.message}&rdquo;</p>}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="sm" variant="outline" onClick={() => openResolve(request, "DECLINED")}>Decline</Button>
                                        <Button size="sm" onClick={() => openResolve(request, "APPROVED")}>Approve…</Button>
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}
                    {modules.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No module entitlements are available.</p>
                    ) : (
                        <div className="space-y-2">
                            {modules.map((module) => (
                                <div key={module.key} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-2 sm:p-3">
                                    <div className="min-w-0 flex-1 basis-48 break-words">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="min-w-0 max-w-full break-words text-sm font-medium">{module.name}</span>
                                            <Badge variant="outline" className={cn("rounded-md text-xs font-semibold", MODULE_STATUS_BADGE[module.status])}>
                                                {module.status}
                                            </Badge>
                                            {module.isCore && <Badge variant="outline" className="rounded-md text-xs">Core</Badge>}
                                            {healthWorthShowing(moduleHealth[module.key]) && <ModuleHealthBadge health={moduleHealth[module.key]} />}
                                        </div>
                                        {moduleHealth[module.key] && <ModuleHealthIssues health={moduleHealth[module.key]} links={false} showDetail />}
                                        <p className="text-xs text-muted-foreground">{module.category}</p>
                                        {requiredModules(module.key).length > 0 && <p className="mt-1 text-xs text-muted-foreground">Requires {requiredModules(module.key).map(moduleName).join(" and ")}.</p>}
                                        {module.status === "TRIAL" && <p className="mt-1 text-xs">{module.trialEndsAt ? `Trial ends ${formatWorkspaceDate(module.trialEndsAt)} — then suspended (data kept).` : "Trial has no end date. Set one to have it end automatically."}</p>}
                                        {!!module.pausedCount && <p className="mt-1 text-xs text-muted-foreground">{module.pausedCount} scheduled item{module.pausedCount === 1 ? "" : "s"} paused — restored when enabled.</p>}
                                        {MODULE_COVERAGE_NOTES[module.key] && <p className="mt-2 text-xs font-medium">{MODULE_COVERAGE_NOTES[module.key]}</p>}

                                    </div>
                                    <Select
                                        value={module.status}
                                        disabled={module.isCore || savingModule === module.key}
                                        onValueChange={(value) => handleModuleStatusChange(module, value as ModuleEntitlement["status"])}
                                    >
                                        <SelectTrigger aria-label={`${module.name} status`} className="w-full gap-1 px-2 whitespace-normal data-[size=default]:h-auto min-h-9 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:[overflow-wrap:anywhere] sm:w-[140px] sm:gap-2 sm:px-3"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ENABLED">Enabled</SelectItem>
                                            <SelectItem value="TRIAL">Trial</SelectItem>
                                            <SelectItem value="SUSPENDED">Suspended</SelectItem>
                                            <SelectItem value="DISABLED">Disabled</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

                </div> }
            ]} />

            <StandardDialog
                open={!!moduleChange}
                onClose={() => { if (!savingModule) setModuleChange(null); }}
                title={moduleChange ? `Change ${moduleChange.module.name} to ${moduleChange.status.toLowerCase()}?` : ""}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setModuleChange(null)} disabled={!!savingModule}>Cancel</Button>
                        <Button onClick={confirmModuleStatusChange} disabled={!!savingModule || !moduleImpact || !!moduleImpact.blockedReason || (moduleChange?.status === "TRIAL" && !moduleTrialEnd)}>
                            {savingModule ? "Saving..." : "Save change"}
                        </Button>
                    </>
                }
            >
                <div className="min-w-0 space-y-3 text-sm">
                    {!moduleImpact ? (
                        <p role="status">Checking what this change affects…</p>
                    ) : moduleImpact.blockedReason ? (
                        <p role="alert" className="break-words text-destructive">{moduleImpact.blockedReason}</p>
                    ) : moduleChange && (moduleChange.status === "DISABLED" || moduleChange.status === "SUSPENDED") ? (
                        <>
                            <p>Records are kept. Until the module is re-enabled, this tenant&apos;s users lose access, and these are paused (and restored when it is re-enabled):</p>
                            {moduleImpact.items.length ? (
                                <ul className="list-disc space-y-1 pl-5">
                                    {moduleImpact.items.map((item) => (
                                        <li key={item.label} className="break-words">{item.label}: <span className="font-medium">{item.count === null ? "unknown" : item.count}</span></li>
                                    ))}
                                </ul>
                            ) : <p className="text-muted-foreground">No active items were found for this module.</p>}
                            {moduleImpactFailed && <p className="text-muted-foreground">The impact preview could not be loaded; dependencies are still checked when you save.</p>}
                        </>
                    ) : (
                        <>
                            <p>This tenant&apos;s users will be able to use {moduleChange?.module.name} (subject to their role permissions).</p>
                            {!!moduleChange?.module.pausedCount && <p>{moduleChange.module.pausedCount} scheduled item{moduleChange.module.pausedCount === 1 ? "" : "s"} paused when it was switched off will be restored.</p>}
                        </>
                    )}
                    {moduleChange?.status === "TRIAL" && !moduleImpact?.blockedReason && (
                        <div className="space-y-1">
                            <Label htmlFor="module-trial-end">Trial ends on</Label>
                            <Input id="module-trial-end" type="date" value={moduleTrialEnd} min={dateInputValue(new Date(Date.now() + DAY_MS))} onChange={(event) => setModuleTrialEnd(event.target.value)} />
                            <p className="text-xs text-muted-foreground">Platform and tenant admins are warned 7 days before. At the end date the module is suspended (data kept, scheduled work paused), together with any enabled module that depends on it.</p>
                        </div>
                    )}
                    {!moduleImpact?.blockedReason && (
                        <div className="space-y-1">
                            <Label htmlFor="module-change-reason">Reason (optional, recorded in the audit log)</Label>
                            <Textarea id="module-change-reason" value={moduleReason} maxLength={500} onChange={(event) => setModuleReason(event.target.value)} />
                        </div>
                    )}
                    {moduleChangeError && <p role="alert" className="break-words text-destructive">{moduleChangeError}</p>}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!resolving}
                onClose={() => { if (!resolveSaving) setResolving(null); }}
                title={resolving ? `${resolving.decision === "APPROVED" ? "Approve" : "Decline"} ${resolving.request.moduleName}?` : ""}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setResolving(null)} disabled={resolveSaving}>Cancel</Button>
                        <Button onClick={confirmResolve} disabled={resolveSaving || (resolving?.decision === "APPROVED" && resolveStatus === "TRIAL" && !resolveTrialEnd)}>
                            {resolveSaving ? "Saving..." : resolving?.decision === "APPROVED" ? "Approve" : "Decline"}
                        </Button>
                    </>
                }
            >
                <div className="min-w-0 space-y-3 text-sm">
                    {resolving?.decision === "APPROVED" && (
                        <>
                            <div className="space-y-1">
                                <Label htmlFor="resolve-status">Grant as</Label>
                                <select id="resolve-status" className="h-10 w-full rounded-md border bg-background px-2" value={resolveStatus} onChange={(event) => setResolveStatus(event.target.value as "ENABLED" | "TRIAL")}>
                                    <option value="ENABLED">Enabled</option>
                                    <option value="TRIAL">Trial</option>
                                </select>
                            </div>
                            {resolveStatus === "TRIAL" && (
                                <div className="space-y-1">
                                    <Label htmlFor="resolve-trial-end">Trial ends on</Label>
                                    <Input id="resolve-trial-end" type="date" value={resolveTrialEnd} min={dateInputValue(new Date(Date.now() + DAY_MS))} onChange={(event) => setResolveTrialEnd(event.target.value)} />
                                </div>
                            )}
                        </>
                    )}
                    <div className="space-y-1">
                        <Label htmlFor="resolve-note">Note to the requester (optional)</Label>
                        <Textarea id="resolve-note" value={resolveNote} maxLength={1000} onChange={(event) => setResolveNote(event.target.value)} />
                    </div>
                    {resolveError && <p role="alert" className="break-words text-destructive">{resolveError}</p>}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!impersonateTarget}
                onClose={() => setImpersonateTarget(null)}
                title={`Impersonate ${impersonateTarget?.email ?? ""}`}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setImpersonateTarget(null)}>Cancel</Button>
                        <Button onClick={submitImpersonate} disabled={impersonating || !impersonateReason.trim()}>
                            {impersonating ? "Starting..." : "Start Impersonation"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                        You will see the app exactly as this user does. This requires a reason -- it&apos;s recorded in the audit trail alongside every action taken during the session, and the session expires after 4 hours regardless of activity.
                    </p>
                    <div className="space-y-1.5">
                        <Label htmlFor="impersonate-reason">Reason (required)</Label>
                        <Textarea
                            id="impersonate-reason"
                            rows={3}
                            value={impersonateReason}
                            onChange={(e) => setImpersonateReason(e.target.value)}
                            placeholder="e.g. Investigating support ticket #1234 -- user reports missing lead data"
                            autoFocus
                        />
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}

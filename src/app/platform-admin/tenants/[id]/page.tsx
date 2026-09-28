"use client";
import { MODULE_COVERAGE_NOTES, MODULE_FEATURE_KEYS } from "@/lib/tenant-provisioning";

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
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { ArrowLeft, UserCog, Activity, Users, Flag, LayoutGrid, ShieldOff, ShieldCheck, Wrench, FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";
import { StandardDialog } from "@/components/common/standard-dialog";

type ModuleEntitlement = {
    key: string;
    name: string;
    category: string;
    isCore: boolean;
    status: "ENABLED" | "DISABLED" | "SUSPENDED" | "TRIAL";
};

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

const FEATURE_FLAG_LABELS: Record<keyof TenantFeatureFlags, string> = {
    opportunityEnabled: "Opportunities",
    automationEnabled: "Automations",
    salesGroupsEnabled: "Sales Groups",
    formBuilderEnabled: "Form Builder",
    advancedReporting: "Advanced Reporting",
    apiAccessEnabled: "API Access",
    payoutsEnabled: "Payouts & Commissions",
    gamificationEnabled: "Gamification",
};

export default function TenantDetailPage() {
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

    const fetchModules = () => {
        apiFetch<ModuleEntitlement[]>(`/platform-admin/tenants/${tenantId}/modules`).then(setModules).catch(() => setLoadError(true));
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
        if (!confirm("Delete all demo data for this tenant? This only removes records flagged as demo data (seeded by the button above) -- real leads and opportunities are never touched.")) return;
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

    const handleModuleStatusChange = async (module: ModuleEntitlement, status: ModuleEntitlement["status"]) => {
        if (status === module.status) return;
        const reason = status === "DISABLED" || status === "SUSPENDED" ? window.prompt(`Reason for changing ${module.name} to ${status.toLowerCase()}? (optional)`) : "";
        if (reason === null) return;
        setSavingModule(module.key);
        try {
            await apiFetch(`/platform-admin/tenants/${tenantId}/modules/${module.key}`, {
                method: "PATCH",
                body: JSON.stringify({ status, reason: reason || null }),
            });
            toast.success(`${module.name} set to ${status}`);
            fetchModules();
        } catch (error: any) {
            toast.error(error.message || "Failed to update module status");
        } finally {
            setSavingModule(null);
        }
    };

    const handleToggleSuspend = async () => {
        const suspending = config.tenant.status !== "SUSPENDED";
        if (suspending && !confirm("Suspend this tenant? Its users will be immediately signed out and unable to log back in until unsuspended.")) return;
        setSavingStatus(true);
        try {
            const result = await apiFetch<{ pendingApproval?: boolean }>(`/platform-admin/tenants/${tenantId}/${suspending ? "suspend" : "unsuspend"}`, { method: "POST" });
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
            <div className="grid gap-4 @min-[700px]/tenant:grid-cols-2">
                <Card className="min-w-0">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Provisioned Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{users.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Limit: {config.userLimit || 'Unlimited'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="min-w-0">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Unavailable</div>
                        <p className="text-xs text-muted-foreground">
                            Quota: {config.storageQuota || 1} GB
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle>User Management</CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
            </Card>

                </div> },
                { id: "features", label: "Feature flags", content: <div className="min-w-0 space-y-4">
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                        <Flag className="h-4 w-4" />
                        Feature Flags
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">These switches control feature access, including API Access. Some overlap with the module catalog; review both sections when changing access. Changes save immediately.</p>
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
                </CardHeader>
                <CardContent>
                    {modules.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No module entitlements are available.</p>
                    ) : (
                        <div className="space-y-2">
                            {modules.map((module) => (
                                <div key={module.key} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                                    <div className="min-w-0 flex-1 basis-48 break-words">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="min-w-0 max-w-full break-words text-sm font-medium">{module.name}</span>
                                            <Badge variant="outline" className={cn("rounded-md text-[0.65rem] font-semibold", MODULE_STATUS_BADGE[module.status])}>
                                                {module.status}
                                            </Badge>
                                            {module.isCore && <Badge variant="outline" className="rounded-md text-[0.65rem]">Core</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{module.category}</p>
                                        {MODULE_COVERAGE_NOTES[module.key] && <p className="mt-2 text-xs font-medium">{MODULE_COVERAGE_NOTES[module.key]}</p>}
                                        {MODULE_FEATURE_KEYS[module.key] && featureFlags?.[MODULE_FEATURE_KEYS[module.key]] === false && <p className="mt-1 text-xs text-destructive">Also blocked by Feature flags: {FEATURE_FLAG_LABELS[MODULE_FEATURE_KEYS[module.key]]}. Enable that flag as well to permit access.</p>}
                                    </div>
                                    <Select
                                        value={module.status}
                                        disabled={module.isCore || savingModule === module.key}
                                        onValueChange={(value) => handleModuleStatusChange(module, value as ModuleEntitlement["status"])}
                                    >
                                        <SelectTrigger aria-label={`${module.name} status`} className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCw, ShieldOff, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { SettingsSections } from '@/components/layout/settings-sections';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState } from '@/components/common/error-state';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceRelativeTime } from '@/lib/date-format';
import { toast } from 'sonner';

interface PlatformAdminApp {
    id: string;
    ownerTenantId: string;
    ownerTenantName: string;
    name: string;
    category: string;
    isActive: boolean;
    // One row per (app, installing tenant) -- a published app can have several. tenantId/
    // tenantName/installStatus are null only for the (rare) case of an app with no install row
    // at all.
    tenantId: string | null;
    tenantName: string | null;
    installStatus: string | null;
    createdAt: string;
    publishStatus?: string;
    trustLevel?: string;
}

interface PendingVersion {
    id: string;
    appId: string;
    appName: string;
    ownerTenantName: string;
    version: number;
    changeNotes: string | null;
    createdAt: string;
    publishStatus: string;
}

interface PendingPlatformPermissionChange {
    id: string;
    tenantId: string;
    appId: string;
    appName: string;
    pendingPlatformPermissions: Record<string, string>;
    updatedAt: string;
}

interface AppTenantBlock {
    id: string;
    appId: string;
    appName: string;
    tenantId: string;
    tenantName: string;
    reason: string | null;
    createdAt: string;
}

interface SuspectedOutage {
    hostname: string;
    affectedAppCount: number;
}

interface TenantSummary {
    id: string;
    name: string;
}

const HEALTH_STATUS_CLASSNAMES: Record<string, string> = {
    OK: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    DEGRADED: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    ERROR: 'border-destructive/30 bg-destructive/10 text-destructive',
    UNKNOWN: 'border-muted bg-muted text-muted-foreground',
};

const TRUST_LEVELS = ['UNVERIFIED', 'VERIFIED', 'TRUSTED'] as const;
const TRUST_LEVEL_CLASSNAMES: Record<string, string> = {
    UNVERIFIED: 'border-muted bg-muted text-muted-foreground',
    VERIFIED: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    TRUSTED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

export default function PlatformMarketplacePage() {
    const [apps, setApps] = useState<PlatformAdminApp[]>([]);
    const [healthOverview, setHealthOverview] = useState<Record<string, number> | null>(null);
    const [pendingVersions, setPendingVersions] = useState<PendingVersion[]>([]);
    const [pendingPlatformPermissions, setPendingPlatformPermissions] = useState<PendingPlatformPermissionChange[]>([]);
    const [suspectedOutages, setSuspectedOutages] = useState<SuspectedOutage[]>([]);
    const [blocks, setBlocks] = useState<AppTenantBlock[]>([]);
    const [tenants, setTenants] = useState<TenantSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [permissionReviewingId, setPermissionReviewingId] = useState<string | null>(null);
    const [trustSavingId, setTrustSavingId] = useState<string | null>(null);

    const [loadError, setLoadError] = useState(false);
    const [search, setSearch] = useState('');
    const requestVersion = useRef(0);
    const load = useCallback(() => {
        const version = ++requestVersion.current;
        setLoadError(false);
        setLoading(true);
        Promise.all([
            apiFetch<PlatformAdminApp[]>('/platform-admin/marketplace/apps'),
            apiFetch<Record<string, number>>('/platform-admin/marketplace/health-overview'),
            apiFetch<PendingVersion[]>('/platform-admin/marketplace/pending-versions'),
            apiFetch<PendingPlatformPermissionChange[]>('/platform-admin/marketplace/pending-platform-permission-changes'),
            apiFetch<SuspectedOutage[]>('/platform-admin/marketplace/suspected-outages'),
            apiFetch<AppTenantBlock[]>('/platform-admin/marketplace/blocks'),
            apiFetch<TenantSummary[]>('/platform-admin/tenants'),
        ])
            .then(([appsData, healthData, versionsData, permissionChangesData, outagesData, blocksData, tenantsData]) => {
                if (version !== requestVersion.current) return;
                setApps(Array.isArray(appsData) ? appsData : []);
                setHealthOverview(healthData);
                setPendingVersions(Array.isArray(versionsData) ? versionsData : []);
                setPendingPlatformPermissions(Array.isArray(permissionChangesData) ? permissionChangesData : []);
                setSuspectedOutages(Array.isArray(outagesData) ? outagesData : []);
                setBlocks(Array.isArray(blocksData) ? blocksData : []);
                setTenants(Array.isArray(tenantsData) ? tenantsData : []);
            })
            .catch(() => { if (version === requestVersion.current) setLoadError(true); })
            .finally(() => { if (version === requestVersion.current) setLoading(false); });
    }, []);

    useEffect(() => { load(); return () => { requestVersion.current++; }; }, [load]);

    const changeTrustLevel = async (app: PlatformAdminApp, trustLevel: string) => {
        setTrustSavingId(app.id);
        try {
            await apiFetch(`/platform-admin/marketplace/apps/${app.id}/trust-level`, { method: 'POST', body: JSON.stringify({ trustLevel }) });
            toast.success(`"${app.name}" trust level set to ${trustLevel}`);
            load();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update trust level');
        } finally {
            setTrustSavingId(null);
        }
    };

    const blockTenant = async (app: PlatformAdminApp) => {
        const tenantName = window.prompt(`Block which tenant from installing "${app.name}"? Enter the exact tenant name.`) ?? '';
        if (!tenantName.trim()) return;
        const tenant = tenants.find((t) => t.name.toLowerCase() === tenantName.trim().toLowerCase());
        if (!tenant) {
            toast.error(`No tenant found named "${tenantName}"`);
            return;
        }
        if (tenant.id === app.ownerTenantId) {
            toast.error("Can't block an app's own owning tenant");
            return;
        }
        const reason = window.prompt('Reason (shown in the audit trail)?');
        if (reason === null) return;
        setBusyId(`block:${app.id}`);
        try {
            await apiFetch(`/platform-admin/marketplace/apps/${app.id}/blocks`, { method: 'POST', body: JSON.stringify({ tenantId: tenant.id, reason: reason || null }) });
            toast.success(`"${tenant.name}" blocked from "${app.name}"`);
            load();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to block tenant');
        } finally {
            setBusyId(null);
        }
    };

    const unblockTenant = async (block: AppTenantBlock) => {
        setBusyId(`unblock:${block.id}`);
        try {
            await apiFetch(`/platform-admin/marketplace/apps/${block.appId}/blocks/${block.tenantId}`, { method: 'DELETE' });
            toast.success(`"${block.tenantName}" unblocked from "${block.appName}"`);
            load();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to unblock tenant');
        } finally {
            setBusyId(null);
        }
    };

    const reviewVersion = async (version: PendingVersion, action: 'approve' | 'reject') => {
        let reason: string | null = null;
        if (action === 'reject') {
            reason = window.prompt(`Reason for rejecting "${version.appName}" v${version.version}?`);
            if (reason === null) return;
            if (!reason && !window.confirm('Reject without a reason?')) return;
        }
        setReviewingId(version.id);
        try {
            await apiFetch(`/platform-admin/marketplace/versions/${version.id}/${action}`, {
                method: 'POST',
                body: action === 'reject' ? JSON.stringify({ reason: reason || null }) : undefined,
            });
            toast.success(
                action === 'approve'
                    ? version.publishStatus === 'PENDING_REVIEW'
                        ? `"${version.appName}" published to the catalog`
                        : `v${version.version} approved`
                    : `v${version.version} rejected`,
            );
            load();
        } catch (error: any) {
            toast.error(error?.message || `Failed to ${action} version`);
        } finally {
            setReviewingId(null);
        }
    };

    // Gap checklist Module 16's scoped-app-permissions sub-item, "platform-admin-only restricted
    // capabilities", built per explicit user decision: any write-scope permission an install
    // requested (at initial approval or a later upgrade) needs this separate sign-off.
    const reviewPlatformPermissionChange = async (change: PendingPlatformPermissionChange, action: 'approve' | 'reject') => {
        setPermissionReviewingId(change.id);
        try {
            await apiFetch(`/platform-admin/marketplace/installs/${change.id}/${action}-platform-permissions`, {
                method: 'POST',
                body: JSON.stringify({ tenantId: change.tenantId }),
            });
            toast.success(action === 'approve' ? `Write access granted for "${change.appName}"` : `Write-permission request rejected for "${change.appName}"`);
            load();
        } catch (error: any) {
            toast.error(error?.message || `Failed to ${action} permission change`);
        } finally {
            setPermissionReviewingId(null);
        }
    };

    const unpublishApp = async (app: PlatformAdminApp) => {
        const reason = window.prompt(`Reason for unpublishing "${app.name}" (existing installs are unaffected)?`);
        if (reason === null) return;
        if (!reason && !window.confirm('Unpublish without a reason?')) return;
        setBusyId(`unpublish:${app.id}`);
        try {
            await apiFetch(`/platform-admin/marketplace/apps/${app.id}/unpublish`, { method: 'POST', body: JSON.stringify({ reason: reason || null }) });
            toast.success(`"${app.name}" removed from the catalog`);
            load();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to unpublish app');
        } finally {
            setBusyId(null);
        }
    };

    const suspendApp = async (app: PlatformAdminApp) => {
        const reason = window.prompt(`Reason for suspending "${app.name}" (shown in the audit trail)?`);
        if (reason === null) return;
        if (!reason && !window.confirm('Suspend without a reason?')) return;
        setBusyId(app.id);
        try {
            await apiFetch(`/platform-admin/marketplace/apps/${app.id}/suspend`, {
                method: 'POST',
                body: JSON.stringify({ reason: reason || null }),
            });
            toast.success(`"${app.name}" suspended`);
            load();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to suspend app');
        } finally {
            setBusyId(null);
        }
    };

    const rotateSecret = async (app: PlatformAdminApp) => {
        if (!app.tenantId) return;
        if (!window.confirm(`Force-rotate "${app.tenantName}"'s credential for "${app.name}"? That tenant will need to update their integration.`)) return;
        setBusyId(`${app.id}:${app.tenantId}`);
        try {
            await apiFetch(`/platform-admin/marketplace/apps/${app.id}/rotate-secret`, { method: 'POST', body: JSON.stringify({ tenantId: app.tenantId }) });
            toast.success('Secret rotated -- notify the tenant to update their integration');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to rotate secret');
        } finally {
            setBusyId(null);
        }
    };

    const visibleApps = apps.filter(app => [app.name, app.ownerTenantName, app.tenantName, app.category].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="Marketplace" description="Review app publishing and permissions, manage installations, and monitor platform health." />
            {loading ? <p role="status" className="text-sm text-muted-foreground">Loading marketplace…</p> : loadError ? <ErrorState description="Marketplace could not be loaded." onRetry={load} /> : <SettingsSections label="Marketplace section" sections={[
            { id: 'reviews', label: `Reviews (${pendingVersions.length + pendingPlatformPermissions.length})`, content: <div className="min-w-0 space-y-4">
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="text-base">Pending Publish Reviews</CardTitle>
                    <CardDescription>
                        Approving a version publishes the app to the cross-tenant catalog (its first review) or
                        re-approves a published app&apos;s edit (every review after that).
                    </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                    {pendingVersions.length === 0 ? (
                        <p className="p-4 text-center text-sm text-muted-foreground">Nothing awaiting review.</p>
                    ) : (
                        <div className="divide-y">
                            {pendingVersions.map((version) => (
                                <div key={version.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2.5">
                                    <div className="min-w-0 max-w-full break-words">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <p className="min-w-0 max-w-full break-words text-sm font-medium">{version.appName}</p>
                                            <Badge variant="outline">v{version.version}</Badge>
                                            <Badge variant="outline" className="max-w-full whitespace-normal break-all">{version.ownerTenantName}</Badge>
                                            {version.publishStatus === 'PENDING_REVIEW' && <Badge>First publish</Badge>}
                                        </div>
                                        {version.changeNotes && <p className="text-xs text-muted-foreground">{version.changeNotes}</p>}
                                        <p className="text-xs text-muted-foreground">Submitted {formatWorkspaceRelativeTime(version.createdAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Button variant="outline" size="sm" disabled={reviewingId === version.id} onClick={() => reviewVersion(version, 'reject')}>
                                            <XCircle className="size-3.5" />
                                            Reject
                                        </Button>
                                        <Button size="sm" disabled={reviewingId === version.id} onClick={() => reviewVersion(version, 'approve')}>
                                            <CheckCircle2 className="size-3.5" />
                                            Approve
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="text-base">Pending Write-Permission Approvals</CardTitle>
                    <CardDescription>
                        Any write-scope module permission (requested at install or a later upgrade) needs this
                        separate platform-admin sign-off -- read-only grants are approvable by the tenant admin alone.
                    </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                    {pendingPlatformPermissions.length === 0 ? (
                        <p className="p-4 text-center text-sm text-muted-foreground">Nothing awaiting review.</p>
                    ) : (
                        <div className="divide-y">
                            {pendingPlatformPermissions.map((change) => (
                                <div key={change.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2.5">
                                    <div className="min-w-0 max-w-full break-words">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <p className="min-w-0 max-w-full break-words text-sm font-medium">{change.appName}</p>
                                            <Badge variant="outline" className="max-w-full whitespace-normal break-all">{tenants.find((t) => t.id === change.tenantId)?.name ?? change.tenantId}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Requested write access: {Object.keys(change.pendingPlatformPermissions).join(", ")}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Updated {formatWorkspaceRelativeTime(change.updatedAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Button variant="outline" size="sm" disabled={permissionReviewingId === change.id} onClick={() => reviewPlatformPermissionChange(change, 'reject')}>
                                            <XCircle className="size-3.5" />
                                            Reject
                                        </Button>
                                        <Button size="sm" disabled={permissionReviewingId === change.id} onClick={() => reviewPlatformPermissionChange(change, 'approve')}>
                                            <CheckCircle2 className="size-3.5" />
                                            Approve
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            </div> },
            { id: 'blocks', label: `Blocked installs (${blocks.length})`, content: <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="text-base">Blocked Installs</CardTitle>
                    <CardDescription>
                        Tenants a platform admin has blocked from installing a specific app. Only blocks NEW install
                        requests -- an install the tenant already had is unaffected.
                    </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                    {blocks.length === 0 ? (
                        <p className="p-4 text-center text-sm text-muted-foreground">No blocks configured.</p>
                    ) : (
                        <div className="divide-y">
                            {blocks.map((block) => (
                                <div key={block.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2">
                                    <div className="min-w-0 max-w-full break-words">
                                        <p className="text-sm">
                                            <span className="font-medium">{block.tenantName}</span> blocked from{' '}
                                            <span className="font-medium">{block.appName}</span>
                                        </p>
                                        {block.reason && <p className="text-xs text-muted-foreground">{block.reason}</p>}
                                    </div>
                                    <Button variant="outline" size="sm" disabled={busyId === `unblock:${block.id}`} onClick={() => unblockTenant(block)}>
                                        Unblock
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

             },
            { id: 'health', label: 'App health', content: <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="text-base">Platform-wide App Health</CardTitle>
                    <CardDescription>
                        Aggregate counts only -- no tenant, app, or record data is shown here.
                    </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {healthOverview && Object.entries(healthOverview).map(([status, count]) => (
                            <div key={status}>
                                <Badge variant="outline" className={HEALTH_STATUS_CLASSNAMES[status] ?? ''}>{status}</Badge>
                                <p className="mt-1 text-2xl font-bold">{count}</p>
                            </div>
                        ))}
                    </div>
                    {suspectedOutages.length > 0 && (
                        <div className="mt-4 space-y-2 border-t pt-4">
                            <p className="text-xs font-medium text-muted-foreground">Suspected provider-wide outages</p>
                            {suspectedOutages.map((outage) => (
                                <div key={outage.hostname} className="flex min-w-0 flex-wrap items-center justify-between gap-2 break-all rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                                    <span className="font-medium">{outage.hostname}</span>
                                    <span className="text-xs text-muted-foreground">{outage.affectedAppCount} apps currently failing (cross-tenant)</span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

             },
            { id: 'apps', label: `Registered apps (${apps.length})`, content: <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="text-base">All Registered Apps</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0">
                    <div className="mb-4 space-y-1">
                        <label htmlFor="app-search" className="text-sm font-medium">Search registered apps</label>
                        <Input id="app-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="App, owner, installing tenant or category" />
                        <p className="text-xs text-muted-foreground">One row per installation. {visibleApps.length} of {apps.length} rows shown.</p>
                    </div>
                    {visibleApps.length === 0 ? (
                        <p className="p-4 text-center text-sm text-muted-foreground">{apps.length ? 'No apps match your search.' : 'No apps registered on this platform yet.'}</p>
                    ) : (
                        <Table className="min-w-[1000px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>App</TableHead>
                                    <TableHead>Owner</TableHead>
                                    <TableHead>Installing Tenant</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Install Status</TableHead>
                                    <TableHead>Trust Level</TableHead>
                                    <TableHead>Registered</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleApps.map((app) => (
                                    <TableRow key={`${app.id}:${app.tenantId ?? 'no-install'}`}>
                                        <TableCell className="max-w-60 whitespace-normal break-all font-medium">{app.name}</TableCell>
                                        <TableCell className="max-w-60 whitespace-normal break-all">{app.ownerTenantName}</TableCell>
                                        <TableCell className="max-w-60 whitespace-normal break-all">{app.tenantName ?? '--'}</TableCell>
                                        <TableCell>{app.category}</TableCell>
                                        <TableCell>
                                            <Badge variant={app.isActive ? 'outline' : 'destructive'}>
                                                {app.isActive ? (app.installStatus ?? 'NO INSTALL') : 'PLATFORM SUSPENDED'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <select
                                                className={`rounded-md border px-2 py-1 text-xs ${TRUST_LEVEL_CLASSNAMES[app.trustLevel ?? 'UNVERIFIED'] ?? ''}`}
                                                aria-label={`Trust level for ${app.name}`}
                                                value={app.trustLevel ?? 'UNVERIFIED'}
                                                disabled={trustSavingId === app.id}
                                                onChange={(e) => changeTrustLevel(app, e.target.value)}
                                            >
                                                {TRUST_LEVELS.map((level) => (
                                                    <option key={level} value={level}>{level}</option>
                                                ))}
                                            </select>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatWorkspaceRelativeTime(app.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={!app.tenantId || busyId === `${app.id}:${app.tenantId}`}
                                                    onClick={() => rotateSecret(app)}
                                                >
                                                    <RotateCw className="size-3.5" />
                                                    Rotate
                                                </Button>
                                                {app.publishStatus === 'PUBLISHED' && (
                                                    <Button variant="outline" size="sm" disabled={busyId === `block:${app.id}`} onClick={() => blockTenant(app)}>
                                                        Block Tenant
                                                    </Button>
                                                )}
                                                {app.publishStatus === 'PUBLISHED' && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={busyId === `unpublish:${app.id}`}
                                                        onClick={() => unpublishApp(app)}
                                                    >
                                                        Unpublish
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={busyId === app.id || !app.isActive}
                                                    onClick={() => suspendApp(app)}
                                                >
                                                    <ShieldOff className="size-3.5" />
                                                    Suspend
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card> }
            ]} />}
        </div>
    );
}

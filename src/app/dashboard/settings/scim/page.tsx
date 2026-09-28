"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { useFeature } from "@/components/auth/feature-gate";

type ReconciliationRow = {
    id: string;
    name: string;
    email: string;
    status: string;
    externalId: string;
    lastActivity: string | null;
    stale: boolean;
};

type SyncLogRow = {
    id: string;
    resourceType: string;
    resourceId: string | null;
    action: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
};

const STATUS_BADGE: Record<string, string> = {
    SUCCESS: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
};

export default function ScimPage() {
    const apiAccessEnabled = useFeature("apiAccessEnabled");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [reconciliation, setReconciliation] = useState<ReconciliationRow[]>([]);
    const [syncLog, setSyncLog] = useState<SyncLogRow[]>([]);
    const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
    const [defaultScimRoleId, setDefaultScimRoleId] = useState("");
    const [saveError, setSaveError] = useState("");
    const [savingDefaultRole, setSavingDefaultRole] = useState(false);

    const load = () => {
        if (!apiAccessEnabled) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(false);
        Promise.all([
            apiFetch<ReconciliationRow[]>("/admin/scim/reconciliation"),
            apiFetch<SyncLogRow[]>("/admin/scim/sync-log"),
            apiFetch<{ defaultScimRoleId: string | null }>("/admin/scim/default-role"),
            apiFetch<Array<{ id: string; name: string }>>("/roles"),
        ])
            .then(([reconciliationData, syncLogData, defaultRoleData, rolesData]) => {
                setReconciliation(Array.isArray(reconciliationData) ? reconciliationData : []);
                setSyncLog(Array.isArray(syncLogData) ? syncLogData : []);
                setDefaultScimRoleId(defaultRoleData?.defaultScimRoleId ?? "");
                setRoles(Array.isArray(rolesData) ? rolesData : []);
            })
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    };

    useEffect(load, [apiAccessEnabled]);

    const saveDefaultRole = async (value: string) => {
        if (savingDefaultRole) return;
        setSaveError("");
        setSavingDefaultRole(true);
        try {
            await apiFetch("/admin/scim/default-role", {
                method: "PATCH",
                body: JSON.stringify({ defaultScimRoleId: value || null }),
            });
            setDefaultScimRoleId(value);
            toast.success("Default SCIM role updated");
        } catch (error: any) {
            setSaveError(error?.message || "Failed to update default SCIM role");
        } finally {
            setSavingDefaultRole(false);
        }
    };

    if (!apiAccessEnabled) {
        return (
            <div className="min-w-0 space-y-4">
                <PageHeader title="SCIM Provisioning" />
                <Card className="p-6 text-center text-sm text-muted-foreground">
                    API access is not enabled for this workspace -- SCIM shares the same API-key authentication, so enable API access first (Settings &gt; General).
                </Card>
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="SCIM Provisioning" description="Connect an identity provider to manage users and review synchronization activity." actions={
                <Button variant="outline" size="sm" onClick={load} disabled={loading || savingDefaultRole}><RefreshCw className="size-3.5" />Refresh</Button>
            } />
            <p className="break-words text-sm text-muted-foreground">SCIM endpoint: <code>/api/scim/v2</code>. Use an API key with Users (SCIM provisioning) access from Settings &gt; API Keys.</p>
            {loadError && <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load SCIM data. <Button variant="outline" size="sm" onClick={load}>Retry</Button></div>}
            <div hidden={loadError} className="min-w-0 space-y-4">

            <Alert variant="info">
                <AlertDescription>
                    This app has no SSO/SAML login of its own -- SCIM provisions each user&apos;s profile, team, role, and active status, but they still need a real password set (via Settings &gt; Users) before they can sign in directly.
                </AlertDescription>
            </Alert>

            <Card className="min-w-0 space-y-3 p-4">
                {saveError && <p role="alert" className="break-words text-sm text-destructive">{saveError}</p>}
                <Label htmlFor="scim-default-role">Default Role for New SCIM Users</Label>
                <p className="text-xs text-muted-foreground">
                    Used when a provisioned user has no <code>roles</code> attribute matching an existing Role, and isn&apos;t added to a Team with its own default Role configured (Settings &gt; Teams).
                </p>
                <Select value={defaultScimRoleId || "none"} onValueChange={(value) => saveDefaultRole(value === "none" ? "" : value)} disabled={savingDefaultRole || loading || loadError}>
                    <SelectTrigger id="scim-default-role" className="w-full max-w-sm"><SelectValue placeholder="None configured" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None configured</SelectItem>
                        {roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </Card>

            <Card className="overflow-hidden py-0">
                <div className="border-b p-3">
                    <p className="text-sm font-medium">Reconciliation -- SCIM-Provisioned Users</p>
                    <p className="text-xs text-muted-foreground">Users with an identity-provider external id, and whether they&apos;ve had sync activity in the last 30 days.</p>
                </div>
                {loading ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                ) : reconciliation.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No SCIM-provisioned users yet.</p>
                ) : (
                    <div className="divide-y">
                        {reconciliation.map((row) => (
                            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                                <div className="min-w-0 flex-1 basis-52 break-all">
                                    <p className="text-sm font-medium">{row.name} <span className="text-xs text-muted-foreground">({row.email})</span></p>
                                    <p className="text-xs text-muted-foreground">External ID: {row.externalId}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{row.status}</Badge>
                                    {row.stale ? (
                                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                            No sync activity in 30+ days
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">Last synced {formatWorkspaceRelativeTime(row.lastActivity!)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Card className="overflow-hidden py-0">
                <div className="border-b p-3">
                    <p className="text-sm font-medium">Sync Activity Log</p>
                </div>
                {loading ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                ) : syncLog.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No SCIM activity yet.</p>
                ) : (
                    <div className="divide-y">
                        {syncLog.map((row) => (
                            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                                <div className="min-w-0 flex-1 basis-52 break-words">
                                    <span className="font-medium">{row.resourceType}</span> {row.action.toLowerCase()}
                                    {row.errorMessage && <span className="ml-2 text-xs text-destructive">{row.errorMessage}</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className={STATUS_BADGE[row.status] ?? ""}>{row.status}</Badge>
                                    <span className="text-xs text-muted-foreground">{formatWorkspaceDateTime(row.createdAt)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
            </div>
        </div>
    );
}

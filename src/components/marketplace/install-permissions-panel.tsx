"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { humanizeEnum } from "@/lib/display/status";

type ModuleScope = "read" | "write";

// One row of GET /api/marketplace/installs/[id]/permissions: a module-level grant that is live
// for this install. The endpoint is read-only; grants change only through the install and
// permission-change approval flows on the Requests tab (and platform sign-off for write access).
type PermissionGrant = {
    id: string;
    moduleKey: string;
    scope: ModuleScope;
    grantedAt: string;
};

export function InstallPermissionsPanel({
    installId,
    requestedPermissions,
}: {
    installId: string;
    requestedPermissions?: Record<string, ModuleScope> | null;
}) {
    const [grants, setGrants] = useState<PermissionGrant[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setLoadError(null);
        apiFetch<PermissionGrant[]>(`/marketplace/installs/${installId}/permissions`)
            .then((data) => setGrants(Array.isArray(data) ? data : []))
            .catch((error: { message?: string }) => setLoadError(error?.message || "The permissions couldn't be loaded."))
            .finally(() => setLoading(false));
    }, [installId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <p role="status" className="py-6 text-sm text-muted-foreground">Loading permissions…</p>;
    if (loadError) return <ErrorState variant="inline" description={loadError} onRetry={load} />;

    const grantedScope = new Map(grants.map((grant) => [grant.moduleKey, grant.scope]));
    // What the app asks for that it doesn't have: a module with no grant, or write requested where
    // only read is live (write access also needs platform admin sign-off).
    const awaiting = Object.entries(requestedPermissions ?? {}).filter(([moduleKey, scope]) => {
        const granted = grantedScope.get(moduleKey);
        return !granted || (scope === "write" && granted !== "write");
    });

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                What this install can read or change through the app API. Grants change when an admin approves a permission request on the Requests tab.
            </p>
            {grants.length === 0 ? (
                <EmptyState
                    variant="inline"
                    icon={<ShieldCheck />}
                    title="No permissions granted"
                    description="This app can't read or change any module yet."
                />
            ) : (
                <ul className="divide-y rounded-lg border">
                    {grants.map((grant) => (
                        <li key={grant.id} className="flex min-w-0 flex-wrap items-center gap-2 p-3">
                            <span className="text-sm font-medium">{humanizeEnum(grant.moduleKey)}</span>
                            <Badge tone={grant.scope === "write" ? "warning" : "info"}>{grant.scope === "write" ? "Read and write" : "Read only"}</Badge>
                            <span className="ml-auto text-xs text-muted-foreground">Granted {formatWorkspaceDateTime(grant.grantedAt)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {awaiting.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-medium">Requested, not granted yet</p>
                    <ul className="divide-y rounded-lg border">
                        {awaiting.map(([moduleKey, scope]) => (
                            <li key={moduleKey} className="flex min-w-0 flex-wrap items-center gap-2 p-3">
                                <span className="text-sm font-medium">{humanizeEnum(moduleKey)}</span>
                                <Badge tone="neutral">{scope === "write" ? "Read and write" : "Read only"}</Badge>
                                <span className="ml-auto text-xs text-muted-foreground">
                                    {scope === "write" && grantedScope.get(moduleKey) === "read" ? "Only read access granted" : "Not granted"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

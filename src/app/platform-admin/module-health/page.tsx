"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODULE_HEALTH_LABEL, ModuleHealthBadge, ModuleHealthIssues, type ModuleHealth, type ModuleHealthState } from "@/components/admin/module-health";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type Item = { tenantId: string; tenantName: string; moduleKey: string; moduleName: string; state: ModuleHealthState; issues: ModuleHealth["issues"]; checkedAt: string };
type Overview = { items: Item[]; activeTenants: number; neverChecked: number; oldestCheckedAt: string | null; snapshotsStale: boolean; refreshMinutes: number };

const FILTER_STATES: ModuleHealthState[] = ["CONNECTOR_FAILING", "WORKER_BACKLOG", "SETUP_INCOMPLETE", "STALE_DATA", "DISABLED_BY_DEPENDENCY", "TRIAL_EXPIRED"];

const asOverview = (data: unknown): Overview => {
    const value = data as Partial<Overview> | null;
    if (!value || typeof value !== "object" || !Array.isArray(value.items)) throw new Error("Module health is not available right now.");
    return { items: value.items, activeTenants: Number(value.activeTenants) || 0, neverChecked: Number(value.neverChecked) || 0, oldestCheckedAt: value.oldestCheckedAt ?? null, snapshotsStale: value.snapshotsStale === true, refreshMinutes: Number(value.refreshMinutes) || 15 };
};

// Platform admins (Module 21): unhealthy modules across every active tenant, from the snapshots
// the modules.processHealth worker job refreshes. The tenant page rechecks one tenant live.
export default function ModuleHealthPage() {
    const [overview, setOverview] = useState<Overview | null>(null);
    const [loadError, setLoadError] = useState("");
    const [filter, setFilter] = useState<"ALL" | ModuleHealthState>("ALL");

    const load = useCallback(async () => {
        setLoadError("");
        try {
            setOverview(asOverview(await apiFetch<unknown>("/platform-admin/module-health")));
        } catch (error: any) {
            setLoadError(error.originalMessage || error.message || "Unable to load module health");
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const counts = useMemo(() => {
        const result: Partial<Record<ModuleHealthState, number>> = {};
        for (const item of overview?.items ?? []) result[item.state] = (result[item.state] ?? 0) + 1;
        return result;
    }, [overview]);

    if (loadError) return <ErrorState title="Module health unavailable" description={loadError} onRetry={load} />;
    if (!overview) return <p role="status" className="p-4 text-sm">Loading module health…</p>;

    const shown = overview.items.filter((item) => filter === "ALL" || item.state === filter);
    const snapshotsStale = overview.snapshotsStale && overview.oldestCheckedAt !== null;

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="Module health" description={`Problems across ${overview.activeTenants} active tenant${overview.activeTenants === 1 ? "" : "s"}. Checked every ${overview.refreshMinutes} minutes; open a tenant to recheck it now.`} />
            {(snapshotsStale || overview.neverChecked > 0) && (
                <div role="alert" className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    {snapshotsStale && <p className="break-words">Some tenants were last checked {formatWorkspaceDateTime(overview.oldestCheckedAt!)}. Health checks run in the worker; if this does not clear within {overview.refreshMinutes} minutes, the worker may be stopped.</p>}
                    {overview.neverChecked > 0 && <p className="break-words">{overview.neverChecked} tenant{overview.neverChecked === 1 ? " has" : "s have"} not been checked yet.</p>}
                </div>
            )}
            <div className="flex min-w-0 flex-wrap items-end gap-3">
                <div className="min-w-0 space-y-1">
                    <Label htmlFor="module-health-filter">Show</Label>
                    <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                        <SelectTrigger id="module-health-filter" className="w-full min-w-0 whitespace-normal text-left data-[size=default]:h-auto min-h-9 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:[overflow-wrap:anywhere] sm:w-64"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All problems ({overview.items.length})</SelectItem>
                            {FILTER_STATES.map((state) => <SelectItem key={state} value={state}>{MODULE_HEALTH_LABEL[state]} ({counts[state] ?? 0})</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" onClick={load}>Refresh</Button>
            </div>
            {shown.length === 0 ? (
                <p className="rounded-xl border p-4 text-sm text-muted-foreground">{overview.items.length === 0 ? "No module problems in any tenant." : "No modules in this state."}</p>
            ) : (
                <ul aria-label="Module problems" className="min-w-0 space-y-2">
                    {shown.map((item) => (
                        <li key={`${item.tenantId}-${item.moduleKey}`} className="min-w-0 rounded-xl border p-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Link href={`/platform-admin/tenants/${item.tenantId}`} className="min-w-0 break-words text-sm font-medium text-primary underline-offset-2 hover:underline">{item.tenantName}</Link>
                                <span className="min-w-0 break-words text-sm">{item.moduleName}</span>
                                <ModuleHealthBadge health={{ ...item, checked: true, checksFailed: 0 }} />
                            </div>
                            <ModuleHealthIssues health={{ ...item, checked: true, checksFailed: 0 }} links={false} showDetail />
                            <p className="mt-1 text-xs text-muted-foreground">Checked {formatWorkspaceDateTime(item.checkedAt)}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

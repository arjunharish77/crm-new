"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";

// GET /api/platform-admin/jobs/dead-letter: background jobs that failed on their last retry
// (see job-dead-letter.ts). The endpoint is read-only, so there is no retry or discard here --
// this is for spotting and diagnosing failures.
type DeadLetterRow = {
    id: string;
    queueName: string;
    jobName: string;
    jobId: string;
    tenantId: string | null;
    payload: unknown;
    errorMessage: string | null;
    attemptsMade: number;
    failedAt: string;
};

type TenantSummary = { id: string; name: string };

const ALL = "all";
const LIMIT = 200;

// Mirrors QUEUE_NAME_BY_CLASS in src/lib/server/job-registry.ts (server-only module).
const QUEUES: Array<{ value: string; label: string }> = [
    { value: "crm-jobs-realtime", label: "Realtime" },
    { value: "crm-jobs-operational", label: "Operational" },
    { value: "crm-jobs-heavy", label: "Heavy (exports, imports, reports)" },
    { value: "crm-jobs-ml", label: "Machine learning" },
];

function queueLabel(name: string) {
    return QUEUES.find((queue) => queue.value === name)?.label ?? name;
}

function formatPayload(value: unknown) {
    if (value === null || value === undefined) return "";
    try {
        return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export default function FailedJobsPage() {
    const [rows, setRows] = useState<DeadLetterRow[]>([]);
    const [tenants, setTenants] = useState<TenantSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [queueName, setQueueName] = useState<string>(ALL);
    const [tenantId, setTenantId] = useState<string>(ALL);
    const [selected, setSelected] = useState<DeadLetterRow | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setLoadError(null);
        const params = new URLSearchParams({ limit: String(LIMIT) });
        if (queueName !== ALL) params.set("queueName", queueName);
        if (tenantId !== ALL) params.set("tenantId", tenantId);
        apiFetch<{ rows: DeadLetterRow[]; total: number }>(`/platform-admin/jobs/dead-letter?${params.toString()}`)
            .then((data) => setRows(Array.isArray(data?.rows) ? data.rows : []))
            .catch((error: { message?: string }) => setLoadError(error?.message || "The failed jobs couldn't be loaded."))
            .finally(() => setLoading(false));
    }, [queueName, tenantId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        // Only used to show workspace names; ids are shown when this fails.
        apiFetch<TenantSummary[]>("/platform-admin/tenants")
            .then((data) => setTenants(Array.isArray(data) ? data : []))
            .catch(() => setTenants([]));
    }, []);

    const tenantName = useCallback((id: string | null) => {
        if (!id) return "No workspace";
        return tenants.find((tenant) => tenant.id === id)?.name ?? id;
    }, [tenants]);

    const columns = useMemo<ColumnDef<DeadLetterRow, any>[]>(() => [
        {
            accessorKey: "jobName", header: "Job", size: 240,
            cell: ({ row }) => (
                <div className="min-w-0">
                    <span className="block truncate font-medium">{row.original.jobName}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{row.original.jobId}</span>
                </div>
            ),
        },
        { accessorKey: "queueName", header: "Queue", size: 160, cell: ({ row }) => <span className="text-muted-foreground">{queueLabel(row.original.queueName)}</span> },
        { accessorKey: "tenantId", header: "Workspace", size: 180, cell: ({ row }) => <span className="block truncate">{tenantName(row.original.tenantId)}</span> },
        { accessorKey: "errorMessage", header: "Error", size: 320, cell: ({ row }) => <span className="block truncate text-destructive">{row.original.errorMessage || "No error message"}</span> },
        { accessorKey: "attemptsMade", header: () => <span className="block text-right">Attempts</span>, size: 90, cell: ({ row }) => <span className="block text-right tabular-nums">{row.original.attemptsMade}</span> },
        { accessorKey: "failedAt", header: "Failed", size: 170, cell: ({ row }) => <span className="text-muted-foreground">{formatWorkspaceDateTime(row.original.failedAt)}</span> },
    ], [tenantName]);

    const filtered = queueName !== ALL || tenantId !== ALL;
    const payload = selected ? formatPayload(selected.payload) : "";

    return (
        <div className="min-w-0">
            <PageHeader
                title="Failed jobs"
                description="Background jobs that failed on every retry. Use this to find what broke; jobs can't be retried from here."
                meta={loading || loadError ? undefined : <span className="tabular-nums">{rows.length >= LIMIT ? `Latest ${formatCount(LIMIT)}` : `${formatCount(rows.length)} failed`}</span>}
                secondaryActions={<Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="size-4" />Refresh</Button>}
            />
            {loadError ? <ErrorState description={loadError} onRetry={load} /> : (
                <DataTable
                    storageKey="platform-admin-failed-jobs-table"
                    data={rows}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    onRowClick={setSelected}
                    clientSort
                    toolbarActions={
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <Select value={queueName} onValueChange={setQueueName}>
                                <SelectTrigger className="w-full sm:w-56" aria-label="Queue"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All queues</SelectItem>
                                    {QUEUES.map((queue) => <SelectItem key={queue.value} value={queue.value}>{queue.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={tenantId} onValueChange={setTenantId}>
                                <SelectTrigger className="w-full sm:w-56" aria-label="Workspace"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All workspaces</SelectItem>
                                    {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {filtered && <Button variant="ghost" size="sm" onClick={() => { setQueueName(ALL); setTenantId(ALL); }}>Clear filters</Button>}
                        </div>
                    }
                    mobileCard={(row) => (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{row.jobName}</span><span className="shrink-0 text-xs text-muted-foreground">{formatWorkspaceDateTime(row.failedAt)}</span></div>
                            <div className="truncate text-xs text-destructive">{row.errorMessage || "No error message"}</div>
                            <div className="text-xs text-muted-foreground">{queueLabel(row.queueName)} · {tenantName(row.tenantId)}</div>
                        </div>
                    )}
                    emptyState={filtered
                        ? { title: "No failed jobs match", description: "Try another queue or workspace.", kind: "no-match" }
                        : { icon: <CircleCheck />, title: "No failed jobs", description: "Jobs that fail on every retry show up here." }}
                />
            )}

            <StandardDialog
                open={!!selected}
                onClose={() => setSelected(null)}
                title={selected?.jobName ?? "Failed job"}
                subtitle={selected ? `Failed ${formatWorkspaceDateTime(selected.failedAt)}` : undefined}
                maxWidth="md"
                actions={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}
            >
                {selected && (
                    <div className="space-y-4 py-2">
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                            <div><dt className="text-xs text-muted-foreground">Queue</dt><dd>{queueLabel(selected.queueName)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Workspace</dt><dd className="break-all">{tenantName(selected.tenantId)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Job id</dt><dd className="break-all font-mono text-xs">{selected.jobId}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Attempts</dt><dd className="tabular-nums">{selected.attemptsMade}</dd></div>
                        </dl>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Error</p>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-2 text-xs">{selected.errorMessage || "No error message"}</pre>
                        </div>
                        {payload && (
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Payload</p>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-2 text-xs">{payload}</pre>
                            </div>
                        )}
                    </div>
                )}
            </StandardDialog>
        </div>
    );
}

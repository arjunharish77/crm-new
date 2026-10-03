"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { formatWorkspaceDateTime } from "@/lib/date-format";

// One row of GET /api/marketplace/apps/[id]/actions/runs: each time an automation's "call app
// action" step called this app (see invokeAppAction in marketplace-postgres.ts).
type AppActionRun = {
    id: string;
    actionKey: string;
    automationId: string | null;
    input: unknown;
    status: "SUCCESS" | "FAILED";
    httpStatus: number | null;
    responseBody: string | null;
    errorMessage: string | null;
    createdAt: string;
};

const RUN_LIMIT = 50;

function formatJson(value: unknown) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function AppActionRunsPanel({ appId }: { appId: string }) {
    const [runs, setRuns] = useState<AppActionRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setLoadError(null);
        apiFetch<AppActionRun[]>(`/marketplace/apps/${appId}/actions/runs?limit=${RUN_LIMIT}`)
            .then((data) => setRuns(Array.isArray(data) ? data : []))
            .catch((error: { message?: string }) => setLoadError(error?.message || "The action history couldn't be loaded."))
            .finally(() => setLoading(false));
    }, [appId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <p role="status" className="py-6 text-sm text-muted-foreground">Loading action history…</p>;
    if (loadError) return <ErrorState variant="inline" description={loadError} onRetry={load} />;
    if (runs.length === 0) {
        return (
            <EmptyState
                variant="inline"
                icon={<History />}
                title="No action runs yet"
                description="Runs appear here when an automation calls one of this app's actions."
            />
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    {runs.length >= RUN_LIMIT ? `The latest ${RUN_LIMIT} runs` : `${runs.length} ${runs.length === 1 ? "run" : "runs"}`}, newest first.
                </p>
                <Button variant="outline" size="sm" onClick={load}>
                    <RefreshCw className="size-3.5" />
                    Refresh
                </Button>
            </div>
            <ul className="divide-y rounded-lg border">
                {runs.map((run) => {
                    const input = formatJson(run.input);
                    return (
                        <li key={run.id} className="space-y-1 p-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Badge tone={run.status === "SUCCESS" ? "success" : "danger"}>{run.status === "SUCCESS" ? "Succeeded" : "Failed"}</Badge>
                                <code className="min-w-0 break-all text-sm font-medium">{run.actionKey}</code>
                                {run.httpStatus !== null && <span className="text-xs text-muted-foreground">HTTP {run.httpStatus}</span>}
                                <span className="ml-auto text-xs text-muted-foreground">{formatWorkspaceDateTime(run.createdAt)}</span>
                            </div>
                            {run.errorMessage && run.errorMessage !== `HTTP ${run.httpStatus}` && <p className="break-words text-xs text-destructive">{run.errorMessage}</p>}
                            <p className="text-xs text-muted-foreground">
                                {run.automationId ? <>Called by automation <code className="break-all">{run.automationId}</code></> : "Called outside an automation"}
                            </p>
                            {(input || run.responseBody) && (
                                <details className="text-xs">
                                    <summary className="cursor-pointer rounded-md py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Request and response</summary>
                                    <div className="mt-1 space-y-2">
                                        {input && (
                                            <div className="space-y-1">
                                                <p className="text-muted-foreground">Input</p>
                                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-2 text-xs">{input}</pre>
                                            </div>
                                        )}
                                        {run.responseBody && (
                                            <div className="space-y-1">
                                                <p className="text-muted-foreground">Response</p>
                                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-2 text-xs">{run.responseBody}</pre>
                                            </div>
                                        )}
                                    </div>
                                </details>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

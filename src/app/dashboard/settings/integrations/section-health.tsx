"use client";

import { CheckCircle2, Ban, Info, AlertTriangle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { formatWorkspaceTime } from "@/lib/date-format";
import type { IntegrationsSettings } from "./use-integrations-settings";

// The "health" section of Settings › Integrations, moved here from page.tsx unchanged.
export function ConnectionHealthSection({ s }: { s: IntegrationsSettings }) {
    const { loading, sectionState, connectorHealth, connectorHealthCheckedAt, loadingHealth, fetchConnectorHealth } = s;
    return (
        <div className="min-w-0 space-y-4">{sectionState.health === 'loading' ? <p role="status" className="py-4 text-sm text-muted-foreground">Loading connector health…</p> : sectionState.health === 'error' ? <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load connector health. <Button variant="outline" size="sm" onClick={fetchConnectorHealth}>Retry</Button></div> : <>
                    <div className="flex min-w-0 flex-wrap items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Connector Health</h2>
                            <p className="text-sm text-muted-foreground">
                                {connectorHealthCheckedAt
                                    ? `Last checked ${formatWorkspaceTime(connectorHealthCheckedAt)}`
                                    : 'Live status for the systems this CRM depends on.'}
                            </p>
                        </div>
                        <Button variant="outline" onClick={fetchConnectorHealth} disabled={loadingHealth}>
                            <RefreshCw className={loadingHealth ? 'size-4 animate-spin' : 'size-4'} />
                            Refresh
                        </Button>
                    </div>

                    {loadingHealth && connectorHealth.length === 0 ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : connectorHealth.length === 0 ? (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>Click Refresh to check connector health.</AlertDescription>
                        </Alert>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <div className="divide-y">
                                {connectorHealth.map((check) => (
                                    <div key={check.key} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-4">
                                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                                            {check.status === 'ok' && <CheckCircle2 className="size-5 text-status-success-foreground" />}
                                            {check.status === 'degraded' && <AlertTriangle className="size-5 text-amber-500" />}
                                            {check.status === 'error' && <XCircle className="size-5 text-destructive" />}
                                            {check.status === 'not_configured' && <Ban className="size-5 text-muted-foreground" />}
                                            <div>
                                                <div className="font-medium">{check.label}</div>
                                                {check.detail && <div className="text-xs text-muted-foreground">{check.detail}</div>}
                                            </div>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            {typeof check.latencyMs === 'number' && (
                                                <span className="text-xs text-muted-foreground">{check.latencyMs}ms</span>
                                            )}
                                            <Badge
                                                variant="outline"
                                                className={
                                                    check.status === 'ok'
                                                        ? 'border-status-success bg-status-success text-status-success-foreground'
                                                        : check.status === 'degraded'
                                                          ? 'border-status-warning bg-status-warning text-status-warning-foreground'
                                                          : check.status === 'error'
                                                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                                            : 'border-muted bg-muted text-muted-foreground'
                                                }
                                            >
                                                {check.status.replace('_', ' ')}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </>}</div>
    );
}

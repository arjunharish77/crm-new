"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useFeature } from "@/components/auth/feature-gate";
import { TrendingUp, Play, Save, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { INBUILT_REPORT_OPTIONS, formatReportCell } from "./report-shared";


const ROLLUP_STATUS_STYLES: Record<string, string> = {
    FRESH: "border-green-600/30 bg-green-600/10 text-status-success-foreground",
    STALE: "border-amber-600/30 bg-amber-600/10 text-status-warning-foreground",
    REFRESHING: "border-blue-600/30 bg-blue-600/10 text-status-info-foreground",
    ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
};


function RollupFreshnessBadge({ state }: { state: any | null }) {
    if (!state) {
        return <span className="text-xs text-muted-foreground">No rollup has been generated for this report yet.</span>;
    }
    const style = ROLLUP_STATUS_STYLES[state.status] ?? "";
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("rounded-md gap-1", style)}>
                {state.status === "ERROR" ? <AlertTriangle className="size-3" /> : null}
                Rollup {state.status}
            </Badge>
            {state.lastSuccessfulAt ? (
                <span className="text-xs text-muted-foreground">
                    Last refreshed {formatWorkspaceRelativeTime(state.lastSuccessfulAt)}
                </span>
            ) : (
                <span className="text-xs text-muted-foreground">Never successfully refreshed</span>
            )}
            {state.status === "ERROR" && state.error ? (
                <span className="text-xs text-destructive">{state.error}</span>
            ) : null}
        </div>
    );
}


// `reportKey` (the /reports/standard/<key> viewer) opens that report, runs it, and drops the
// list of reports beside it: the Library is where you choose one.
export function InbuiltReportsSection({ reportKey }: { reportKey?: string } = {}) {
    const payoutsEnabled = useFeature("payoutsEnabled");
    const reportOptions = useMemo(
        () => INBUILT_REPORT_OPTIONS.filter((option) => option.value !== "commission_payout_summary" || payoutsEnabled),
        [payoutsEnabled],
    );
    // ?report=<key> (scheduled-report emails) opens that report and runs it once.
    const [linkedKey] = useState(() => {
        if (reportKey) return reportOptions.some((option) => option.value === reportKey) ? reportKey : null;
        if (typeof window === "undefined") return null;
        const key = new URLSearchParams(window.location.search).get("report");
        return key && reportOptions.some((option) => option.value === key) ? key : null;
    });
    const [selectedKey, setSelectedKey] = useState(linkedKey ?? reportOptions[0].value);
    const [report, setReport] = useState<any>(null);
    const [running, setRunning] = useState(false);
    const [attributionModel, setAttributionModel] = useState("FIRST_TOUCH");
    const [periodPreset, setPeriodPreset] = useState("THIS_MONTH_VS_LAST");
    const [cohortDimension, setCohortDimension] = useState("CREATED_DATE");
    const [funnelSegment, setFunnelSegment] = useState("SOURCE");
    const [refreshingRollup, setRefreshingRollup] = useState(false);
    const [refreshStates, setRefreshStates] = useState<any[]>([]);
    const [intervalDraft, setIntervalDraft] = useState("");
    const [savingInterval, setSavingInterval] = useState(false);
    const selected = reportOptions.find((option) => option.value === selectedKey) ?? reportOptions[0];
    const previewRows = useMemo(() => inbuiltReportPreviewRows(report), [report]);
    const previewColumns = useMemo(() => previewRows.length ? Object.keys(previewRows[0]).slice(0, 8) : [], [previewRows]);
    const rollupState = refreshStates.find((state) => state.reportKey === selected.value && state.scopeType === "ORG" && !state.scopeId) ?? null;

    const loadRefreshStates = async () => {
        try {
            const data = await apiFetch("/reports/rollups/status");
            setRefreshStates(data.states ?? []);
        } catch {
            // Non-admins can't read rollup status -- the freshness badge simply stays hidden.
        }
    };

    useEffect(() => {
        loadRefreshStates();
    }, []);

    useEffect(() => {
        setIntervalDraft(String(rollupState?.refreshIntervalMinutes ?? 15));
    }, [rollupState?.refreshIntervalMinutes, selectedKey]);

    const runReport = async (option = selected) => {
        setRunning(true);
        try {
            // Gap checklist Module 8, item 13: 8 attribution models total (up from 2) --
            // the model is passed as a query param rather than a dedicated report entry per
            // model, since the underlying report shape is identical across all of them.
            const endpoint =
                option.value === "marketing_attribution_summary" || option.value === "attribution_explorer"
                    ? `${option.endpoint}?model=${attributionModel}`
                    : option.value === "period_comparison"
                        ? `${option.endpoint}?preset=${periodPreset}`
                        : option.value === "cohort_funnel_progression"
                            ? `${option.endpoint}?dimension=${cohortDimension}`
                            : option.value === "funnel_explorer"
                                ? `${option.endpoint}?segment=${funnelSegment}`
                                : option.endpoint;
            const data = await apiFetch(endpoint);
            setSelectedKey(option.value);
            setReport(data);
            toast.success(`${option.label} loaded`);
        } catch (error: any) {
            toast.error(error.message || "Failed to load inbuilt report");
        } finally {
            setRunning(false);
        }
    };

    const linkedRunDone = useRef(false);
    useEffect(() => {
        if (!linkedKey || linkedRunDone.current) return;
        linkedRunDone.current = true;
        runReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkedKey]);

    const refreshRollup = async () => {
        setRefreshingRollup(true);
        try {
            await apiFetch("/reports/rollups/refresh", {
                method: "POST",
                body: JSON.stringify({ reportKey: selected.value, runNow: true }),
            });
            toast.success("Report rollup refreshed");
            await loadRefreshStates();
        } catch (error: any) {
            toast.error(error.message || "Failed to refresh report rollup");
            await loadRefreshStates();
        } finally {
            setRefreshingRollup(false);
        }
    };

    const saveRefreshInterval = async () => {
        const minutes = Number(intervalDraft);
        if (!Number.isFinite(minutes) || minutes < 1) {
            toast.error("Enter a refresh interval of at least 1 minute");
            return;
        }
        setSavingInterval(true);
        try {
            await apiFetch("/reports/rollups/policy", {
                method: "PATCH",
                body: JSON.stringify({ reportKey: selected.value, refreshIntervalMinutes: Math.round(minutes) }),
            });
            toast.success("Refresh policy saved");
            await loadRefreshStates();
        } catch (error: any) {
            toast.error(error.message || "Failed to save refresh policy");
        } finally {
            setSavingInterval(false);
        }
    };

    return (
        <Card className="mb-4 rounded-2xl">
            <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                <div className="flex min-w-0 flex-wrap justify-between gap-3">
                    {reportKey ? <p className="max-w-2xl text-sm text-muted-foreground">{selected.description}</p> : (
                    <div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <TrendingUp className="size-5 text-primary" />
                            <h2 className="text-lg font-bold">Inbuilt Reports</h2>
                            <Badge variant="outline" className="rounded-md">{reportOptions.length} reports</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Run the packaged CRM reports directly, preview the result, and export the current report.
                        </p>
                    </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => runReport()} disabled={running}>
                            <Play className="size-4" />
                            {running ? "Running…" : reportKey ? "Run again" : "Run Selected"}
                        </Button>
                        <QueueExportButton
                            moduleName="REPORTS"
                            filters={{ reportKind: "INBUILT", reportKey: selected.value }}
                            disabled={!report}
                        />
                        <Button variant="outline" onClick={refreshRollup} disabled={refreshingRollup}>
                            <RefreshCw className="size-4" />
                            {refreshingRollup ? "Refreshing..." : "Refresh Rollup"}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2">
                    <RollupFreshnessBadge state={rollupState} />
                    <div className="ml-auto flex items-center gap-2">
                        <Label htmlFor="rollup-refresh-interval" className="text-xs text-muted-foreground">
                            Auto-refresh every
                        </Label>
                        <Input
                            id="rollup-refresh-interval"
                            type="number"
                            min={1}
                            value={intervalDraft}
                            onChange={(e) => setIntervalDraft(e.target.value)}
                            className="h-8 w-20"
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                        <Button size="sm" variant="ghost" onClick={saveRefreshInterval} disabled={savingInterval}>
                            <Save className="size-3.5" />
                            Save
                        </Button>
                    </div>
                </div>

                <div className={cn("grid gap-4", !reportKey && "@min-[1100px]/reports:grid-cols-[320px_minmax(0,1fr)]")}>
                    {reportKey ? null : <div className="min-w-0 space-y-2">
                        {reportOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => runReport(option)}
                                className={cn(
                                    "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    selectedKey === option.value ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:bg-accent/50"
                                )}
                            >
                                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-bold">{option.label}</span>
                                    <Badge variant="outline" className="rounded-md text-xs font-semibold">
                                        {option.category}
                                    </Badge>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{option.description}</p>
                            </button>
                        ))}
                    </div>}

                    <div className="min-w-0 rounded-xl border bg-card">
                        <div className="flex flex-col justify-between gap-2 border-b px-4 py-3 md:flex-row md:items-center">
                            <div>
                                <div className="text-sm font-bold">{selected.label}</div>
                                <p className="text-xs text-muted-foreground">{selected.description}</p>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {selected.value === "marketing_attribution_summary" || selected.value === "attribution_explorer" ? (
                                    <Select value={attributionModel} onValueChange={setAttributionModel}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="FIRST_TOUCH">First Touch</SelectItem>
                                            <SelectItem value="LAST_TOUCH">Last Touch</SelectItem>
                                            <SelectItem value="LINEAR">Linear</SelectItem>
                                            <SelectItem value="U_SHAPED">U-Shaped</SelectItem>
                                            <SelectItem value="W_SHAPED">W-Shaped</SelectItem>
                                            <SelectItem value="TIME_DECAY">Time Decay</SelectItem>
                                            <SelectItem value="CAMPAIGN_SOURCE_OVERRIDE">Campaign Source Override</SelectItem>
                                            <SelectItem value="CUSTOM_WEIGHTED">Custom Weighted (equal)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {selected.value === "period_comparison" ? (
                                    <Select value={periodPreset} onValueChange={setPeriodPreset}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="THIS_WEEK_VS_LAST">This week vs. last week</SelectItem>
                                            <SelectItem value="THIS_MONTH_VS_LAST">This month vs. last month</SelectItem>
                                            <SelectItem value="THIS_QUARTER_VS_LAST">This quarter vs. last quarter</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {selected.value === "cohort_funnel_progression" ? (
                                    <Select value={cohortDimension} onValueChange={setCohortDimension}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CREATED_DATE">Created Date</SelectItem>
                                            <SelectItem value="SOURCE">Source</SelectItem>
                                            <SelectItem value="CAMPAIGN">Campaign</SelectItem>
                                            <SelectItem value="SCORE_BAND">Score Band</SelectItem>
                                            <SelectItem value="OWNER">Owner</SelectItem>
                                            <SelectItem value="SALES_GROUP">Sales Group</SelectItem>
                                            <SelectItem value="TEAM">Team</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {selected.value === "funnel_explorer" ? (
                                    <Select value={funnelSegment} onValueChange={setFunnelSegment}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SOURCE">Source</SelectItem>
                                            <SelectItem value="OWNER">Owner</SelectItem>
                                            <SelectItem value="OPPORTUNITY_TYPE">Opportunity Type</SelectItem>
                                            <SelectItem value="PARTNER">Partner</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {report?.generatedAt ? (
                                    <Badge variant="outline" className="w-fit rounded-md">
                                        Generated {formatWorkspaceDate(report.generatedAt)}
                                    </Badge>
                                ) : null}
                            </div>
                        </div>

                        {!report ? (
                            <div className="flex min-h-[260px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                                {reportKey ? (running ? "Running the report…" : "Run the report to see its rows.") : "Select a report and run it to see preview rows here."}
                            </div>
                        ) : previewRows.length === 0 ? (
                            <div className="flex min-h-[260px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                                Report returned no preview rows.
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {previewColumns.map((column) => (
                                            <TableHead key={column}>{humanizeReportKey(column)}</TableHead>
                                        ))}
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewRows.slice(0, 10).map((row, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {previewColumns.map((column) => (
                                                <TableCell key={column}>{formatReportCell(row[column])}</TableCell>
                                            ))}
                                            <TableCell>
                                                {inbuiltDrilldownHref(selected.value, row) ? (
                                                    <Button size="sm" variant="ghost" asChild>
                                                        <a href={inbuiltDrilldownHref(selected.value, row) ?? "#"} target="_blank" rel="noreferrer">
                                                            Open records
                                                        </a>
                                                    </Button>
                                                ) : null}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}


function inbuiltReportPreviewRows(report: any): Array<Record<string, unknown>> {
    if (!report) return [];
    if (Array.isArray(report.rows)) return report.rows as Array<Record<string, unknown>>;
    if (Array.isArray(report.issues)) return report.issues as Array<Record<string, unknown>>;
    if (Array.isArray(report.recentCycles)) return report.recentCycles as Array<Record<string, unknown>>;
    // Attribution explorer (gap checklist Module 17, item 7): bySource is its primary,
    // directly comparable breakdown -- byPartner/byJourney/touchPaths stay in the raw export,
    // not the on-screen preview table, same "one primary table" convention every other report
    // here follows.
    if (Array.isArray(report.bySource) && Array.isArray(report.touchPaths)) return report.bySource as Array<Record<string, unknown>>;
    // Anomaly detection (gap checklist Module 17, item 9): one summary row per domain --
    // the full daily `series` array stays in the raw export, not this table, same "one primary
    // table" convention as attribution explorer's bySource above.
    if (Array.isArray(report.domains) && typeof report.windowDays === "number") {
        return report.domains.map((domain: any) => ({
            domain: domain.domain,
            latestDate: domain.latestDate,
            latestValue: domain.latestValue,
            baselineMean: domain.baselineMean,
            baselineStdDev: domain.baselineStdDev,
            deviationInStdDevs: domain.deviationInStdDevs,
            anomaly: domain.isAnomaly ? domain.direction : "none",
        }));
    }
    // Forecast (gap checklist Module 17, item 10): one summary row per domain -- the day-by-day
    // `history`/`forecast` arrays stay in the raw export, not this table.
    if (Array.isArray(report.domains) && typeof report.horizonDays === "number") {
        return report.domains.map((domain: any) => {
            const last = domain.history?.[domain.history.length - 1];
            const nextForecast = domain.forecast?.[0];
            return {
                domain: domain.domain,
                latestActual: last?.value ?? null,
                latestActualDate: last?.date ?? null,
                nextForecastValue: nextForecast?.value ?? null,
                nextForecastDate: nextForecast?.date ?? null,
                trendPerDay: domain.slope,
            };
        });
    }
    // Executive scorecard (gap checklist Module 17, item 12): one row per (section, metric)
    // pair -- a flat table is the simplest honest rendering of "8 sections, each with its own
    // few key metrics," without inventing a bespoke multi-panel scorecard layout for this pass.
    if (Array.isArray(report.sections) && report.sections.every((section: any) => Array.isArray(section?.metrics))) {
        return report.sections.flatMap((section: any) =>
            section.metrics.map((metric: any) => ({ section: section.label, metric: metric.label, value: metric.value }))
        );
    }
    if (report.payoutStatusCounts && typeof report.payoutStatusCounts === "object") {
        return Object.entries(report.payoutStatusCounts).map(([status, count]) => ({ status, count }));
    }
    if (report.totals && typeof report.totals === "object") {
        return Object.entries(report.totals).map(([metric, value]) => ({ metric, value }));
    }
    return flattenObjectToRows(report);
}


function flattenObjectToRows(source: any, prefix = ""): Array<Record<string, unknown>> {
    if (!source || typeof source !== "object") return [];
    return Object.entries(source).flatMap(([key, value]) => {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) return flattenObjectToRows(value, nextKey);
        if (Array.isArray(value)) return [{ metric: nextKey, value: `${value.length} item(s)` }];
        return [{ metric: nextKey, value }];
    });
}


function humanizeReportKey(key: string) {
    return key
        .replace(/\./g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


function inbuiltDrilldownHref(reportKey: string, row: Record<string, unknown>) {
    if (reportKey === "funnel_conversion_by_stage" && row.stageId) {
        return filteredRecordsHref("/dashboard/opportunities", [{ field: "stageId", operator: "equals", value: row.stageId }]);
    }
    if ((reportKey === "funnel_conversion_by_source_campaign" || reportKey === "lead_source_roi") && row.source) {
        return filteredRecordsHref("/dashboard/leads", [{ field: "source", operator: "equals", value: row.source }]);
    }
    if ((reportKey === "rep_performance" || reportKey === "sla_response_breaches") && (row.repId || row.ownerId)) {
        return filteredRecordsHref("/dashboard/leads", [{ field: "ownerId", operator: "equals", value: row.repId ?? row.ownerId }]);
    }
    if (reportKey === "activity_call_volume_trends" && row.periodStart && row.periodEnd) {
        return filteredActivityHref([
            { field: "createdAt", operator: "gte", value: row.periodStart },
            { field: "createdAt", operator: "lte", value: row.periodEnd },
        ]);
    }
    if (reportKey === "commission_payout_summary" && row.partnerId) {
        return filteredRecordsHref("/dashboard/settings/access/partners", [{ field: "userId", operator: "equals", value: row.partnerId }]);
    }
    if (reportKey === "cohort_funnel_progression" && row.cohortStart && row.cohortEnd) {
        return filteredRecordsHref("/dashboard/leads", [
            { field: "createdAt", operator: "gte", value: row.cohortStart },
            { field: "createdAt", operator: "lte", value: row.cohortEnd },
        ]);
    }
    if (reportKey === "data_quality" && Array.isArray(row.recordIds) && row.recordIds[0]) {
        return filteredRecordsHref("/dashboard/leads", [{ field: "id", operator: "equals", value: row.recordIds[0] }]);
    }
    return null;
}


function filteredRecordsHref(pathname: string, conditions: Array<{ field: string; operator: string; value: unknown }>) {
    const params = new URLSearchParams();
    params.set("filters", JSON.stringify([{ logic: "AND", conditions }]));
    return `${pathname}?${params.toString()}`;
}


function filteredActivityHref(conditions: Array<{ field: string; operator: string; value: unknown }>) {
    const params = new URLSearchParams();
    params.set("filters", JSON.stringify({ logic: "AND", conditions }));
    return `/dashboard/activities?${params.toString()}`;
}

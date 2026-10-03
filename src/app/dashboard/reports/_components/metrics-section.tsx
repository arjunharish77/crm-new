"use client";

import { ErrorState } from "@/components/common/error-state";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { History, Plus, Save, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { StandardDialog } from "@/components/common/standard-dialog";
import type { MetricQueryResult } from "@/lib/server/reporting-query";
import { OBJECTS_BY_ROOT, OBJECT_LABELS, REPORT_OPERATORS, ROOT_OPTIONS, ReportRoot, formatFieldLabel } from "./report-shared";


const METRIC_AGGREGATIONS = [
    { value: "COUNT", label: "Count" },
    { value: "SUM", label: "Sum" },
    { value: "AVG", label: "Average" },
    { value: "MIN", label: "Minimum" },
    { value: "MAX", label: "Maximum" },
];

type MetricFilterState = { object: string; field: string; operator: string; value: string };


const EMPTY_METRIC_FORM = {
    name: "",
    description: "",
    root: "lead" as ReportRoot,
    aggregation: "COUNT",
    aggregateObject: "lead",
    aggregateField: "",
    groupByObject: "__none__",
    groupByField: "",
    visibility: "PRIVATE" as "PRIVATE" | "TEAM" | "TENANT",
    sharedWithTeamId: "",
    // Gap checklist Module 17's semantic metric layer, "grain" sub-item -- daily/weekly/monthly
    // configurable per metric, "__none__" (the default) keeps computing live, unchanged.
    grain: "__none__" as "__none__" | "DAILY" | "WEEKLY" | "MONTHLY",
};


const METRIC_GRAIN_OPTIONS = [
    { value: "__none__", label: "Live (no grain)" },
    { value: "DAILY", label: "Daily" },
    { value: "WEEKLY", label: "Weekly" },
    { value: "MONTHLY", label: "Monthly" },
];


// Gap checklist Module 17, item 2 (semantic metric layer). Self-service authoring only: pick
// an object + field + aggregation + filters + optional single groupBy dimension -- no free-text
// formula box, reusing the exact same catalog (`GET /reports/query`) the Custom Report Builder
// and Data Catalog tabs already fetch, so any object FIELD_CATALOG models (present or future)
// is selectable here with zero UI changes needed when the backend catalog grows.
export function MetricsSection() {
    const [catalog, setCatalog] = useState<Record<string, string[]>>({});
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
    const [metrics, setMetrics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [listError, setListError] = useState(false);
    const [metadataState, setMetadataState] = useState("loading");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_METRIC_FORM);
    const [filters, setFilters] = useState<MetricFilterState[]>([]);
    const [values, setValues] = useState<Record<string, MetricQueryResult | null>>({});
    const [computingId, setComputingId] = useState<string | null>(null);
    const [historyMetricId, setHistoryMetricId] = useState<string | null>(null);

    const loadMetrics = async () => {
        setLoading(true);
        setListError(false);
        try {
            const data = await apiFetch<any[]>("/metrics");
            setMetrics(Array.isArray(data) ? data : []);
        } catch (error: any) {
            setListError(true);
        } finally {
            setLoading(false);
        }
    };

    const loadMetadata = async () => {
        setMetadataState("loading");
        try {
            const [data, teamData] = await Promise.all([
                apiFetch<{ objects: Record<string, string[]> }>("/reports/query"),
                apiFetch<Array<{ id: string; name: string }>>("/teams"),
            ]);
            setCatalog(data.objects ?? {});
            setTeams(Array.isArray(teamData) ? teamData : []);
            setMetadataState("ready");
        } catch { setMetadataState("error"); }
    };
    useEffect(() => { loadMetadata(); loadMetrics(); }, []);

    const availableObjects = useMemo(
        () => OBJECTS_BY_ROOT[form.root].filter((object) => catalog[object]?.length),
        [catalog, form.root],
    );
    const fieldsForObject = (object: string) => {
        const fields = (catalog[object] ?? []).filter((field) => field !== "id" && !field.endsWith("Id"));
        return fields.length ? fields : (catalog[object] ?? []).filter((field) => field !== "id");
    };

    const resetForm = () => {
        setEditingId(null);
        setForm(EMPTY_METRIC_FORM);
        setFilters([]);
    };

    const changeRoot = (root: ReportRoot) => {
        const fields = fieldsForObject(root);
        setForm((current) => ({ ...current, root, aggregateObject: root, aggregateField: fields[0] ?? "", groupByObject: "__none__", groupByField: "" }));
        setFilters([]);
    };

    const addFilter = () => {
        const object = availableObjects[0] ?? form.root;
        setFilters((current) => [...current, { object, field: fieldsForObject(object)[0] ?? "id", operator: "equals", value: "" }]);
    };
    const updateFilter = (index: number, patch: Partial<MetricFilterState>) => {
        setFilters((current) => current.map((filter, filterIndex) => (filterIndex === index ? { ...filter, ...patch } : filter)));
    };

    const startEdit = (metric: any) => {
        setEditingId(metric.id);
        setForm({
            name: metric.name ?? "",
            description: metric.description ?? "",
            root: metric.root,
            aggregation: metric.aggregation,
            aggregateObject: metric.aggregateField?.object ?? metric.root,
            aggregateField: metric.aggregateField?.field ?? "",
            groupByObject: metric.groupBy?.object ?? "__none__",
            groupByField: metric.groupBy?.field ?? "",
            visibility: metric.visibility ?? "PRIVATE",
            sharedWithTeamId: metric.sharedWithTeamId ?? "",
            grain: metric.grain ?? "__none__",
        });
        setFilters((metric.filters ?? []).map((filter: any) => ({
            object: filter.object, field: filter.field, operator: filter.operator ?? "equals", value: filter.value === null || filter.value === undefined ? "" : String(filter.value),
        })));
        document.getElementById("metric-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const saveMetric = async () => {
        if (!form.name.trim()) {
            toast.error("Metric name is required");
            return;
        }
        if (form.aggregation !== "COUNT" && !form.aggregateField) {
            toast.error("Pick a field to aggregate, or switch to Count");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                root: form.root,
                aggregation: form.aggregation,
                aggregateField: form.aggregation === "COUNT" ? null : { object: form.aggregateObject, field: form.aggregateField },
                filters: filters.map((filter) => ({
                    object: filter.object,
                    field: filter.field,
                    operator: filter.operator,
                    value: filter.operator === "is_empty" || filter.operator === "is_not_empty" ? null : filter.value,
                })),
                groupBy: form.groupByObject === "__none__" ? null : { object: form.groupByObject, field: form.groupByField },
                visibility: form.visibility,
                sharedWithTeamId: form.visibility === "TEAM" ? form.sharedWithTeamId || null : null,
                grain: form.grain === "__none__" ? null : form.grain,
            };
            await apiFetch(editingId ? `/metrics/${editingId}` : "/metrics", {
                method: editingId ? "PATCH" : "POST",
                body: JSON.stringify(payload),
            });
            toast.success(editingId ? "Metric updated" : "Metric created");
            resetForm();
            await loadMetrics();
        } catch (error: any) {
            toast.error(error.message || "Failed to save metric");
        } finally {
            setSaving(false);
        }
    };

    const deleteMetric = async (id: string) => {
        try {
            await apiFetch(`/metrics/${id}`, { method: "DELETE" });
            setMetrics((current) => current.filter((metric) => metric.id !== id));
            toast.success("Metric deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete metric");
        }
    };

    const computeValue = async (id: string) => {
        setComputingId(id);
        try {
            const result = await apiFetch<MetricQueryResult>(`/metrics/${id}/value`);
            setValues((current) => ({ ...current, [id]: result }));
        } catch (error: any) {
            toast.error(error.message || "Failed to compute metric value");
        } finally {
            setComputingId(null);
        }
    };

    const setGovernance = async (id: string, patch: { certificationStatus?: string; deprecationStatus?: string }) => {
        try {
            await apiFetch(`/metrics/${id}/governance`, { method: "PATCH", body: JSON.stringify(patch) });
            toast.success("Metric governance updated");
            await loadMetrics();
        } catch (error: any) {
            toast.error(error.message || "You may not have permission to change this metric's governance state");
        }
    };

    const formatMetricValue = (result: MetricQueryResult | null | undefined) => {
        if (!result) return null;
        if (result.groups) return result.groups.map((group) => `${group.label}: ${group.value}`).join(", ");
        return String(result.value);
    };

    return (
        <div className="space-y-4">
            {metadataState === "loading" ? <Skeleton className="h-80 w-full" /> : metadataState === "error" ? <ErrorState description="Metric fields and teams could not be loaded." onRetry={loadMetadata} /> : <Card className="rounded-2xl" id="metric-builder">
                <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                    <div>
                        <h2 className="text-lg font-bold">{editingId ? "Edit Metric" : "New Metric"}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Pick an object, a field, and an aggregation -- no formula editor. Optional filters and a single group-by dimension.
                        </p>
                    </div>

                    <div className="grid gap-3 @min-[650px]/reports:grid-cols-2">
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="report-name-18">Name</Label>
                            <Input id="report-name-18" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Open pipeline value" />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="report-description-optional-19">Description (optional)</Label>
                            <Input id="report-description-optional-19" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="What this metric means and when to use it" />
                        </div>
                    </div>

                    <div className="grid gap-3 @min-[850px]/reports:grid-cols-3">
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="report-root-20">Root</Label>
                            <Select value={form.root} onValueChange={(value) => changeRoot(value as ReportRoot)}>
                                <SelectTrigger id="report-root-20" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ROOT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="report-aggregation-21">Aggregation</Label>
                            <Select value={form.aggregation} onValueChange={(value) => setForm((current) => ({ ...current, aggregation: value }))}>
                                <SelectTrigger id="report-aggregation-21" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {METRIC_AGGREGATIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {form.aggregation !== "COUNT" ? (
                            <div className="min-w-0 space-y-1.5">
                                <Label htmlFor="report-field-to-aggregate-22">Field to aggregate</Label>
                                <div className="grid gap-1.5">
                                    <Select
                                        value={form.aggregateObject}
                                        onValueChange={(object) => setForm((current) => ({ ...current, aggregateObject: object, aggregateField: fieldsForObject(object)[0] ?? "" }))}
                                    >
                                        <SelectTrigger id="report-field-to-aggregate-22" className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {availableObjects.map((object) => <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={form.aggregateField} onValueChange={(field) => setForm((current) => ({ ...current, aggregateField: field }))}>
                                        <SelectTrigger aria-label="Aggregate field" className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {fieldsForObject(form.aggregateObject).map((field) => <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-end text-xs text-muted-foreground">Count doesn&apos;t need a field -- it counts matching records.</div>
                        )}
                    </div>

                    <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="report-group-by-optional-23">Group by (optional)</Label>
                        <div className="grid gap-1.5 @min-[650px]/reports:grid-cols-2">
                            <Select
                                value={form.groupByObject}
                                onValueChange={(object) => setForm((current) => ({ ...current, groupByObject: object, groupByField: object === "__none__" ? "" : fieldsForObject(object)[0] ?? "", grain: object === "__none__" ? current.grain : "__none__" }))}
                            >
                                <SelectTrigger id="report-group-by-optional-23" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No grouping</SelectItem>
                                    {availableObjects.map((object) => <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {form.groupByObject !== "__none__" ? (
                                <Select value={form.groupByField} onValueChange={(field) => setForm((current) => ({ ...current, groupByField: field }))}>
                                    <SelectTrigger aria-label="Group by field" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {fieldsForObject(form.groupByObject).map((field) => <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            ) : null}
                        </div>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="report-grain-24">Grain</Label>
                        <Select
                            value={form.grain}
                            onValueChange={(grain) => setForm((current) => ({ ...current, grain: grain as typeof current.grain, groupByObject: grain === "__none__" ? current.groupByObject : "__none__", groupByField: grain === "__none__" ? current.groupByField : "" }))}
                        >
                            <SelectTrigger id="report-grain-24" className="w-full md:w-1/3"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {METRIC_GRAIN_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Tracks this metric&apos;s value over time instead of only its live total. Requires no group-by dimension.</p>
                    </div>

                    <div className="min-w-0 space-y-2">
                        <div className="flex min-w-0 flex-wrap items-center justify-between">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Filters</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                                <Plus className="size-4" />
                                Add Filter
                            </Button>
                        </div>
                        {filters.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-sm text-muted-foreground">No filters -- uses the full dataset for this root.</div>
                        ) : (
                            filters.map((filter, index) => (
                                <div key={index} className="grid gap-2 rounded-lg border bg-surface-container-low p-2 @min-[1100px]/reports:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                                    <Select value={filter.object} onValueChange={(object) => updateFilter(index, { object, field: fieldsForObject(object)[0] ?? "id" })}>
                                        <SelectTrigger aria-label={`Metric filter ${index + 1} object`} className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {availableObjects.map((object) => <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filter.field} onValueChange={(field) => updateFilter(index, { field })}>
                                        <SelectTrigger aria-label={`Metric filter ${index + 1} field`} className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {fieldsForObject(filter.object).map((field) => <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filter.operator} onValueChange={(operator) => updateFilter(index, { operator })}>
                                        <SelectTrigger aria-label={`Metric filter ${index + 1} operator`} className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {REPORT_OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Input aria-label={`Metric filter ${index + 1} value`}
                                        value={filter.operator === "is_empty" || filter.operator === "is_not_empty" ? "" : filter.value}
                                        disabled={filter.operator === "is_empty" || filter.operator === "is_not_empty"}
                                        placeholder={filter.operator === "is_empty" || filter.operator === "is_not_empty" ? "Not required" : "Value"}
                                        onChange={(e) => updateFilter(index, { value: e.target.value })}
                                    />
                                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFilters((current) => current.filter((_, filterIndex) => filterIndex !== index))} aria-label="Remove filter">
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="report-sharing-25">Sharing</Label>
                        <div className="grid gap-1.5 @min-[650px]/reports:grid-cols-2">
                            <Select value={form.visibility} onValueChange={(value) => setForm((current) => ({ ...current, visibility: value as "PRIVATE" | "TEAM" | "TENANT" }))}>
                                <SelectTrigger id="report-sharing-25" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PRIVATE">Only me</SelectItem>
                                    <SelectItem value="TEAM">My team</SelectItem>
                                    <SelectItem value="TENANT">Everyone in this workspace</SelectItem>
                                </SelectContent>
                            </Select>
                            {form.visibility === "TEAM" ? (
                                <Select value={form.sharedWithTeamId} onValueChange={(value) => setForm((current) => ({ ...current, sharedWithTeamId: value }))}>
                                    <SelectTrigger aria-label="Metric team" className="w-full"><SelectValue placeholder="Select a team" /></SelectTrigger>
                                    <SelectContent>
                                        {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">Sharing only affects who can view this metric -- only you can edit or delete it.</p>
                    </div>

                    <div className="flex justify-end gap-2">
                        {editingId ? <Button variant="outline" onClick={resetForm}>Cancel</Button> : null}
                        <Button onClick={saveMetric} disabled={saving}>
                            <Save className="size-4" />
                            {saving ? "Saving..." : editingId ? "Save Changes" : "Create Metric"}
                        </Button>
                    </div>
                </CardContent>
            </Card>}

            <Card className="rounded-2xl">
                <CardContent className="space-y-4 p-6">
                    <h2 className="text-lg font-bold">Metrics</h2>
                    {loading ? (
                        <Skeleton className="h-32 w-full rounded-xl" />
                    ) : listError ? <ErrorState description="Metrics could not be loaded." onRetry={loadMetrics} /> : metrics.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No metrics defined yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Definition</TableHead>
                                    <TableHead>Governance</TableHead>
                                    <TableHead>Sharing</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {metrics.map((metric) => (
                                    <TableRow key={metric.id}>
                                        <TableCell className="font-medium">
                                            {metric.name}
                                            {metric.description ? <p className="text-xs font-normal text-muted-foreground">{metric.description}</p> : null}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {metric.aggregation}{metric.aggregateField ? ` of ${OBJECT_LABELS[metric.aggregateField.object] ?? metric.aggregateField.object}.${formatFieldLabel(metric.aggregateField.field)}` : ""}
                                            {metric.groupBy ? ` by ${OBJECT_LABELS[metric.groupBy.object] ?? metric.groupBy.object}.${formatFieldLabel(metric.groupBy.field)}` : ""}
                                            {metric.grain ? <Badge variant="outline" className="ml-1.5 py-0 text-xs">{metric.grain}</Badge> : null}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <Badge
                                                    variant="outline"
                                                    className={cn("w-fit cursor-pointer rounded-md text-xs", metric.certificationStatus === "CERTIFIED" && "border-green-600 text-status-success-foreground")}
                                                    onClick={() => setGovernance(metric.id, { certificationStatus: metric.certificationStatus === "CERTIFIED" ? "UNCERTIFIED" : "CERTIFIED" })}
                                                >
                                                    {metric.certificationStatus === "CERTIFIED" ? "Certified" : "Uncertified"}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className={cn("w-fit cursor-pointer rounded-md text-xs", metric.deprecationStatus === "DEPRECATED" && "border-amber-600 text-status-warning-foreground")}
                                                    onClick={() => setGovernance(metric.id, { deprecationStatus: metric.deprecationStatus === "DEPRECATED" ? "ACTIVE" : "DEPRECATED" })}
                                                >
                                                    {metric.deprecationStatus === "DEPRECATED" ? "Deprecated" : "Active"}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {metric.visibility === "PRIVATE" ? "Only me" : metric.visibility === "TENANT" ? "Everyone" : `Team: ${teams.find((team) => team.id === metric.sharedWithTeamId)?.name ?? "—"}`}
                                        </TableCell>
                                        <TableCell className="max-w-[220px] truncate text-xs">
                                            {values[metric.id] !== undefined
                                                ? formatMetricValue(values[metric.id])
                                                : <Button variant="ghost" size="sm" onClick={() => computeValue(metric.id)} disabled={computingId === metric.id}>
                                                    {computingId === metric.id ? "Computing..." : "Compute"}
                                                </Button>}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {metric.grain ? (
                                                <Button variant="ghost" size="icon-sm" onClick={() => setHistoryMetricId(metric.id)} aria-label="View grain history">
                                                    <History className="size-4" />
                                                </Button>
                                            ) : null}
                                            {metric.isOwner ? (
                                                <>
                                                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(metric)} aria-label="Edit metric">
                                                        <RefreshCw className="size-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon-sm" onClick={() => deleteMetric(metric.id)} aria-label="Delete metric">
                                                        <Trash2 className="size-4 text-destructive" />
                                                    </Button>
                                                </>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <MetricGrainHistoryDialog metricId={historyMetricId} onClose={() => setHistoryMetricId(null)} />
        </div>
    );
}


// Gap checklist Module 17's semantic metric layer, "grain" sub-item -- the stored period-
// snapshot history for a grain-enabled metric.
function MetricGrainHistoryDialog({ metricId, onClose }: { metricId: string | null; onClose: () => void }) {
    const [series, setSeries] = useState<Array<{ date: string; value: number }>>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!metricId) return;
        setLoading(true);
        apiFetch<{ grain: string | null; series: Array<{ date: string; value: number }> }>(`/metrics/${metricId}/series`)
            .then((data) => setSeries(Array.isArray(data.series) ? data.series : []))
            .catch((error: any) => toast.error(error.message || "Failed to load grain history"))
            .finally(() => setLoading(false));
    }, [metricId]);

    return (
        <StandardDialog open={!!metricId} onClose={onClose} title="Grain History" subtitle="One stored value per completed period -- new periods appear here once a background job computes them.">
            {loading ? (
                <Skeleton className="m-4 h-24 rounded-xl" />
            ) : series.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No periods computed yet.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Period Start</TableHead>
                            <TableHead>Value</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {series.map((point) => (
                            <TableRow key={point.date}>
                                <TableCell className="text-xs">{formatWorkspaceDate(point.date)}</TableCell>
                                <TableCell className="text-xs font-medium">{point.value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </StandardDialog>
    );
}

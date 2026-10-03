"use client";

import { ErrorState } from "@/components/common/error-state";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";


const CALCULATED_METRIC_OPERATORS = [
    { value: "+", label: "+" },
    { value: "-", label: "−" },
    { value: "*", label: "×" },
    { value: "/", label: "÷" },
];


type CalculatedMetricStepDraft = { metricId: string; operator: string | null };


// Gap checklist Module 17, item 16 ("custom calculated fields/measures"). Simple fixed-operator
// math chaining already-defined metrics only -- no free-text formula box, reusing whatever the
// metric layer (built earlier this pass) already produces.
export function CalculatedMetricsSection() {
    const [metrics, setMetrics] = useState<any[]>([]);
    const [calculatedMetrics, setCalculatedMetrics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [name, setName] = useState("");
    const [steps, setSteps] = useState<CalculatedMetricStepDraft[]>([]);
    const [values, setValues] = useState<Record<string, number | null | undefined>>({});
    const [computingId, setComputingId] = useState<string | null>(null);

    const loadCalculatedMetrics = async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [base, calculated] = await Promise.all([
                apiFetch<any[]>("/metrics"), apiFetch<any[]>("/calculated-metrics"),
            ]);
            setMetrics(Array.isArray(base) ? base : []);
            setCalculatedMetrics(Array.isArray(calculated) ? calculated : []);
        } catch { setLoadError(true); }
        finally { setLoading(false); }
    };
    useEffect(() => { loadCalculatedMetrics(); }, []);

    const metricLabel = (id: string) => metrics.find((m) => m.id === id)?.name ?? id;

    const addStep = () => {
        const defaultMetricId = metrics[0]?.id ?? "";
        setSteps((current) => [...current, { metricId: defaultMetricId, operator: current.length === 0 ? null : "+" }]);
    };
    const updateStep = (index: number, patch: Partial<CalculatedMetricStepDraft>) => {
        setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
    };
    const removeStep = (index: number) => {
        setSteps((current) => current.filter((_, i) => i !== index).map((step, i) => (i === 0 ? { ...step, operator: null } : step)));
    };

    const save = async () => {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        if (steps.length < 2 || steps.some((step) => !step.metricId)) {
            toast.error("Pick at least 2 metrics to chain");
            return;
        }
        setSaving(true);
        try {
            await apiFetch("/calculated-metrics", { method: "POST", body: JSON.stringify({ name: name.trim(), steps }) });
            toast.success("Calculated metric created");
            setName("");
            setSteps([]);
            await loadCalculatedMetrics();
        } catch (error: any) {
            toast.error(error.message || "Failed to save calculated metric");
        } finally {
            setSaving(false);
        }
    };

    const deleteCalculatedMetric = async (id: string) => {
        try {
            await apiFetch(`/calculated-metrics/${id}`, { method: "DELETE" });
            setCalculatedMetrics((current) => current.filter((m) => m.id !== id));
        } catch (error: any) {
            toast.error(error.message || "Failed to delete calculated metric");
        }
    };

    const computeValue = async (id: string) => {
        setComputingId(id);
        try {
            const result = await apiFetch<{ value: number | null }>(`/calculated-metrics/${id}/value`);
            setValues((current) => ({ ...current, [id]: result.value }));
        } catch (error: any) {
            toast.error(error.message || "Failed to compute calculated metric");
        } finally {
            setComputingId(null);
        }
    };

    const expressionFor = (metricSteps: CalculatedMetricStepDraft[]) =>
        metricSteps.map((step, i) => (i === 0 ? metricLabel(step.metricId) : `${step.operator} ${metricLabel(step.metricId)}`)).join(" ");

    if (loadError) return <ErrorState description="Calculated metrics and source metrics could not be loaded." onRetry={loadCalculatedMetrics} />;
    if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;

    return (
        <Card className="rounded-2xl">
            <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                <div>
                    <h2 className="text-lg font-bold">Calculated Metrics</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Chain existing metrics with +, −, ×, ÷ -- no free-text formulas.</p>
                </div>

                <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="report-name-26">Name</Label>
                        <Input id="report-name-26" value={name} onChange={(e) => setName(e.target.value)} placeholder="Net Revenue per Lead" />
                    </div>
                    <div className="min-w-0 space-y-2">
                        {steps.map((step, index) => (
                            <div key={index} className="flex min-w-0 flex-wrap items-center gap-2">
                                {index > 0 ? (
                                    <Select value={step.operator ?? "+"} onValueChange={(operator) => updateStep(index, { operator })}>
                                        <SelectTrigger aria-label={`Step ${index + 1} operator`} className="w-16"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CALCULATED_METRIC_OPERATORS.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                ) : <span className="w-16 text-center text-sm text-muted-foreground">Start</span>}
                                <Select value={step.metricId} onValueChange={(metricId) => updateStep(index, { metricId })}>
                                    <SelectTrigger aria-label={`Step ${index + 1} metric`} className="min-w-0 flex-1 basis-40"><SelectValue placeholder="Choose a metric" /></SelectTrigger>
                                    <SelectContent>
                                        {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeStep(index)} aria-label="Remove step">
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addStep} disabled={!metrics.length}>
                            <Plus className="size-4" />
                            Add Metric
                        </Button>
                        {!metrics.length ? <p className="text-xs text-muted-foreground">Create a metric in the Metrics section first.</p> : null}
                    </div>
                    <div className="flex justify-end">
                        <Button className="h-auto min-h-9 whitespace-normal" onClick={save} disabled={saving || !name.trim() || steps.length === 0}>{saving ? "Saving..." : "Create Calculated Metric"}</Button>
                    </div>
                </div>

                {calculatedMetrics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No calculated metrics yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Formula</TableHead>
                                <TableHead>Value</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calculatedMetrics.map((metric) => (
                                <TableRow key={metric.id}>
                                    <TableCell className="font-medium">{metric.name}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{expressionFor(metric.steps)}</TableCell>
                                    <TableCell className="text-xs">
                                        {values[metric.id] !== undefined
                                            ? (values[metric.id] === null ? "—" : values[metric.id])
                                            : <Button variant="ghost" size="sm" onClick={() => computeValue(metric.id)} disabled={computingId === metric.id}>
                                                {computingId === metric.id ? "Computing..." : "Compute"}
                                            </Button>}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {metric.isOwner ? (
                                            <Button variant="ghost" size="icon-sm" onClick={() => deleteCalculatedMetric(metric.id)} aria-label="Delete calculated metric">
                                                <Trash2 className="size-4 text-destructive" />
                                            </Button>
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

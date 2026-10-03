"use client";

import { ErrorState } from "@/components/common/error-state";
import { useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";


// Gap checklist Module 17, item 8 ("segmentation and comparison tools" -- the bullet's own core
// remaining gap: "a user picking any two arbitrary segments and diffing them side by side").
// Deliberately allows comparing across mismatched levels/dimensions (LEAD vs OPPORTUNITY, any
// dimension vs any other), per explicit user direction. LEAD_DIMENSIONS/OPPORTUNITY_DIMENSIONS
// must stay in sync with the server's own LEAD_COMPARISON_DIMENSIONS/
// OPPORTUNITY_COMPARISON_DIMENSIONS (inbuilt-reports.ts) -- small, stable, fixed lists, not
// worth a dedicated catalog endpoint just for this.
const COMPARISON_LEVELS = [
    { value: "LEAD", label: "Leads" },
    { value: "OPPORTUNITY", label: "Opportunities" },
];

const LEAD_DIMENSIONS = [
    { value: "SOURCE", label: "Source" },
    { value: "CAMPAIGN", label: "Campaign" },
    { value: "SCORE_BAND", label: "Score Band" },
    { value: "OWNER", label: "Owner" },
];

const OPPORTUNITY_DIMENSIONS = [
    { value: "SOURCE", label: "Source" },
    { value: "OWNER", label: "Owner" },
    { value: "OPPORTUNITY_TYPE", label: "Opportunity Type" },
    { value: "PARTNER", label: "Partner" },
    { value: "STAGE", label: "Stage" },
];


type ComparisonSegmentDraft = { level: "LEAD" | "OPPORTUNITY"; dimension: string; value: string };

const EMPTY_SEGMENT_DRAFT: ComparisonSegmentDraft = { level: "LEAD", dimension: "SOURCE", value: "" };


function SegmentBuilder({ label, segment, onChange }: { label: string; segment: ComparisonSegmentDraft; onChange: (next: ComparisonSegmentDraft) => void }) {
    const id = useId();
    const dimensionOptions = segment.level === "LEAD" ? LEAD_DIMENSIONS : OPPORTUNITY_DIMENSIONS;
    return (
        <fieldset className="@container/segment min-w-0 space-y-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-semibold">{label}</legend>
            <div className="grid gap-3 @min-[520px]/segment:grid-cols-3">
                <div className="min-w-0 space-y-1"><Label htmlFor={`${id}-level`}>Records</Label><Select value={segment.level} onValueChange={(level) => onChange({ level: level as "LEAD" | "OPPORTUNITY", dimension: level === "LEAD" ? "SOURCE" : "SOURCE", value: "" })}>
                    <SelectTrigger id={`${id}-level`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {COMPARISON_LEVELS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select></div>
                <div className="min-w-0 space-y-1"><Label htmlFor={`${id}-dimension`}>Group by</Label><Select value={segment.dimension} onValueChange={(dimension) => onChange({ ...segment, dimension, value: "" })}>
                    <SelectTrigger id={`${id}-dimension`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {dimensionOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select></div>
                <div className="min-w-0 space-y-1"><Label htmlFor={`${id}-value`}>Exact value</Label><Input id={`${id}-value`} value={segment.value} onChange={(e) => onChange({ ...segment, value: e.target.value })} placeholder="e.g. Website" /></div>
            </div>
        </fieldset>
    );
}


export function SegmentComparisonSection() {
    const [segmentA, setSegmentA] = useState<ComparisonSegmentDraft>(EMPTY_SEGMENT_DRAFT);
    const [segmentB, setSegmentB] = useState<ComparisonSegmentDraft>({ ...EMPTY_SEGMENT_DRAFT });
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [compareError, setCompareError] = useState(false);
    const requestVersion = useRef(0);
    const changeSegment = (which: "A" | "B", next: ComparisonSegmentDraft) => {
        requestVersion.current += 1;
        setLoading(false);
        setCompareError(false);
        setResult(null);
        if (which === "A") setSegmentA(next); else setSegmentB(next);
    };

    const compare = async () => {
        if (!segmentA.value.trim() || !segmentB.value.trim()) {
            toast.error("Both segments need a value to compare");
            return;
        }
        const version = ++requestVersion.current;
        setLoading(true);
        setCompareError(false);
        setResult(null);
        try {
            const params = new URLSearchParams({
                levelA: segmentA.level, dimensionA: segmentA.dimension, valueA: segmentA.value.trim(),
                levelB: segmentB.level, dimensionB: segmentB.dimension, valueB: segmentB.value.trim(),
            });
            const data = await apiFetch(`/reports/inbuilt/segment-comparison?${params.toString()}`);
            if (requestVersion.current === version) setResult(data);
        } catch (error: any) {
            if (requestVersion.current === version) setCompareError(true);
        } finally {
            if (requestVersion.current === version) setLoading(false);
        }
    };

    return (
        <Card className="rounded-2xl">
            <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                <div>
                    <h2 className="text-lg font-bold">Compare Segments</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Pick any two segments -- even across leads and opportunities, or different dimensions -- and diff them side by side.
                    </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <SegmentBuilder label="Segment A" segment={segmentA} onChange={next => changeSegment("A", next)} />
                    <SegmentBuilder label="Segment B" segment={segmentB} onChange={next => changeSegment("B", next)} />
                </div>

                <div className="flex justify-end">
                    <Button onClick={compare} disabled={loading || !segmentA.value.trim() || !segmentB.value.trim()}>{loading ? "Comparing..." : "Compare"}</Button>
                </div>

                {compareError ? <ErrorState description="Segments could not be compared. Your inputs have been kept." onRetry={compare} /> : null}
                {result ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Segment</TableHead>
                                <TableHead>Records</TableHead>
                                <TableHead>Won</TableHead>
                                <TableHead>Win Rate</TableHead>
                                <TableHead>Avg Deal Value</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {result.segments.map((segment: any, index: number) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">
                                        {segment.level === "LEAD" ? "Lead" : "Opportunity"}: {segment.dimension} = {segment.value}
                                    </TableCell>
                                    <TableCell>{segment.recordCount}</TableCell>
                                    <TableCell>{segment.wonCount}</TableCell>
                                    <TableCell>{segment.wonRate !== null ? `${(segment.wonRate * 100).toFixed(1)}%` : "—"}</TableCell>
                                    <TableCell>{segment.avgDealValue !== null ? formatCurrency(segment.avgDealValue) : "—"}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : null}
            </CardContent>
        </Card>
    );
}

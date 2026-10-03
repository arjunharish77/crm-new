"use client";

import { useEffect, useState } from "react";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";


const ANNOTATION_CATEGORIES = [
    { value: "CAMPAIGN", label: "Campaign" },
    { value: "EVENT", label: "Event" },
    { value: "OUTAGE", label: "Outage" },
    { value: "POLICY_CHANGE", label: "Policy Change" },
    { value: "INTAKE_DEADLINE", label: "Intake Deadline" },
    { value: "FEE_DEADLINE", label: "Fee Deadline" },
    { value: "LAUNCH", label: "Launch" },
    { value: "OTHER", label: "Other" },
];


// Gap checklist Module 17, item 21: mark campaigns/events/outages/policy changes/intake and fee
// deadlines/launch dates for context. A flat management list here (not yet overlaid directly on
// every chart) -- see the checklist writeup for what's built vs. deferred.
export function ReportAnnotationsSection() {
    const [annotations, setAnnotations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [label, setLabel] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("LAUNCH");
    const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));

    const fetchAnnotations = async () => {
        setLoading(true);
        try {
            const data = await apiFetch<any[]>("/reports/annotations");
            setAnnotations(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load annotations");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnnotations();
    }, []);

    const createAnnotation = async () => {
        if (!label.trim()) {
            toast.error("Label is required");
            return;
        }
        setSaving(true);
        try {
            await apiFetch("/reports/annotations", {
                method: "POST",
                body: JSON.stringify({ label: label.trim(), description: description.trim() || null, category, occurredAt }),
            });
            toast.success("Annotation added");
            setLabel("");
            setDescription("");
            await fetchAnnotations();
        } catch (error: any) {
            toast.error(error.message || "Failed to add annotation");
        } finally {
            setSaving(false);
        }
    };

    const deleteAnnotation = async (id: string) => {
        try {
            await apiFetch(`/reports/annotations/${id}`, { method: "DELETE" });
            setAnnotations((current) => current.filter((item) => item.id !== id));
            toast.success("Annotation removed");
        } catch (error: any) {
            toast.error(error.message || "Failed to remove annotation");
        }
    };

    return (
        <Card className="rounded-2xl">
            <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                <div>
                    <h2 className="text-lg font-bold">Analytics Annotations</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Mark campaigns, events, outages, policy changes, and deadlines for context when reviewing trends.
                    </p>
                </div>

                <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 @min-[600px]/reports:grid-cols-2 @min-[1100px]/reports:grid-cols-3">
                    <div className="space-y-1.5 lg:col-span-2">
                        <Label htmlFor="report-label-14">Label</Label>
                        <Input id="report-label-14" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fall intake launch" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="report-category-15">Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger id="report-category-15" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {ANNOTATION_CATEGORIES.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="report-date-16">Date</Label>
                        <Input id="report-date-16" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={createAnnotation} disabled={saving} className="w-full">
                            <Plus className="size-4" />
                            {saving ? "Adding..." : "Add"}
                        </Button>
                    </div>
                    <div className="space-y-1.5 md:col-span-2 lg:col-span-5">
                        <Label htmlFor="report-description-optional-17">Description (optional)</Label>
                        <Input id="report-description-optional-17" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, and why it matters for this metric" />
                    </div>
                </div>

                {loading ? (
                    <Skeleton className="h-32 w-full rounded-xl" />
                ) : annotations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No annotations yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {annotations.map((annotation) => (
                                <TableRow key={annotation.id}>
                                    <TableCell>{formatWorkspaceDate(annotation.occurredAt)}</TableCell>
                                    <TableCell className="font-medium">{annotation.label}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="rounded-md">
                                            {ANNOTATION_CATEGORIES.find((option) => option.value === annotation.category)?.label ?? annotation.category}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[320px] truncate text-muted-foreground">{annotation.description || "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon-sm" onClick={() => deleteAnnotation(annotation.id)}>
                                            <Trash2 className="size-4 text-destructive" />
                                        </Button>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StandardDialog } from "@/components/common/standard-dialog";
import { FlaskConical, Play, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SimulateDialogProps {
    open: boolean;
    onClose: () => void;
}

// Read-only dry run: exercises the exact same matching/candidate-selection/quota/skill logic
// distributeRecord uses in production, but never writes ownerId, an AuditLog row, or advances
// a round-robin cursor -- modeled on the automation builder's TestWorkflowDialog (same
// record-fetch + pick-a-real-record pattern), since simulating against a real record's actual
// field values is more useful than hand-building a synthetic one.
export function SimulateDistributionDialog({ open, onClose }: SimulateDialogProps) {
    const [entityType, setEntityType] = useState<"LEAD" | "OPPORTUNITY">("LEAD");
    const [leads, setLeads] = useState<any[]>([]);
    const [opportunities, setOpportunities] = useState<any[]>([]);
    const [recordId, setRecordId] = useState("");
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [simulating, setSimulating] = useState(false);
    const [outcome, setOutcome] = useState<any>(null);

    useEffect(() => {
        if (!open) return;
        setLoadingRecords(true);
        Promise.all([
            apiFetch<any>("/leads?limit=100").then((response) => setLeads(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [])).catch(() => setLeads([])),
            apiFetch<any>("/opportunities?limit=100").then((response) => setOpportunities(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [])).catch(() => setOpportunities([])),
        ]).finally(() => setLoadingRecords(false));
    }, [open]);

    const records = entityType === "LEAD" ? leads : opportunities;
    const recordOptions = useMemo(
        () => records.map((record) => ({ id: record.id, label: entityType === "LEAD" ? (record.name || record.email || "Unnamed lead") : (record.title || record.name || "Untitled opportunity") })),
        [records, entityType]
    );
    const selectedRecord = records.find((record) => record.id === recordId) ?? null;

    const runSimulation = async () => {
        if (!selectedRecord) return;
        setSimulating(true);
        setOutcome(null);
        try {
            const data = await apiFetch("/assignment/simulate", {
                method: "POST",
                body: JSON.stringify({ entityType, record: selectedRecord }),
            });
            setOutcome(data);
        } catch (error: any) {
            setOutcome({ error: error.message || "Failed to simulate distribution" });
        } finally {
            setSimulating(false);
        }
    };

    const handleClose = () => {
        onClose();
        setOutcome(null);
        setRecordId("");
    };

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Simulate Distribution"
            subtitle="See which rule and user would be picked, without actually assigning anything"
            icon={<FlaskConical className="size-5" />}
            maxWidth="md"
        >
            <div className="mb-3 space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-2">
                    <Label>Entity Type</Label>
                    <Select value={entityType} onValueChange={(value) => { setEntityType(value as any); setRecordId(""); setOutcome(null); }}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LEAD">Lead</SelectItem>
                            <SelectItem value="OPPORTUNITY">Opportunity</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>{entityType === "LEAD" ? "Lead" : "Opportunity"}</Label>
                    <Select value={recordId || "__none__"} onValueChange={(value) => setRecordId(value === "__none__" ? "" : value)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder={loadingRecords ? "Loading records..." : "Select a record"} /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">Select a record</SelectItem>
                            {recordOptions.map((record) => <SelectItem key={record.id} value={record.id}>{record.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={runSimulation} disabled={simulating || !recordId} className="w-full">
                    {simulating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {simulating ? "Simulating..." : "Run Simulation"}
                </Button>
            </div>

            {outcome && (
                <div className="space-y-3">
                    {outcome.error ? (
                        <Alert variant="destructive">
                            <XCircle className="size-4" />
                            <AlertTitle>Simulation Failed</AlertTitle>
                            <AlertDescription>{outcome.error}</AlertDescription>
                        </Alert>
                    ) : (
                        <Alert variant={outcome.result?.assignedUserId ? "default" : "destructive"}>
                            {outcome.result?.assignedUserId ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                            <AlertTitle>{outcome.result?.reason}</AlertTitle>
                            <AlertDescription>
                                {outcome.result?.assignedUserId
                                    ? `Would assign to user ${outcome.result.assignedUserId} via ${outcome.result.strategy ?? "the matched rule"}.`
                                    : "No rule matched, or no eligible candidate was found."}
                            </AlertDescription>
                        </Alert>
                    )}

                    {Array.isArray(outcome.trace) && outcome.trace.length > 0 && (
                        <div className="overflow-hidden rounded-lg border">
                            <div className="border-b bg-muted/50 px-3 py-2">
                                <span className="text-sm font-semibold">Rules Evaluated</span>
                            </div>
                            <div className="max-h-[280px] overflow-y-auto divide-y">
                                {outcome.trace.map((step: any, index: number) => (
                                    <div key={index} className="p-3 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold">{step.ruleName}</span>
                                            {step.selectedUserId ? (
                                                <Badge variant={step.usedFallback ? "secondary" : "default"} className="rounded-md">
                                                    {step.usedFallback ? "Fallback used" : "Selected"}
                                                </Badge>
                                            ) : (
                                                <Badge variant="destructive" className="rounded-md">No eligible user</Badge>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">{step.reason}</p>
                                        {step.candidates?.length > 0 && (
                                            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                                {step.candidates.map((candidate: any) => (
                                                    <li key={candidate.id} className="flex items-center justify-between">
                                                        <span>{candidate.name || candidate.email || candidate.id}</span>
                                                        {candidate.excludedReason ? <span className="text-destructive">{candidate.excludedReason}</span> : candidate.id === step.selectedUserId ? <span className="text-primary">Picked</span> : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </StandardDialog>
    );
}

"use client";
import { ModuleGate } from "@/components/common/module-gate";
import { PanelHeader } from "@/components/layout/panel-header";
import { SegmentedControl } from "@/components/common/page-tabs";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GitMerge, History, RefreshCw, ShieldOff, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";

type EntityType = "LEAD" | "OPPORTUNITY" | "CASE";

type MatchRule = {
    id: string;
    entityType: EntityType;
    ruleType: "EXACT_EMAIL" | "EXACT_PHONE" | "FUZZY_NAME" | "SAME_REQUESTER_EMAIL_OPEN";
    threshold: number | null;
    isActive: boolean;
};

type MatchRecord = { id: string; name?: string; title?: string; email?: string; phone?: string; company?: string; leadId?: string; caseNumber?: number; subject?: string; requesterEmail?: string };

type DedupeMatch = {
    id: string;
    entityType: EntityType;
    recordIds: string[];
    matchedRuleType: string;
    matchScore: number | null;
    status: "PENDING" | "MERGED" | "DISMISSED";
    records: MatchRecord[];
    createdAt: string;
};

type MergeAudit = {
    id: string;
    entityType: EntityType;
    survivorId: string;
    loserId: string;
    mergedBy: string;
    unmergedAt: string | null;
    createdAt: string;
};

const RULE_LABELS: Record<MatchRule["ruleType"], string> = {
    EXACT_EMAIL: "Exact email match",
    EXACT_PHONE: "Exact phone match",
    FUZZY_NAME: "Fuzzy name match",
    SAME_REQUESTER_EMAIL_OPEN: "Same requester email, both still open",
};

function recordLabel(record: MatchRecord, entityType: EntityType) {
    if (entityType === "LEAD") return `${record.name ?? "(no name)"} -- ${record.email ?? record.phone ?? "no contact info"}`;
    if (entityType === "CASE") return `Case #${record.caseNumber ?? "?"} -- ${record.subject ?? "(no subject)"}`;
    return `${record.title ?? "(no title)"}`;
}

function DedupePanel({ entityType }: { entityType: EntityType }) {
    const [rules, setRules] = useState<MatchRule[]>([]);
    const [matches, setMatches] = useState<DedupeMatch[]>([]);
    const [audits, setAudits] = useState<MergeAudit[]>([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [survivorByMatch, setSurvivorByMatch] = useState<Record<string, string>>({});
    const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const entityRules = rules.filter((r) => r.entityType === entityType);

    const load = () => {
        setLoading(true);
        Promise.all([
            apiFetch<MatchRule[]>("/dedupe/rules"),
            apiFetch<DedupeMatch[]>(`/dedupe/matches?entityType=${entityType}&status=PENDING`),
            apiFetch<MergeAudit[]>(`/dedupe/audits?entityType=${entityType}`),
        ])
            .then(([ruleData, matchData, auditData]) => {
                setRules(Array.isArray(ruleData) ? ruleData : []);
                setMatches(Array.isArray(matchData) ? matchData : []);
                setAudits(Array.isArray(auditData) ? auditData : []);
            })
            .catch(() => toast.error("Failed to load dedupe data"))
            .finally(() => setLoading(false));
    };

    useEffect(load, [entityType]);

    const toggleRule = async (rule: MatchRule, isActive: boolean) => {
        try {
            await apiFetch(`/dedupe/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
            setRules((current) => current.map((r) => (r.id === rule.id ? { ...r, isActive } : r)));
        } catch (error: any) {
            toast.error(error?.message || "Failed to update rule");
        }
    };

    const updateThreshold = async (rule: MatchRule, threshold: number) => {
        try {
            await apiFetch(`/dedupe/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ threshold }) });
            setRules((current) => current.map((r) => (r.id === rule.id ? { ...r, threshold } : r)));
        } catch (error: any) {
            toast.error(error?.message || "Failed to update threshold");
        }
    };

    const runScan = async () => {
        setScanning(true);
        try {
            const result = await apiFetch<{ candidatesFound: number }>("/dedupe/scan", { method: "POST", body: JSON.stringify({ entityType }) });
            toast.success(result.candidatesFound > 0 ? `Found ${result.candidatesFound} candidate duplicate group(s)` : "No new duplicates found");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to run scan");
        } finally {
            setScanning(false);
        }
    };

    const dismissMatch = async (matchId: string) => {
        setBusyMatchId(matchId);
        try {
            await apiFetch(`/dedupe/matches/${matchId}/dismiss`, { method: "POST" });
            toast.success("Marked as not a duplicate");
            setMatches((current) => current.filter((m) => m.id !== matchId));
        } catch (error: any) {
            toast.error(error?.message || "Failed to dismiss match");
        } finally {
            setBusyMatchId(null);
        }
    };

    const mergeMatch = async (match: DedupeMatch) => {
        const survivorId = survivorByMatch[match.id] ?? match.recordIds[0];
        setBusyMatchId(match.id);
        try {
            await apiFetch("/dedupe/merge", { method: "POST", body: JSON.stringify({ matchId: match.id, survivorId }) });
            toast.success("Records merged");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to merge records");
        } finally {
            setBusyMatchId(null);
        }
    };

    const unmerge = async (audit: MergeAudit) => {
        try {
            await apiFetch(`/dedupe/unmerge/${audit.id}`, { method: "POST" });
            toast.success("Merge undone");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to undo merge");
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold">
                            <Sparkles className="size-4 text-primary" />
                            Match Rules
                        </div>
                        <Button variant="outline" size="sm" onClick={runScan} disabled={scanning}>
                            <RefreshCw className={scanning ? "size-3.5 animate-spin" : "size-3.5"} />
                            {scanning ? "Scanning..." : "Run Scan"}
                        </Button>
                    </div>
                    {entityRules.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                            <div>
                                <p className="text-sm font-medium">{RULE_LABELS[rule.ruleType]}</p>
                                {rule.ruleType === "FUZZY_NAME" && (
                                    <div className="mt-1 flex items-center gap-1.5">
                                        <Label className="text-xs text-muted-foreground">Similarity threshold</Label>
                                        <Input
                                            type="number"
                                            min={0.5}
                                            max={1}
                                            step={0.05}
                                            className="h-7 w-20"
                                            defaultValue={rule.threshold ?? 0.85}
                                            onBlur={(e) => updateThreshold(rule, Number(e.target.value))}
                                        />
                                    </div>
                                )}
                            </div>
                            <Switch checked={rule.isActive} onCheckedChange={(checked) => toggleRule(rule, checked)} />
                        </div>
                    ))}
                </CardContent>
            </Card>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : matches.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                    No pending duplicates to review. Click &quot;Run Scan&quot; to check for new ones.
                </Card>
            ) : (
                <div className="space-y-3">
                    {matches.map((match) => (
                        <Card key={match.id}>
                            <CardContent className="space-y-3 p-4">
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline">{RULE_LABELS[match.matchedRuleType as MatchRule["ruleType"]] ?? match.matchedRuleType}</Badge>
                                    {match.matchScore !== null && (
                                        <span className="text-xs text-muted-foreground">{Math.round(match.matchScore * 100)}% similar</span>
                                    )}
                                </div>
                                <RadioGroup
                                    value={survivorByMatch[match.id] ?? match.recordIds[0]}
                                    onValueChange={(value) => setSurvivorByMatch((current) => ({ ...current, [match.id]: value }))}
                                >
                                    {match.records.map((record) => (
                                        <div key={record.id} className="flex items-center gap-2 rounded-lg border p-2">
                                            <RadioGroupItem value={record.id} id={`${match.id}-${record.id}`} />
                                            <Label htmlFor={`${match.id}-${record.id}`} className="flex-1 cursor-pointer text-sm font-normal">
                                                {recordLabel(record, entityType)}
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                                <p className="text-xs text-muted-foreground">The selected record is kept; the other is merged into it and remains recoverable via Undo.</p>
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => dismissMatch(match.id)} disabled={busyMatchId === match.id}>
                                        <ShieldOff className="size-3.5" />
                                        Not a duplicate
                                    </Button>
                                    <Button size="sm" onClick={() => mergeMatch(match)} disabled={busyMatchId === match.id}>
                                        <GitMerge className="size-3.5" />
                                        Merge
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Card>
                <CardContent className="p-4">
                    <button
                        type="button"
                        onClick={() => setShowHistory((v) => !v)}
                        className="flex w-full items-center justify-between text-sm font-bold"
                    >
                        <span className="flex items-center gap-2">
                            <History className="size-4" />
                            Merge History
                        </span>
                        <Badge variant="outline">{audits.length}</Badge>
                    </button>
                    {showHistory && (
                        <div className="mt-3 space-y-2">
                            {audits.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No merges yet.</p>
                            ) : (
                                audits.map((audit) => (
                                    <div key={audit.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs">
                                        <div>
                                            <p>Merged {formatWorkspaceRelativeTime(audit.createdAt)}</p>
                                            <p className="text-muted-foreground">Survivor {audit.survivorId.slice(0, 8)} -- absorbed {audit.loserId.slice(0, 8)}</p>
                                        </div>
                                        {audit.unmergedAt ? (
                                            <Badge variant="secondary">Undone</Badge>
                                        ) : (
                                            <Button variant="outline" size="sm" onClick={() => unmerge(audit)}>Undo</Button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function DedupeMergeCenterPageContent({ embedded }: { embedded?: boolean }) {
    const [entityType, setEntityType] = useState<"LEAD" | "OPPORTUNITY" | "CASE">("LEAD");
    return (
        <div className="space-y-4">
            <PanelHeader embedded={embedded} title="Review and merge" description="Find and merge duplicate leads, opportunities and cases. A merge can be undone from the merge history: the record that is merged in can be brought back." />

            <SegmentedControl
                label="Record type"
                value={entityType}
                onChange={setEntityType}
                options={[{ value: "LEAD", label: "Leads" }, { value: "OPPORTUNITY", label: "Opportunities" }, { value: "CASE", label: "Cases" }]}
            />
            <DedupePanel key={entityType} entityType={entityType} />
        </div>
    );
}

export function DuplicateReviewPanel({ embedded }: { embedded?: boolean }) {
    return <ModuleGate moduleKey="DATA_PLATFORM" name="Data Platform"><DedupeMergeCenterPageContent embedded={embedded} /></ModuleGate>;
}

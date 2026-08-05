"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { PredictiveRecordScore } from "@/types/leads";
import { toast } from "sonner";

const BAND_CLASSNAMES: Record<string, string> = {
    HOT: "border-destructive/25 bg-destructive/10 text-destructive",
    WARM: "border-tertiary/30 bg-tertiary/12 text-tertiary",
    COLD: "border-muted bg-muted text-muted-foreground",
    RISK: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

type ScoreHistoryRow = {
    id: string;
    previousScore: Partial<PredictiveRecordScore> | null;
    nextScore: Partial<PredictiveRecordScore> | null;
    changeReason: string;
    createdAt: string;
};

export function PredictiveScoreBadge({ score, compact = false }: { score?: PredictiveRecordScore | null; compact?: boolean }) {
    if (!score) {
        return <span className="text-xs text-muted-foreground">Not scored</span>;
    }
    const primary = score.recordType === "OPPORTUNITY" ? score.winProbability : score.conversionProbability;
    return (
        <div className="flex items-center gap-2">
            <Badge
                variant="outline"
                className={cn("font-bold uppercase tracking-wide", BAND_CLASSNAMES[score.scoreBand] ?? BAND_CLASSNAMES.COLD)}
            >
                {score.scoreBand}
            </Badge>
            {!compact ? (
                <span className="text-xs font-semibold text-muted-foreground">
                    {primary ?? 0}% · {score.confidence ?? 0}% conf.
                </span>
            ) : null}
        </div>
    );
}

export function PredictiveScorePanel({
    recordType,
    recordId,
    score,
}: {
    recordType: "LEAD" | "OPPORTUNITY";
    recordId: string;
    score?: PredictiveRecordScore | null;
}) {
    const [history, setHistory] = useState<ScoreHistoryRow[]>([]);
    const [overrideBusy, setOverrideBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        apiFetch<ScoreHistoryRow[]>(`/lead-scoring/self-learning/history?recordType=${recordType}&recordId=${recordId}`)
            .then((data) => {
                if (mounted) setHistory(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (mounted) setHistory([]);
            });
        return () => {
            mounted = false;
        };
    }, [recordId, recordType]);

    if (!score) {
        return (
            <Card className="rounded-xl p-3">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-extrabold">Predictive Scoring</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    No predictive score has been calculated for this {recordType.toLowerCase()} yet.
                </p>
            </Card>
        );
    }

    const primaryLabel = recordType === "OPPORTUNITY" ? "Win probability" : "Conversion probability";
    const primaryValue = recordType === "OPPORTUNITY" ? score.winProbability : score.conversionProbability;
    const previous = history[1]?.nextScore ?? history[0]?.previousScore;
    const previousPrimary = recordType === "OPPORTUNITY" ? previous?.winProbability : previous?.conversionProbability;
    const delta = typeof primaryValue === "number" && typeof previousPrimary === "number" ? primaryValue - previousPrimary : null;
    const positiveReasons = (score.reasons ?? []).filter((reason) => reason.type === "POSITIVE").slice(0, 3);
    const negativeReasons = (score.reasons ?? []).filter((reason) => reason.type === "NEGATIVE").slice(0, 3);
    const warnings = score.missingDataWarnings ?? [];
    const improvements = score.suggestedDataImprovements ?? [];
    const similarRecordCount = score.similarRecordIds?.length ?? 0;

    const applyOverride = async () => {
        const value = window.prompt(`Override ${primaryLabel.toLowerCase()} (0-100)`, String(primaryValue ?? 0));
        if (value === null) return;
        const reason = window.prompt("Reason for override");
        if (!reason) return;
        setOverrideBusy(true);
        try {
            await apiFetch("/lead-scoring/self-learning/overrides", {
                method: "POST",
                body: JSON.stringify({
                    recordType,
                    recordId,
                    reason,
                    scoreBand: score.scoreBand,
                    conversionProbability: recordType === "LEAD" ? Number(value) : undefined,
                    winProbability: recordType === "OPPORTUNITY" ? Number(value) : undefined,
                    stallRisk: score.stallRisk,
                }),
            });
            toast.success("Score override applied");
        } catch {
            toast.error("Failed to apply score override");
        } finally {
            setOverrideBusy(false);
        }
    };

    const clearOverride = async () => {
        setOverrideBusy(true);
        try {
            await apiFetch(`/lead-scoring/self-learning/overrides?recordType=${recordType}&recordId=${recordId}`, { method: "DELETE" });
            toast.success("Score override cleared");
        } catch {
            toast.error("Failed to clear score override");
        } finally {
            setOverrideBusy(false);
        }
    };

    return (
        <Card className="rounded-xl p-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="size-4 text-primary" />
                        <h3 className="text-sm font-extrabold">Predictive Scoring</h3>
                    </div>
                    <div className="mt-2">
                        <PredictiveScoreBadge score={score} />
                    </div>
                </div>
                {delta !== null ? (
                    <Badge variant="outline" className={cn("rounded-md font-semibold", delta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-destructive")}>
                        {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                        {delta >= 0 ? "+" : ""}{delta}
                    </Badge>
                ) : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <ScoreMetric label={primaryLabel} value={`${primaryValue ?? 0}%`} />
                <ScoreMetric label="Confidence" value={`${score.confidence ?? 0}%`} />
                <ScoreMetric label="Fit" value={`${score.fitScore ?? 0}`} />
                <ScoreMetric label="Engagement" value={`${score.engagementScore ?? 0}`} />
                <ScoreMetric label="Stall risk" value={`${score.stallRisk ?? 0}%`} />
                <ScoreMetric label="Source" value={score.source === "MANUAL_OVERRIDE" ? "Manual override" : score.source === "PREDICTIVE_SCORING" ? "Predictive" : "Rule fallback"} />
                {recordType === "LEAD" ? (
                    <>
                        <ScoreMetric label="Response likelihood" value={`${score.expectedResponseLikelihood ?? 0}%`} />
                        <ScoreMetric label="Stale risk" value={`${score.staleRisk ?? 0}%`} />
                    </>
                ) : (
                    <>
                        <ScoreMetric label="Close risk" value={`${score.expectedCloseRisk ?? 0}%`} />
                        <ScoreMetric label="Close movement" value={`${score.suggestedCloseDateDeltaDays ?? 0} days`} />
                    </>
                )}
            </div>

            <div className="mt-3 rounded-lg border bg-surface-container-lowest p-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recommended next action</p>
                <p className="mt-1 text-sm font-semibold">{score.nextBestAction ?? "No recommendation yet."}</p>
                {score.nextBestActivityType ? <p className="text-xs text-muted-foreground">{score.nextBestActivityType}</p> : null}
                {score.suggestedCloseDate ? (
                    <p className="text-xs text-muted-foreground">Suggested close date {formatWorkspaceDateTime(score.suggestedCloseDate)}</p>
                ) : null}
            </div>

            <div className="mt-3 space-y-2">
                <ReasonList title="Positive drivers" reasons={positiveReasons} empty="No positive drivers yet." />
                <ReasonList title="Risk drivers" reasons={negativeReasons} empty="No risk drivers yet." />
                <TextList title="Missing data warnings" items={warnings} empty="No missing-data warnings." />
                <TextList title="Suggested data improvements" items={improvements} empty="No suggested improvements." />
                <div>
                    <p className="text-xs font-bold text-muted-foreground">Similar converted records</p>
                    <p className="text-xs text-muted-foreground">
                        {similarRecordCount > 0
                            ? `${similarRecordCount} similar ${recordType === "OPPORTUNITY" ? "won opportunities" : "converted leads"} found.`
                            : "No similar converted records yet."}
                    </p>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                <Button type="button" variant="outline" size="sm" onClick={applyOverride} disabled={overrideBusy}>
                    Override Score
                </Button>
                {score.source === "MANUAL_OVERRIDE" ? (
                    <Button type="button" variant="ghost" size="sm" onClick={clearOverride} disabled={overrideBusy}>
                        Clear Override
                    </Button>
                ) : null}
            </div>

            <div className="mt-3 border-t pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Score History</p>
                {history.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">No score history yet.</p>
                ) : (
                    <div className="mt-2 space-y-1.5">
                        {history.slice(0, 4).map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold">{item.nextScore?.scoreBand ?? "Score"} · {item.changeReason}</span>
                                <span className="text-muted-foreground">{formatWorkspaceDateTime(item.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                )}
                {score.calculatedAt ? (
                    <p className="mt-2 text-xs text-muted-foreground">Last calculated {formatWorkspaceDateTime(score.calculatedAt)}</p>
                ) : null}
            </div>
        </Card>
    );
}

function TextList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
    return (
        <div>
            <p className="text-xs font-bold text-muted-foreground">{title}</p>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">{empty}</p>
            ) : (
                <ul className="mt-1 space-y-1">
                    {items.slice(0, 4).map((item) => (
                        <li key={item} className="text-xs">{item}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ScoreMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border bg-surface-container-lowest p-2">
            <p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-sm font-extrabold">{value}</p>
        </div>
    );
}

function ReasonList({
    title,
    reasons,
    empty,
}: {
    title: string;
    reasons: Array<{ label: string; value?: unknown }>;
    empty: string;
}) {
    return (
        <div>
            <p className="text-xs font-bold text-muted-foreground">{title}</p>
            {reasons.length === 0 ? (
                <p className="text-xs text-muted-foreground">{empty}</p>
            ) : (
                <ul className="mt-1 space-y-1">
                    {reasons.map((reason, index) => (
                        <li key={`${reason.label}-${index}`} className="text-xs">
                            {reason.label}
                            {reason.value !== undefined && reason.value !== null ? (
                                <span className="text-muted-foreground"> · {String(reason.value)}</span>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

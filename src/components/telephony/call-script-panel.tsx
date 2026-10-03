"use client";

import { useModuleEnabled } from "@/components/auth/feature-gate";
import { useEffect, useState } from "react";
import { FileText, ShieldAlert, HelpCircle, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ObjectionEntry = { objection: string; response: string };

type CallScript = {
    id: string;
    name: string;
    content: string;
    objectionHandling: ObjectionEntry[];
    complianceLines: string[];
};

type NbaHint = { id: string; actionType: string; reason: string; score: number };

type CallScriptContext = { script: CallScript | null; nbaHints: NbaHint[] };

// Surfaced during a call, right below the existing PredictiveScorePanel/NextBestActionPanel --
// deliberately shows only the TOP next-best-action hint inline (not the full recommendation
// list, which is already rendered in full by NextBestActionPanel elsewhere on this same page)
// to avoid duplicating that UI.
function CallScriptPanelContent({ recordType, recordId }: { recordType: "LEAD" | "OPPORTUNITY"; recordId: string }) {
    const [context, setContext] = useState<CallScriptContext | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        apiFetch<CallScriptContext>(`/call-scripts/for-record?recordType=${recordType}&recordId=${recordId}`)
            .then(setContext)
            .catch(() => setContext(null))
            .finally(() => setLoading(false));
    }, [recordType, recordId]);

    if (loading) return null;
    if (!context?.script) return null;

    const { script, nbaHints } = context;

    return (
        <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <h3 className="font-bold">Call Script</h3>
                <Badge variant="outline">{script.name}</Badge>
            </div>

            {script.complianceLines.length > 0 && (
                <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                        <ShieldAlert className="size-3.5" />
                        Required Compliance Lines
                    </div>
                    {script.complianceLines.map((line, index) => (
                        <p key={index} className="text-sm">
                            {line}
                        </p>
                    ))}
                </div>
            )}

            {script.content && <p className="whitespace-pre-wrap text-sm">{script.content}</p>}

            {script.objectionHandling.length > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <HelpCircle className="size-3.5" />
                        Objection Handling
                    </div>
                    {script.objectionHandling.map((entry, index) => (
                        <div key={index} className="rounded-md border p-2 text-sm">
                            <p className="font-medium">{entry.objection}</p>
                            <p className="text-muted-foreground">{entry.response}</p>
                        </div>
                    ))}
                </div>
            )}

            {nbaHints.length > 0 && (
                <div className="flex items-start gap-1.5 rounded-md bg-primary/5 p-2 text-xs">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{nbaHints[0].reason}</span>
                </div>
            )}
        </Card>
    );
}

// Renders nothing while the tenant's Telephony module is disabled or suspended (the APIs behind
// it refuse those requests too); hooks stay unconditional inside CallScriptPanelContent.
export function CallScriptPanel(props: { recordType: "LEAD" | "OPPORTUNITY"; recordId: string }) {
    const telephonyEnabled = useModuleEnabled("TELEPHONY");
    if (!telephonyEnabled) return null;
    return <CallScriptPanelContent {...props} />;
}

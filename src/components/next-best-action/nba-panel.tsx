"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Check, Clock3, X, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModuleEnabled } from "@/components/auth/feature-gate";

type NbaRecommendation = {
    id: string;
    actionType: string;
    actionConfig: Record<string, unknown>;
    score: number;
    reason: string | null;
    status: string;
};

type NbaPanelProps = {
    recordType: "LEAD" | "OPPORTUNITY";
    recordId: string;
    title?: string;
};

export const ACTION_LABELS: Record<string, string> = {
    CREATE_TASK: "Create a follow-up task",
    CALL_LEAD: "Call this lead",
    SEND_EMAIL: "Send an email",
    SEND_WHATSAPP: "Send a WhatsApp message",
    SEND_SMS: "Send an SMS",
    ASSIGN_OWNER: "Reassign owner",
    ADD_TO_LIST: "Add to a list",
    UPDATE_FIELD: "Update a field",
    SCHEDULE_ACTIVITY: "Schedule an activity",
    ESCALATE_TO_MANAGER: "Escalate to manager",
    DO_NOTHING: "No action needed",
};

// Self-fetching by (recordType, recordId), same convention as RelatedTasksPanel -- lets
// this panel refresh independently of the parent Lead/Opportunity fetch (e.g. after an
// accept/dismiss, without a full page reload).
export function NextBestActionPanel({ recordType, recordId, title = "Recommended Next Actions" }: NbaPanelProps) {
    const moduleEnabled = useModuleEnabled("NEXT_BEST_ACTION");
    const [recommendations, setRecommendations] = useState<NbaRecommendation[]>([]);
    const [loading, setLoading] = useState(true);
    const [respondingId, setRespondingId] = useState<string | null>(null);

    const fetchRecommendations = useCallback(() => {
        setLoading(true);
        return apiFetch<NbaRecommendation[]>(`/next-best-action/recommendations?recordType=${recordType}&recordId=${recordId}`)
            .then((data) => setRecommendations(Array.isArray(data) ? data : []))
            .catch(() => setRecommendations([]))
            .finally(() => setLoading(false));
    }, [recordType, recordId]);

    useEffect(() => {
        if (moduleEnabled) fetchRecommendations();
        else setLoading(false);
    }, [fetchRecommendations, moduleEnabled]);

    const respond = async (id: string, status: "ACCEPTED" | "SNOOZED" | "DISMISSED" | "NOT_USEFUL") => {
        setRespondingId(id);
        try {
            // Snoozing needs a real wake-up time -- without one the recommendation would
            // just reappear on the very next fetch, making the button a no-op.
            const snoozedUntil = status === "SNOOZED" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined;
            await apiFetch(`/next-best-action/recommendations/${id}/respond`, {
                method: "POST",
                body: JSON.stringify({ status, snoozedUntil }),
            });
            const messages: Record<string, string> = {
                ACCEPTED: "Action executed",
                SNOOZED: "Recommendation snoozed",
                DISMISSED: "Recommendation dismissed",
                NOT_USEFUL: "Thanks, we'll factor that in",
            };
            toast.success(messages[status]);
            await fetchRecommendations();
        } catch (error: any) {
            toast.error(error.message || "Failed to respond to recommendation");
        } finally {
            setRespondingId(null);
        }
    };

    if (!moduleEnabled || loading || recommendations.length === 0) return null;

    return (
        <Card className="rounded-xl p-3">
            <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="text-sm font-bold">{title}</span>
            </div>
            <div className="space-y-2.5">
                {recommendations.map((rec) => (
                    <div key={rec.id} className="rounded-lg border bg-surface-container-low p-2.5">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold">{ACTION_LABELS[rec.actionType] ?? rec.actionType}</p>
                            <Badge variant="outline" className="shrink-0 rounded-md text-[0.65rem] font-semibold">
                                {Math.round(rec.score)}
                            </Badge>
                        </div>
                        {rec.reason && <p className="mt-0.5 text-xs text-muted-foreground">{rec.reason}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <Button
                                size="sm"
                                variant="outline"
                                className={cn("h-7 rounded-md px-2 text-xs")}
                                disabled={respondingId === rec.id}
                                onClick={() => respond(rec.id, "ACCEPTED")}
                            >
                                <Check className="size-3.5" />
                                Accept
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-md px-2 text-xs"
                                disabled={respondingId === rec.id}
                                onClick={() => respond(rec.id, "SNOOZED")}
                            >
                                <Clock3 className="size-3.5" />
                                Snooze
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-md px-2 text-xs"
                                disabled={respondingId === rec.id}
                                onClick={() => respond(rec.id, "DISMISSED")}
                            >
                                <X className="size-3.5" />
                                Dismiss
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-md px-2 text-xs text-muted-foreground"
                                disabled={respondingId === rec.id}
                                onClick={() => respond(rec.id, "NOT_USEFUL")}
                            >
                                <ThumbsDown className="size-3.5" />
                                Not useful
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

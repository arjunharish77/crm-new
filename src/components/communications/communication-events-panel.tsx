"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/error-state";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type Props = {
    entityType: "LEAD" | "OPPORTUNITY";
    entityId: string;
};

function iconForChannel(channel: string) {
    if (channel === "WHATSAPP") return MessageSquareText;
    if (channel === "SMS") return Send;
    return Mail;
}

function statusClass(eventType: string) {
    if (["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(eventType)) return "border-status-success bg-status-success text-status-success-foreground";
    if (["BOUNCED", "FAILED", "UNSUBSCRIBED"].includes(eventType)) return "border-destructive/20 bg-destructive/10 text-destructive";
    return "";
}

export function CommunicationEventsPanel({ entityType, entityId }: Props) {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const fetchEvents = async () => {
            setLoading(true);
            setLoadError(false);
            setEvents([]);
            try {
                const data = await apiFetch<any[]>(`/communications/events?entityType=${entityType}&entityId=${entityId}`, { signal: controller.signal });
                if (controller.signal.aborted) return;
                setEvents(Array.isArray(data) ? data : []);
            } catch {
                if (!controller.signal.aborted) setLoadError(true);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        fetchEvents();
        return () => controller.abort();
    }, [entityType, entityId, attempt]);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold">Communication Timeline</h3>
                    <p className="text-xs text-muted-foreground">Marketing and automation messages linked to this record.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)} disabled={loading}>
                    <RefreshCw className="size-4" />
                    Refresh
                </Button>
            </div>
            {loading ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Loading communication events...</div> : null}
            {!loading && loadError ? <ErrorState description="Communication events could not be loaded." onRetry={() => setAttempt(value => value + 1)} /> : null}
            {!loading && !loadError && events.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No communication events yet.</div> : null}
            {events.map((event) => {
                const Icon = iconForChannel(event.channel);
                return (
                    <div key={event.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 max-w-full items-start gap-3">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon className="size-4" />
                                </span>
                                <div className="min-w-0 break-words">
                                    <div className="font-semibold">{event.subject || event.eventType.replaceAll("_", " ")}</div>
                                    <div className="text-xs text-muted-foreground">{event.channel} · {event.recipient ?? "Provider event"}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <Badge variant="outline" className={statusClass(event.eventType)}>{event.eventType}</Badge>
                                <div className="mt-1 text-xs text-muted-foreground">{formatWorkspaceDateTime(event.occurredAt)}</div>
                            </div>
                        </div>
                        {event.body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{event.body}</p> : null}
                    </div>
                );
            })}
        </div>
    );
}

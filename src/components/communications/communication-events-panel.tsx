"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    if (["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(eventType)) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
    if (["BOUNCED", "FAILED", "UNSUBSCRIBED"].includes(eventType)) return "border-destructive/20 bg-destructive/10 text-destructive";
    return "";
}

export function CommunicationEventsPanel({ entityType, entityId }: Props) {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const data = await apiFetch<any[]>(`/communications/events?entityType=${entityType}&entityId=${entityId}`);
            setEvents(Array.isArray(data) ? data : []);
        } catch {
            setEvents([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityType, entityId]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-extrabold">Communication Timeline</h3>
                    <p className="text-xs text-muted-foreground">Marketing and automation messages linked to this record.</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchEvents}>
                    <RefreshCw className="size-4" />
                    Refresh
                </Button>
            </div>
            {loading ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Loading communication events...</div> : null}
            {!loading && events.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No communication events yet.</div> : null}
            {events.map((event) => {
                const Icon = iconForChannel(event.channel);
                return (
                    <div key={event.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-start gap-3">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon className="size-4" />
                                </span>
                                <div>
                                    <div className="font-extrabold">{event.subject || event.eventType.replaceAll("_", " ")}</div>
                                    <div className="text-xs text-muted-foreground">{event.channel} · {event.recipient ?? "Provider event"}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <Badge variant="outline" className={statusClass(event.eventType)}>{event.eventType}</Badge>
                                <div className="mt-1 text-xs text-muted-foreground">{formatWorkspaceDateTime(event.occurredAt)}</div>
                            </div>
                        </div>
                        {event.body ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.body}</p> : null}
                    </div>
                );
            })}
        </div>
    );
}

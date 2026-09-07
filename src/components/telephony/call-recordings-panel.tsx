"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Play, PhoneCall, RefreshCw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type Props = {
    entityType: "LEAD" | "OPPORTUNITY";
    entityId: string;
};

type CallRecording = {
    id: string;
    provider: string;
    direction: string;
    status: string;
    duration: number | null;
    startedAt: string;
    hasRecording: boolean;
    isExpired: boolean;
    transcript: string | null;
};

export function CallRecordingsPanel({ entityType, entityId }: Props) {
    const [calls, setCalls] = useState<CallRecording[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchCalls = async () => {
        setLoading(true);
        try {
            const param = entityType === "LEAD" ? `leadId=${entityId}` : `opportunityId=${entityId}`;
            const data = await apiFetch<CallRecording[]>(`/telephony/call-recordings?${param}`);
            setCalls(Array.isArray(data) ? data : []);
        } catch {
            setCalls([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalls();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityType, entityId]);

    const openRecording = async (call: CallRecording, action: "PLAY" | "DOWNLOAD") => {
        if (!confirm("This call may have been recorded with the caller's consent under your organization's calling policy. Continue?")) return;
        setBusyId(call.id);
        try {
            const result = await apiFetch<{ recordingUrl: string }>(`/telephony/call-recordings/${call.id}?action=${action}`);
            window.open(result.recordingUrl, "_blank", "noopener,noreferrer");
        } catch (error: any) {
            toast.error(error?.message || "Failed to access recording");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold">Call Recordings</h4>
                <Button variant="ghost" size="icon" onClick={fetchCalls} disabled={loading}>
                    <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
                </Button>
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : calls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls logged for this record yet.</p>
            ) : (
                <div className="space-y-2">
                    {calls.map((call) => (
                        <div key={call.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <PhoneCall className="size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {call.direction} · {call.status}
                                        {call.duration != null && <span className="text-muted-foreground"> · {call.duration}s</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(call.startedAt)}</p>
                                    {!call.transcript && call.hasRecording && (
                                        <p className="text-xs text-muted-foreground italic">Transcript not available</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {call.isExpired ? (
                                    <Badge variant="outline" className="gap-1">
                                        <AlertTriangle className="size-3" />
                                        Expired
                                    </Badge>
                                ) : call.hasRecording ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={busyId === call.id}
                                            onClick={() => openRecording(call, "PLAY")}
                                        >
                                            <Play className="size-4" />
                                            Play
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            disabled={busyId === call.id}
                                            onClick={() => openRecording(call, "DOWNLOAD")}
                                        >
                                            <Download className="size-4" />
                                        </Button>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">No recording</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

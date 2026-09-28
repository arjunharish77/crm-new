"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Play, PhoneCall, RefreshCw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/error-state";
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
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const busyRef = useRef(false);
    const [readyRecording, setReadyRecording] = useState<{ url: string; action: 'PLAY' | 'DOWNLOAD' } | null>(null);
    const [accessError, setAccessError] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setReadyRecording(null);
        setAccessError('');
        const fetchCalls = async () => {
            setLoading(true);
            setLoadError(false);
            setCalls([]);
            try {
                const param = entityType === "LEAD" ? `leadId=${entityId}` : `opportunityId=${entityId}`;
                const data = await apiFetch<CallRecording[]>(`/telephony/call-recordings?${param}`, { signal: controller.signal });
                if (controller.signal.aborted) return;
                setCalls(Array.isArray(data) ? data : []);
            } catch {
                if (!controller.signal.aborted) setLoadError(true);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        fetchCalls();
        return () => controller.abort();
    }, [entityType, entityId, attempt]);

    const openRecording = async (call: CallRecording, action: "PLAY" | "DOWNLOAD") => {
        if (busyRef.current) return;
        if (!confirm("This call may have been recorded with the caller's consent under your organization's calling policy. Continue?")) return;
        busyRef.current = true;
        setAccessError('');
        setReadyRecording(null);
        setBusyId(call.id);
        try {
            const result = await apiFetch<{ recordingUrl: string }>(`/telephony/call-recordings/${call.id}?action=${action}`);
            const url = new URL(result.recordingUrl);
            if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Recording link is invalid. Request access again.');
            setReadyRecording({ url: url.href, action });
        } catch (error: any) {
            setAccessError(error?.message || "Recording could not be accessed. Try Play or Download again.");
        } finally {
            busyRef.current = false;
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold">Call Recordings</h4>
                <Button aria-label="Refresh call recordings" variant="ghost" size="icon" onClick={() => setAttempt(value => value + 1)} disabled={loading || busyId !== null}>
                    <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
                </Button>
            </div>

            {accessError && <p role="alert" className="break-words text-sm text-destructive">{accessError}</p>}
            {readyRecording && <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <p role="status" className="text-sm">Recording link ready.</p>
                <Button asChild variant="outline" size="sm"><a href={readyRecording.url} target="_blank" rel="noopener noreferrer">{readyRecording.action === 'PLAY' ? 'Open recording' : 'Open download'}</a></Button>
            </div>}
            {busyId && <p role="status" className="text-sm text-muted-foreground">Requesting recording access…</p>}
            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : loadError ? <ErrorState description="Call recordings could not be loaded." onRetry={() => setAttempt(value => value + 1)} /> : calls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls logged for this record yet.</p>
            ) : (
                <div className="space-y-2">
                    {calls.map((call) => (
                        <div key={call.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <PhoneCall className="size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <p className="break-words text-sm font-medium">
                                        {call.direction} · {call.status}
                                        {call.duration != null && <span className="text-muted-foreground"> · {call.duration}s</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(call.startedAt)}</p>
                                    {!call.transcript && call.hasRecording && (
                                        <p className="text-xs text-muted-foreground italic">Transcript not available</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
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
                                            disabled={busyId !== null}
                                            onClick={() => openRecording(call, "PLAY")}
                                        >
                                            <Play className="size-4" />
                                            Play
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            disabled={busyId !== null}
                                            aria-label="Download recording" onClick={() => openRecording(call, "DOWNLOAD")}
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

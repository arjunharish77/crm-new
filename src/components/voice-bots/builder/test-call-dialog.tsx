"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, PhoneOff, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { StandardDialog } from "@/components/common/standard-dialog";
import { FormField } from "@/components/common/form-field";
import { RecordPicker } from "@/components/common/record-picker";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTestCall, type TestCallEvent } from "./use-test-call";

type SessionResult = {
    status: string; outcome: string | null; durationSeconds: number | null; error: string | null;
    fields: Array<{ key: string; label: string; value: unknown }>;
};

const OUTCOME_LABELS: Record<string, string> = {
    interested: "Interested", not_interested: "Not interested", callback: "Callback booked", transferred: "Transferred",
    wrong_number: "Wrong number", do_not_call: "Asked for no bot calls", no_response: "No response", hung_up: "You hung up", other: "Ended",
};

function formatValue(value: unknown) {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value ?? "");
}

// One line per event the caller can't hear but the tester should know about.
function describeEvent(item: TestCallEvent): string | null {
    const detail = item.detail;
    switch (item.event) {
        case "field_saved": return `Saved ${detail.label}: ${formatValue(detail.value)}`;
        case "callback_booked": return `Callback booked: ${detail.when}`;
        case "transfer_requested": return "Transfer requested. On a real call, the lead owner's phone would ring now.";
        case "stop_bot_calls": return "The caller asked for no more bot calls.";
        case "knowledge_searched": return detail.found
            ? `Looked up "${detail.question}" in ${(detail.sources as string[] | undefined)?.join(", ") || "the knowledge"}.`
            : `Looked up "${detail.question}": nothing on record, so the bot offers to have the team confirm.`;
        case "ai_switched": return detail.reason === "budget" ? `Claude's budget is used up; switched to ${detail.to}.` : `The AI didn't answer; switched to ${detail.to}.`;
        case "language_changed": return `Now replying in ${detail.language === "hi" ? "Hindi" : "English"}.`;
        case "time_limit": return "The longest call time was reached.";
        default: return null;
    }
}

function median(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// Talk to the bot through the microphone, with its saved settings (voice bot plan wave C).
export function TestCallDialog({ botId, open, onClose }: { botId: string; open: boolean; onClose: () => void }) {
    const call = useTestCall();
    const [leadId, setLeadId] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [meta, setMeta] = useState<{ sessionId: string; ai: string; aiNote: string | null; voicePaid: boolean } | null>(null);
    const [result, setResult] = useState<SessionResult | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const transcriptEnd = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (call.state !== "live") return;
        const started = Date.now();
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [call.state]);

    useEffect(() => {
        transcriptEnd.current?.scrollIntoView({ block: "nearest" });
    }, [call.lines.length, call.events.length]);

    // The service reports the call to the CRM a moment after it ends.
    useEffect(() => {
        if (call.state !== "ended" || !meta) return;
        let cancelled = false;
        (async () => {
            for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
                try {
                    const session = await apiFetch<SessionResult>(`/voice-bots/${botId}/test-call/${meta.sessionId}`);
                    if (session.status !== "ACTIVE" && session.status !== "PENDING") {
                        if (!cancelled) setResult(session);
                        return;
                    }
                } catch { /* try again */ }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        })();
        return () => { cancelled = true; };
    }, [call.state, meta, botId]);

    const start = async () => {
        setStarting(true);
        setStartError(null);
        setResult(null);
        setElapsed(0);
        try {
            const session = await apiFetch<{ sessionId: string; url: string; sampleRate: number; ai: string; aiNote: string | null; voicePaid: boolean }>(`/voice-bots/${botId}/test-call`, {
                method: "POST",
                body: JSON.stringify({ leadId }),
            });
            setMeta({ sessionId: session.sessionId, ai: session.ai, aiNote: session.aiNote, voicePaid: session.voicePaid });
            await call.start(session.url, session.sampleRate);
        } catch (error: any) {
            setStartError(error?.message || "The test call couldn't start.");
        } finally {
            setStarting(false);
        }
    };

    const close = () => {
        call.reset();
        setMeta(null);
        setResult(null);
        setStartError(null);
        onClose();
    };

    const replyMedian = median(call.turns.map((turn) => turn.replyMs));
    const timeline = useMemo(() => {
        const items: Array<{ at: number; kind: "line" | "event"; key: string; role?: "bot" | "caller"; text: string; interrupted?: boolean }> = [];
        call.lines.forEach((line, index) => items.push({ at: line.at, kind: "line", key: `l${index}`, role: line.role, text: line.text, interrupted: line.interrupted }));
        call.events.forEach((item, index) => {
            const text = describeEvent(item);
            if (text) items.push({ at: item.at, kind: "event", key: `e${index}`, text });
        });
        return items.sort((a, b) => a.at - b.at);
    }, [call.lines, call.events]);

    const live = call.state === "live" || call.state === "connecting";
    const showTimeline = call.state !== "idle" && (timeline.length > 0 || live);

    const actions = live ? (
        <Button variant="destructive" onClick={call.hangUp}><PhoneOff className="size-4" />End call</Button>
    ) : call.state === "idle" ? (
        <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={start} isLoading={starting} disabled={starting}><Mic className="size-4" />Start test call</Button>
        </>
    ) : (
        <>
            <Button variant="outline" onClick={close}>Close</Button>
            <Button onClick={() => { call.reset(); setMeta(null); setResult(null); }}><RotateCcw className="size-4" />Call again</Button>
        </>
    );

    return (
        <StandardDialog open={open} onClose={live ? () => undefined : close} title="Test call" subtitle="Talk to the bot through your microphone, with its saved settings. Nobody is called and no record changes." maxWidth="sm" actions={actions}>
            <div className="space-y-4">
                {call.state === "idle" ? (
                    <>
                        <FormField id="test-call-lead" label="Caller details from (optional)" help="The bot uses this lead's details and fills its placeholders with them, as on a real call. Without one, fallbacks are used.">
                            <RecordPicker entity="lead" value={leadId} onChange={(id) => setLeadId(id ?? null)} placeholder="Search leads" />
                        </FormField>
                        <p className="text-sm text-muted-foreground">Use headphones if you can: otherwise the bot may hear itself through your speakers.</p>
                        {startError ? <Alert variant="destructive"><AlertDescription>{startError}</AlertDescription></Alert> : null}
                    </>
                ) : null}

                {call.problem ? <Alert variant="destructive"><AlertDescription>{call.problem}</AlertDescription></Alert> : null}

                {call.state !== "idle" && meta ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        {live ? (
                            <StatusBadge tone={call.state === "connecting" ? "neutral" : call.botSpeaking ? "info" : "success"} label={call.state === "connecting" ? "Connecting" : call.botSpeaking ? "Bot speaking" : "Listening"} />
                        ) : (
                            <StatusBadge tone={result?.status === "FAILED" ? "danger" : "neutral"} label={result?.status === "FAILED" ? "Failed" : "Ended"} />
                        )}
                        <span className="tabular-nums text-muted-foreground" aria-label="Call length">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
                        <span className="text-muted-foreground">{meta.ai}</span>
                        {replyMedian !== null ? <span className="text-muted-foreground">Typical reply {(replyMedian / 1000).toFixed(1)} s</span> : null}
                    </div>
                ) : null}
                {meta?.aiNote && call.state !== "idle" ? <p className="text-xs text-muted-foreground">{meta.aiNote}</p> : null}
                {meta?.voicePaid && call.state !== "idle" ? <p className="text-xs text-muted-foreground">This month&apos;s free voice characters are used up, so this call uses Google&apos;s voice at the paid rate.</p> : null}

                {showTimeline ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border p-3" aria-live="polite" aria-label="Transcript">
                        {timeline.length === 0 ? <p className="text-sm text-muted-foreground">{call.state === "connecting" ? "Connecting to the bot…" : "The bot is about to speak."}</p> : null}
                        {timeline.map((item) => item.kind === "event" ? (
                            <p key={item.key} className="text-xs text-muted-foreground">{item.text}</p>
                        ) : (
                            <div key={item.key} className={cn("flex", item.role === "caller" ? "justify-end" : "justify-start")}>
                                <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", item.role === "caller" ? "bg-primary/10" : "bg-muted")}>
                                    <span className="sr-only">{item.role === "caller" ? "You: " : "Bot: "}</span>
                                    {item.text}
                                    {item.interrupted ? <span className="ml-1 text-xs text-muted-foreground">(interrupted)</span> : null}
                                </div>
                            </div>
                        ))}
                        <div ref={transcriptEnd} />
                    </div>
                ) : null}

                {call.state === "ended" || call.state === "failed" ? (
                    result ? (
                        <section aria-labelledby="test-call-result" className="space-y-2">
                            <h3 id="test-call-result" className="text-sm font-medium">Result: {OUTCOME_LABELS[result.outcome ?? "other"] ?? "Ended"}{result.durationSeconds ? ` · ${result.durationSeconds} s` : ""}</h3>
                            {result.error ? <p className="text-sm text-destructive">{result.error}</p> : null}
                            {result.fields.length ? (
                                <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-1 text-sm">
                                    {result.fields.map((field) => (
                                        <div key={field.key} className="contents">
                                            <dt className="text-muted-foreground">{field.label}</dt>
                                            <dd>{formatValue(field.value)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : <p className="text-sm text-muted-foreground">No fields were filled.</p>}
                        </section>
                    ) : call.state === "ended" ? <p className="text-sm text-muted-foreground" role="status">Getting the result…</p> : null
                ) : null}
            </div>
        </StandardDialog>
    );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Headphones, PhoneCall, PhoneOutgoing, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { StandardDialog } from "@/components/common/standard-dialog";
import { StandardSheet } from "@/components/common/standard-sheet";
import { FormField } from "@/components/common/form-field";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type CallRow = {
    id: string; trigger: string; attempt: number; status: string; blockedReason: string | null; notBefore: string; phone: string;
    leadId: string | null; leadName: string | null; dialedAt: string | null; answeredAt: string | null; durationSeconds: number | null;
    outcome: string | null; outcomeLabel: string | null; summary: string | null; createdAt: string;
    // The quality review (wave G): how the bot did, and whether a person should listen.
    review: { score: number; issues: string[]; listen: boolean; reason: string; by: "claude" | "groq" } | null;
};
type CallDetail = CallRow & {
    error: string | null;
    fields: Array<{ key: string; label: string; value: unknown }>;
    transfer: { status: string; connectedTo: string | null; people: number } | null;
    results: { mapping?: { applied: Array<{ field: string; target: string; value: unknown }>; skipped: Array<{ field: string; target: string; reason: string }> }; taskId?: string; retry?: { at: string }; stopListed?: boolean };
    transcript: Array<{ role: "bot" | "caller"; text: string; interrupted?: boolean }> | null;
    turns: Array<{ replyMs: number }> | null;
};

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
    QUEUED: { label: "Waiting", tone: "neutral" }, DIALING: { label: "Ringing", tone: "info" }, IN_PROGRESS: { label: "On the call", tone: "info" },
    COMPLETED: { label: "Answered", tone: "success" }, NO_ANSWER: { label: "No answer", tone: "warning" }, BUSY: { label: "Busy", tone: "warning" },
    MACHINE: { label: "Answering machine", tone: "warning" }, FAILED: { label: "Failed", tone: "danger" }, BLOCKED: { label: "Not called", tone: "danger" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};
const TRIGGER: Record<string, string> = { MANUAL: "Started by hand", BULK: "Bulk", ENQUIRY: "New enquiry", AUTOMATION: "Automation", CAMPAIGN: "Campaign", INBOUND: "Inbound", TEST_PHONE: "Test to own phone" };
const LIVE = new Set(["QUEUED", "DIALING", "IN_PROGRESS"]);

function formatValue(value: unknown) {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value ?? "");
}

// The bot's phone calls (voice bot plan wave E): queued, ringing, on the call and finished, with
// what came of each. Refreshes on its own while a call is under way.
export function CallsPanel({ botId, canManage, initialCallId = null }: { botId: string; canManage: boolean; initialCallId?: string | null }) {
    const [calls, setCalls] = useState<CallRow[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [selected, setSelected] = useState<string | null>(initialCallId);
    const [testOpen, setTestOpen] = useState(false);
    const [toListen, setToListen] = useState(false);

    const load = useCallback(async () => {
        try {
            setCalls((await apiFetch<{ calls: CallRow[] }>(`/voice-bots/${botId}/calls${toListen ? "?toListen=1" : ""}`)).calls);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [botId, toListen]);

    useEffect(() => { load(); }, [load]);
    const live = !!calls?.some((call) => LIVE.has(call.status));
    useEffect(() => {
        if (!live) return;
        const timer = setInterval(load, 4000);
        return () => clearInterval(timer);
    }, [live, load]);

    const cancel = async (call: CallRow) => {
        try {
            await apiFetch(`/voice-bots/${botId}/calls/${call.id}`, { method: "DELETE" });
            toast.success("Call cancelled");
            await load();
        } catch (error: any) {
            toast.error(error?.message || "The call couldn't be cancelled");
        }
    };

    if (failed && !calls) return <div className="py-6"><ErrorState description="The bot's calls couldn't be loaded." onRetry={load} /></div>;
    if (!calls) return <div className="space-y-3 py-6"><Skeleton className="h-6 w-40" /><Skeleton className="h-32 w-full" /></div>;

    const callMyPhone = canManage ? <Button variant="outline" onClick={() => setTestOpen(true)}><PhoneOutgoing className="size-4" />Call my phone</Button> : null;
    return (
        <div className="space-y-4 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">Calls</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">This bot&apos;s phone calls, newest first. Each answered call adds the bot&apos;s activity, with its summary and fields, to the lead or opportunity. Unanswered calls are tried again per the Calling tab.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Which calls">
                        {[{ value: false, label: "All calls" }, { value: true, label: "To listen" }].map((option) => (
                            <button key={option.label} type="button" aria-pressed={toListen === option.value} onClick={() => setToListen(option.value)}
                                className={cn("h-8 rounded px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", toListen === option.value ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted")}>
                                {option.label}
                            </button>
                        ))}
                    </div>
                    {callMyPhone}
                </div>
            </div>
            {calls.length === 0 && toListen ? (
                <EmptyState variant="inline" icon={<Headphones className="size-8 text-muted-foreground" />} title="Nothing to listen to" description="After each answered call, Claude reviews how the bot did. Calls it thinks a person should hear (made-up answers, a rule broken, an upset caller, a missed hand-over) appear here." />
            ) : calls.length === 0 ? (
                <EmptyState variant="inline" icon={<PhoneCall className="size-8 text-muted-foreground" />} title="No calls yet" description="Calls appear here once they're started from records, lists or automations. Use Call my phone to hear the bot on a real call first." action={callMyPhone} />
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-full sm:w-2/5">Who</TableHead>
                                <TableHead className="hidden w-44 sm:table-cell">Status</TableHead>
                                <TableHead className="hidden w-40 md:table-cell">Outcome</TableHead>
                                <TableHead className="hidden w-36 lg:table-cell">When</TableHead>
                                <TableHead className="w-14"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calls.map((call) => {
                                const status = STATUS[call.status] ?? { label: call.status, tone: "neutral" as const };
                                const badge = <StatusBadge tone={status.tone} label={status.label} />;
                                return (
                                    <TableRow key={call.id} className="cursor-pointer" onClick={() => setSelected(call.id)}>
                                        <TableCell className="max-w-0">
                                            <button type="button" className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); setSelected(call.id); }}>
                                                <span className="block truncate font-medium">{call.leadName ?? call.phone}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{TRIGGER[call.trigger] ?? call.trigger}{call.attempt > 1 ? ` · attempt ${call.attempt}` : ""}{call.durationSeconds ? ` · ${Math.round(call.durationSeconds / 60 * 10) / 10} min` : ""}</span>
                                                <span className="mt-1 block sm:hidden">{badge}</span>
                                                {call.status === "BLOCKED" && call.blockedReason ? <span className="block text-xs text-destructive">{call.blockedReason}</span> : null}
                                                {call.review?.listen ? <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-status-warning-foreground"><Headphones className="size-3.5" aria-hidden />Listen · quality {call.review.score}/5</span> : null}
                                                {call.status === "QUEUED" && new Date(call.notBefore).getTime() > Date.now() + 60_000 ? <span className="block text-xs text-muted-foreground">Calls {formatWorkspaceRelativeTime(call.notBefore)}</span> : null}
                                            </button>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">{badge}</TableCell>
                                        <TableCell className="hidden text-sm md:table-cell">{call.outcomeLabel ?? "—"}</TableCell>
                                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{formatWorkspaceRelativeTime(call.dialedAt ?? call.createdAt)}</TableCell>
                                        <TableCell onClick={(event) => event.stopPropagation()}>
                                            {call.status === "QUEUED" ? <IconButton label="Cancel this call" onClick={() => cancel(call)}><X className="size-4" /></IconButton> : null}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
            <CallSheet botId={botId} callId={selected} onClose={() => setSelected(null)} />
            <CallMyPhoneDialog botId={botId} open={testOpen} onClose={() => setTestOpen(false)} onStarted={async () => { setTestOpen(false); await load(); }} />
        </div>
    );
}

function CallMyPhoneDialog({ botId, open, onClose, onStarted }: { botId: string; open: boolean; onClose: () => void; onStarted: () => Promise<void> }) {
    const [phone, setPhone] = useState("");
    const [starting, setStarting] = useState(false);
    useEffect(() => { if (open) setPhone(""); }, [open]);
    const start = async () => {
        setStarting(true);
        try {
            const result = await apiFetch<{ phone: string }>(`/voice-bots/${botId}/test-phone`, { method: "POST", body: JSON.stringify({ phone }) });
            toast.success(`The bot is calling ${result.phone}`);
            await onStarted();
        } catch (error: any) {
            toast.error(error?.message || "The call couldn't be started");
        } finally {
            setStarting(false);
        }
    };
    return (
        <StandardDialog open={open} onClose={starting ? () => undefined : onClose} title="Call my phone" subtitle="The bot calls you through Plivo with its saved settings, like a real call, so you hear the phone line and the voice. It works before the bot is live and outside calling hours."
            maxWidth="sm" actions={<><Button variant="outline" onClick={onClose} disabled={starting}>Cancel</Button><Button onClick={start} isLoading={starting} disabled={starting}><PhoneOutgoing className="size-4" />Call me</Button></>}>
            <form onSubmit={(event) => { event.preventDefault(); start(); }}>
                <FormField id="test-phone-number" label="Your phone (optional)" help="Leave empty to use the phone on your profile. A Plivo call costs about ₹0.38 a minute.">
                    <Input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="98765 43210" autoFocus />
                </FormField>
            </form>
        </StandardDialog>
    );
}

function CallSheet({ botId, callId, onClose }: { botId: string; callId: string | null; onClose: () => void }) {
    const [call, setCall] = useState<CallDetail | null>(null);
    useEffect(() => {
        setCall(null);
        if (!callId) return;
        let stop = false;
        const load = () => apiFetch<CallDetail>(`/voice-bots/${botId}/calls/${callId}`).then((detail) => { if (!stop) setCall(detail); }).catch(() => undefined);
        load();
        const timer = setInterval(() => { if (!stop) load(); }, 4000);
        return () => { stop = true; clearInterval(timer); };
    }, [botId, callId]);
    const status = call ? STATUS[call.status] ?? { label: call.status, tone: "neutral" as const } : null;
    const replies = (call?.turns ?? []).map((turn) => turn.replyMs).sort((a, b) => a - b);
    const typical = replies.length ? replies[Math.floor((replies.length - 1) / 2)] : null;
    return (
        <StandardSheet open={!!callId} onClose={onClose} title={call ? call.leadName ?? call.phone : "Call"} description={call ? `${TRIGGER[call.trigger] ?? call.trigger}${call.attempt > 1 ? ` · attempt ${call.attempt}` : ""} · ${formatWorkspaceRelativeTime(call.dialedAt ?? call.createdAt)}` : undefined}
            actions={<Button variant="outline" onClick={onClose}>Close</Button>}>
            {!call ? <p className="text-sm text-muted-foreground" role="status">Loading…</p> : (
                <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                        {status ? <StatusBadge tone={status.tone} label={status.label} /> : null}
                        {call.outcomeLabel ? <span>{call.outcomeLabel}</span> : null}
                        {call.durationSeconds ? <span className="text-muted-foreground">{Math.floor(call.durationSeconds / 60)}:{String(call.durationSeconds % 60).padStart(2, "0")}</span> : null}
                        {typical !== null ? <span className="text-muted-foreground">Typical reply {(typical / 1000).toFixed(1)} s</span> : null}
                    </div>
                    {call.blockedReason ? <p className="text-sm text-destructive">{call.blockedReason}</p> : null}
                    {call.error && call.status !== "BLOCKED" ? <p className="text-sm text-destructive">{call.error}</p> : null}
                    {call.review ? (
                        <section className={cn("space-y-1 rounded-lg border p-3", call.review.listen && "border-status-warning-foreground/40 bg-status-warning/40")} aria-labelledby="call-review">
                            <h3 id="call-review" className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                Quality review: {call.review.score}/5
                                {call.review.listen ? <StatusBadge tone="warning" label="Worth a listen" /> : null}
                            </h3>
                            {call.review.reason ? <p className="text-sm">{call.review.reason}</p> : null}
                            {call.review.issues.length ? <ul className="list-disc space-y-0.5 pl-5 text-sm">{call.review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
                            <p className="text-xs text-muted-foreground">Reviewed by {call.review.by === "claude" ? "Claude" : "Groq (Claude's budget was used up)"} against the bot&apos;s persona, goal and rules.</p>
                        </section>
                    ) : null}
                    {call.summary ? (
                        <section className="space-y-1" aria-labelledby="call-summary">
                            <h3 id="call-summary" className="text-sm font-medium">Summary</h3>
                            <p className="text-sm">{call.summary}</p>
                        </section>
                    ) : null}
                    {call.fields.length ? (
                        <section className="space-y-1" aria-labelledby="call-fields">
                            <h3 id="call-fields" className="text-sm font-medium">What the bot found out</h3>
                            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-1 text-sm">
                                {call.fields.map((field) => (
                                    <div key={field.key} className="contents"><dt className="text-muted-foreground">{field.label}</dt><dd>{formatValue(field.value)}</dd></div>
                                ))}
                            </dl>
                        </section>
                    ) : null}
                    {call.transfer || call.results.mapping || call.results.taskId || call.results.retry || call.results.stopListed ? (
                        <section className="space-y-1" aria-labelledby="call-after">
                            <h3 id="call-after" className="text-sm font-medium">What happened next</h3>
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                                {call.transfer ? <li>{call.transfer.status === "CONNECTED" ? `Handed over to ${call.transfer.connectedTo}.` : call.transfer.status === "RINGING" ? "Being handed over…" : "A hand-over was asked for, but nobody answered."}</li> : null}
                                {call.results.mapping?.applied.map((item) => <li key={`a-${item.target}`}>Set {item.target.replace(".", " › ")} to {formatValue(item.value)}.</li>)}
                                {call.results.mapping?.skipped.map((item) => <li key={`s-${item.target}`} className="text-muted-foreground">Left {item.target.replace(".", " › ")} as it was: {item.reason.toLowerCase()}.</li>)}
                                {call.results.taskId ? <li>A callback task was created for the owner.</li> : null}
                                {call.results.retry ? <li>Will try again {formatWorkspaceRelativeTime(call.results.retry.at)}.</li> : null}
                                {call.results.stopListed ? <li>The number was added to the bot stop list.</li> : null}
                            </ul>
                        </section>
                    ) : null}
                    {call.transcript?.length ? (
                        <section className="space-y-2" aria-labelledby="call-transcript">
                            <h3 id="call-transcript" className="text-sm font-medium">Transcript</h3>
                            <div className="space-y-2">
                                {call.transcript.map((line, index) => (
                                    <div key={index} className={cn("flex", line.role === "caller" ? "justify-end" : "justify-start")}>
                                        <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", line.role === "caller" ? "bg-primary/10" : "bg-muted")}>
                                            <span className="sr-only">{line.role === "caller" ? "Caller: " : "Bot: "}</span>{line.text}
                                            {line.interrupted ? <span className="ml-1 text-xs text-muted-foreground">(interrupted)</span> : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : LIVE.has(call.status) ? <p className="text-sm text-muted-foreground" role="status">The call is under way. The transcript appears when it ends.</p> : null}
                </div>
            )}
        </StandardSheet>
    );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Sparkles,
    FileText,
    Clock,
    PhoneCall,
    ListTodo,
    TrendingUp,
    Users,
    Send,
    Copy,
    Loader2,
} from "lucide-react";
import { AI_RECORD_WORKFLOWS, type AiRecordWorkflow } from "@/lib/ai-workflows";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAiMessageDraft } from "@/providers/ai-message-draft-provider";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/common/dialogs-provider";

type EntityType = "LEAD" | "OPPORTUNITY";

const ACTIONS: Array<{ key: string; label: string; icon: any }> = [
    { key: "summarize_record", label: "Summarize", icon: FileText },
    { key: "explain_timeline", label: "Explain timeline", icon: Clock },
    { key: "prepare_call_notes", label: "Prepare call notes", icon: PhoneCall },
    { key: "suggest_next_task", label: "Suggest next task", icon: ListTodo },
    { key: "explain_predictive_score", label: "Explain predictive score", icon: TrendingUp },
    { key: "prepare_manager_review", label: "Prepare manager review", icon: Users },
];

// Gap checklist Module 7, item 4: "AI assistant command palette" -- built as a record-scoped
// side panel rather than an extension of the existing global GlobalSearch cmd-K component.
// Every action listed there is inherently record-scoped (summarize THIS lead, explain THIS
// timeline), and GlobalSearch has no concept of "current record context" or "show a generated
// result inline" -- building this as its own panel, triggered from the record's own detail
// page, is a more honest fit than bolting record-scoped actions onto an unrelated global
// search surface. See the checklist writeup for the full reasoning.
export function AiAssistantPanel({ entityType, entityId, entityLabel, recipientEmail, recipientPhone }: {
    entityType: EntityType;
    entityId: string;
    entityLabel: string;
    recipientEmail?: string | null;
    recipientPhone?: string | null;
}) {
    const confirmAction = useConfirm();
    const [open, setOpen] = useState(false);
    const [workflow, setWorkflow] = useState<AiRecordWorkflow>(AI_RECORD_WORKFLOWS[0].key);
    const [runningAction, setRunningAction] = useState<string | null>(null);
    const [result, setResult] = useState<{ action: string; text: string } | null>(null);

    const [draftOpen, setDraftOpen] = useState(false);
    const { draft, update: updateDraft, current: currentDraft } = useAiMessageDraft(`${entityType}:${entityId}`);
    const { channel, composing, sending, error: sendError } = draft;
    const setChannel = (channel: typeof draft.channel) => updateDraft({ channel });
    const setComposing = (composing: typeof draft.composing) => updateDraft({ composing });
    const setSending = (sending: boolean) => updateDraft({ sending });
    const setSendError = (error: string) => updateDraft({ error });
    const [instructions, setInstructions] = useState("");
    const [drafting, setDrafting] = useState(false);
    const [variants, setVariants] = useState<string[]>([]);
    const [actionError, setActionError] = useState<{ action: string; message: string } | null>(null);
    const [draftError, setDraftError] = useState('');
    const draftRequest = useRef<AbortController | null>(null);
    const sendPending = useRef(false);
    const actionRequest = useRef<AbortController | null>(null);
    const opener = useRef<HTMLButtonElement | null>(null);
    const requestVersion = useRef(0);
    useEffect(() => {
        requestVersion.current += 1;
        setResult(null); setVariants([]); setInstructions("");
        setRunningAction(null); setDrafting(false); sendPending.current = false; setActionError(null); setDraftError('');
        return () => { requestVersion.current += 1; actionRequest.current?.abort(); actionRequest.current = null; draftRequest.current?.abort(); draftRequest.current = null; };
    }, [entityType, entityId]);
    useEffect(() => {
        if (!composing && !sending) return;
        const navigate = (event: MouseEvent) => {
            const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
            if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.hasAttribute("download")) return;
            const destination = new URL(anchor.href);
            if (destination.pathname === location.pathname && destination.search === location.search) return;
            if (!window.confirm(sending ? "A message submission is pending. Leave this page? Check its status before sending again." : "Leave this page? Your unsent message will be kept while you stay signed in to this app.")) {
                event.preventDefault(); event.stopPropagation();
            }
        };
        document.addEventListener("click", navigate, true);
        return () => { document.removeEventListener("click", navigate, true); };
    }, [composing, sending]);
    const changeChannel = async (next: "EMAIL" | "WHATSAPP" | "SMS") => {
        if (sendPending.current || currentDraft().sending || draftRequest.current) return;
        if (composing && !(await confirmAction({ title: "Change channel?", description: "Your unsent message will be discarded.", confirmLabel: "Change channel", destructive: true }))) return;
        setChannel(next); setVariants([]); setComposing(null); setSendError(''); setDraftError('');
    };

    const runAction = async (actionKey: string) => {
        if (actionRequest.current) return;
        const controller = new AbortController();
        actionRequest.current = controller;
        const version = requestVersion.current;
        setRunningAction(actionKey);
        setActionError(null);
        try {
            const response = await apiFetch<{ text: string }>("/ai/assist", {
                method: "POST",
                body: JSON.stringify({ action: actionKey, entityType, entityId }),
                signal: controller.signal,
            });
            if (version === requestVersion.current) setResult({ action: actionKey, text: response.text });
        } catch (error: any) {
            if (version === requestVersion.current && !controller.signal.aborted) setActionError({ action: actionKey, message: error?.message || "AI action failed. Try again." });
        } finally {
            if (version === requestVersion.current) setRunningAction(null);
            if (actionRequest.current === controller) actionRequest.current = null;
        }
    };

    const generateVariants = async () => {
        if (draftRequest.current || sendPending.current || currentDraft().sending) return;
        const controller = new AbortController();
        draftRequest.current = controller;
        const version = requestVersion.current;
        setDraftError('');
        setDrafting(true);
        try {
            const response = await apiFetch<{ variants: string[] }>("/ai/draft-communication", {
                method: "POST",
                body: JSON.stringify({ entityType, entityId, channel, instructions, variantCount: 2 }),
                signal: controller.signal,
            });
            if (version === requestVersion.current) setVariants(response.variants);
        } catch (error: any) {
            if (version === requestVersion.current && !controller.signal.aborted) setDraftError(error?.message || "Failed to draft message. Try again.");
        } finally {
            if (version === requestVersion.current) setDrafting(false);
            if (draftRequest.current === controller) draftRequest.current = null;
        }
    };

    const applyVariant = async (text: string) => {
        if (sendPending.current || currentDraft().sending || draftRequest.current) return;
        if (composing && !(await confirmAction({ title: "Replace your message?", description: "Your unsent message will be replaced with this draft.", confirmLabel: "Replace" }))) return;
        setSendError('');
        const recipient = channel === "EMAIL" ? recipientEmail ?? "" : recipientPhone ?? "";
        setComposing({ recipient, subject: channel === "EMAIL" ? `Re: ${entityLabel}` : "", body: text });
    };

    const sendDraft = async () => {
        if (sendPending.current || currentDraft().sending || draftRequest.current) return;
        if (!composing?.recipient.trim() || !composing.body.trim()) {
            setSendError("Recipient and message body are required");
            return;
        }
        sendPending.current = true;
        const version = requestVersion.current;
        setSendError('');
        setSending(true);
        try {
            const outcome = await apiFetch<any>("/ai/draft-communication/confirm", {
                method: "POST",
                body: JSON.stringify({ entityType, entityId, channel, recipient: composing.recipient, subject: composing.subject, body: composing.body }),
            });
            updateDraft({ composing: null, sending: false, error: "" });
            if (version !== requestVersion.current) return;
            if (outcome?.pendingApproval) {
                toast.success("Submitted for a second admin's approval");
            } else {
                toast.success("Message queued for sending");
            }
            setComposing(null);
            setVariants([]);
            setDraftOpen(false);
        } catch (error: any) {
            setSendError(error?.message || "Submission failed. Check communication history before retrying if the connection was interrupted.");
        } finally {
            setSending(false);
            if (version === requestVersion.current) sendPending.current = false;
        }
    };

    return (
        <>
            <Button ref={opener} variant="outline" className="h-9 rounded-xl px-3.5" onClick={() => { if (composing) setDraftOpen(true); setOpen(true); }}>
                <Sparkles className="size-4" />
                AI Assistant
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent onCloseAutoFocus={(event) => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }} side="right" className="min-w-0 w-full gap-0 sm:max-w-[560px]">
                    <SheetHeader className="border-b p-4">
                        <SheetTitle className="min-w-0 break-words pr-6 text-base [overflow-wrap:anywhere] [&>svg]:mb-2">
                            <Sparkles className="size-4" />
                            AI Assistant — {entityLabel}
                        </SheetTitle>
                        <SheetDescription>Every result below is generated on request and never saved or sent without your confirmation.</SheetDescription>
                    </SheetHeader>

                    <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
                        <div className="grid gap-2 sm:grid-cols-2">
                            {ACTIONS.map(({ key, label, icon: Icon }) => (
                                <Button key={key} variant="outline" className="h-auto min-h-9 justify-start whitespace-normal text-left" disabled={!!runningAction} onClick={() => runAction(key)}>
                                    {runningAction === key ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                                    {label}
                                </Button>
                            ))}
                        </div>

                        <section className="min-w-0 space-y-3 rounded-xl border p-3" aria-label="AI workflows">
                            <Label htmlFor="ai-record-workflow">Workflow</Label>
                            <Select value={workflow} disabled={!!runningAction} onValueChange={(value) => setWorkflow(value as AiRecordWorkflow)}>
                                <SelectTrigger id="ai-record-workflow" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {AI_RECORD_WORKFLOWS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <p className="text-sm text-muted-foreground">{AI_RECORD_WORKFLOWS.find((item) => item.key === workflow)?.description}</p>
                            <Button variant="outline" className="w-full" disabled={!!runningAction} onClick={() => runAction(workflow)}>
                                {runningAction === workflow ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                Generate workflow
                            </Button>
                            <p className="text-xs text-muted-foreground">Uses recent record history. Review before acting; nothing is assigned, scheduled or sent.</p>
                        </section>

                        {runningAction && <p role="status" className="text-sm text-muted-foreground">Generating AI response…</p>}
                        {actionError && <div className="space-y-2 rounded-lg border p-3">
                            <p role="alert" className="break-words text-sm text-destructive">{actionError.message}</p>
                            <Button variant="outline" size="sm" disabled={!!runningAction} onClick={() => runAction(actionError.action)}>Retry AI action</Button>
                        </div>}
                        {draftError && <p role="alert" className="break-words text-sm text-destructive">{draftError}</p>}
                        {result && (
                            <Card className="space-y-2 p-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-muted-foreground">{ACTIONS.find((a) => a.key === result.action)?.label ?? AI_RECORD_WORKFLOWS.find((item) => item.key === result.action)?.label}</p>
                                    <Button variant="ghost" size="icon-sm" aria-label="Copy AI result" onClick={() => { navigator.clipboard.writeText(result.text); toast.success("Copied"); }}>
                                        <Copy className="size-3.5" />
                                    </Button>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-sm">{result.text}</p>
                            </Card>
                        )}

                        <div className="rounded-lg border p-3">
                            <button type="button" className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setDraftOpen((v) => !v)}>
                                Draft a follow-up message
                                <span className="text-xs font-normal text-muted-foreground">{draftOpen ? "Hide" : "Show"}</span>
                            </button>
                            {composing && <p role="status" className="mt-2 text-xs text-muted-foreground">Unsent message kept for this record while you stay signed in. Refreshing or closing this tab clears it.</p>}
                            {draftOpen && (
                                <div className="mt-3 space-y-3">
                                    <div className="flex min-w-0 flex-wrap gap-2">
                                        <Select value={channel} disabled={drafting || sending} onValueChange={(value) => changeChannel(value as "EMAIL" | "WHATSAPP" | "SMS")}>
                                            <SelectTrigger aria-label="Draft channel" className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="EMAIL">Email</SelectItem>
                                                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                                                <SelectItem value="SMS">SMS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input aria-label="Draft instructions" disabled={drafting || sending} placeholder="Instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                                    </div>
                                    <Button size="sm" variant="outline" disabled={drafting || sending} onClick={generateVariants}>
                                        {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                        Generate variants
                                    </Button>

                                    {variants.map((variant, index) => (
                                        <Card key={index} className="space-y-2 p-3">
                                            <p className="whitespace-pre-wrap break-words text-sm">{variant}</p>
                                            <Button size="sm" disabled={drafting || sending} onClick={() => applyVariant(variant)}>Use this draft</Button>
                                        </Card>
                                    ))}

                                    {composing && (
                                        <Card className="space-y-2 p-3">
                                            <Label htmlFor="ai-draft-recipient" className="text-xs">Recipient</Label>
                                            <Input id="ai-draft-recipient" disabled={sending} value={composing.recipient} onChange={(e) => setComposing({ ...composing, recipient: e.target.value })} />
                                            {channel === "EMAIL" && (
                                                <>
                                                    <Label htmlFor="ai-draft-subject" className="text-xs">Subject</Label>
                                                    <Input id="ai-draft-subject" disabled={sending} value={composing.subject} onChange={(e) => setComposing({ ...composing, subject: e.target.value })} />
                                                </>
                                            )}
                                            <Label htmlFor="ai-draft-message" className="text-xs">Message (edit before sending)</Label>
                                            <Textarea id="ai-draft-message" disabled={sending} rows={5} value={composing.body} onChange={(e) => setComposing({ ...composing, body: e.target.value })} />
                                            <Button size="sm" variant="ghost" disabled={sending} onClick={async () => {
                                                if (await confirmAction({ title: "Discard message?", description: "Your unsent message will be lost.", confirmLabel: "Discard", destructive: true })) updateDraft({ composing: null, error: "" });
                                            }}>Discard message</Button>
                                            {sendError && <p role="alert" className="break-words text-sm text-destructive">{sendError}</p>}
                                            {sending && <p role="status" className="text-sm text-muted-foreground">Submitting message…</p>}
                                            <Button size="sm" disabled={sending || drafting} onClick={sendDraft}>
                                                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                                                Confirm &amp; send
                                            </Button>
                                        </Card>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

"use client";

import { useState } from "react";
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
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

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
    const [open, setOpen] = useState(false);
    const [runningAction, setRunningAction] = useState<string | null>(null);
    const [result, setResult] = useState<{ action: string; text: string } | null>(null);

    const [draftOpen, setDraftOpen] = useState(false);
    const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP" | "SMS">("EMAIL");
    const [instructions, setInstructions] = useState("");
    const [drafting, setDrafting] = useState(false);
    const [variants, setVariants] = useState<string[]>([]);
    const [composing, setComposing] = useState<{ recipient: string; subject: string; body: string } | null>(null);
    const [sending, setSending] = useState(false);

    const runAction = async (actionKey: string) => {
        setRunningAction(actionKey);
        setResult(null);
        try {
            const response = await apiFetch<{ text: string }>("/ai/assist", {
                method: "POST",
                body: JSON.stringify({ action: actionKey, entityType, entityId }),
            });
            setResult({ action: actionKey, text: response.text });
        } catch (error: any) {
            toast.error(error?.message || "AI action failed");
        } finally {
            setRunningAction(null);
        }
    };

    const generateVariants = async () => {
        setDrafting(true);
        setVariants([]);
        try {
            const response = await apiFetch<{ variants: string[] }>("/ai/draft-communication", {
                method: "POST",
                body: JSON.stringify({ entityType, entityId, channel, instructions, variantCount: 2 }),
            });
            setVariants(response.variants);
        } catch (error: any) {
            toast.error(error?.message || "Failed to draft message");
        } finally {
            setDrafting(false);
        }
    };

    const applyVariant = (text: string) => {
        const recipient = channel === "EMAIL" ? recipientEmail ?? "" : recipientPhone ?? "";
        setComposing({ recipient, subject: channel === "EMAIL" ? `Re: ${entityLabel}` : "", body: text });
    };

    const sendDraft = async () => {
        if (!composing?.recipient || !composing.body) {
            toast.error("Recipient and message body are required");
            return;
        }
        setSending(true);
        try {
            const outcome = await apiFetch<any>("/ai/draft-communication/confirm", {
                method: "POST",
                body: JSON.stringify({ entityType, entityId, channel, recipient: composing.recipient, subject: composing.subject, body: composing.body }),
            });
            if (outcome?.pendingApproval) {
                toast.success("Submitted for a second admin's approval");
            } else {
                toast.success("Message queued for sending");
            }
            setComposing(null);
            setVariants([]);
            setDraftOpen(false);
        } catch (error: any) {
            toast.error(error?.message || "Failed to send message");
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <Button variant="outline" className="h-9 rounded-[10px] px-3.5" onClick={() => setOpen(true)}>
                <Sparkles className="size-4" />
                AI Assistant
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="w-full gap-0 sm:max-w-[520px]">
                    <SheetHeader className="border-b p-4">
                        <SheetTitle className="flex items-center gap-2 text-base">
                            <Sparkles className="size-4" />
                            AI Assistant — {entityLabel}
                        </SheetTitle>
                        <SheetDescription>Every result below is generated on request and never saved or sent without your confirmation.</SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 space-y-4 overflow-y-auto p-4">
                        <div className="grid grid-cols-2 gap-2">
                            {ACTIONS.map(({ key, label, icon: Icon }) => (
                                <Button key={key} variant="outline" className="justify-start" disabled={runningAction === key} onClick={() => runAction(key)}>
                                    {runningAction === key ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                                    {label}
                                </Button>
                            ))}
                        </div>

                        {result && (
                            <Card className="space-y-2 p-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-muted-foreground">{ACTIONS.find((a) => a.key === result.action)?.label}</p>
                                    <Button variant="ghost" size="icon-sm" onClick={() => { navigator.clipboard.writeText(result.text); toast.success("Copied"); }}>
                                        <Copy className="size-3.5" />
                                    </Button>
                                </div>
                                <p className="whitespace-pre-wrap text-sm">{result.text}</p>
                            </Card>
                        )}

                        <div className="rounded-lg border p-3">
                            <button type="button" className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setDraftOpen((v) => !v)}>
                                Draft a follow-up message
                                <span className="text-xs font-normal text-muted-foreground">{draftOpen ? "Hide" : "Show"}</span>
                            </button>
                            {draftOpen && (
                                <div className="mt-3 space-y-3">
                                    <div className="flex gap-2">
                                        <Select value={channel} onValueChange={(value) => setChannel(value as any)}>
                                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="EMAIL">Email</SelectItem>
                                                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                                                <SelectItem value="SMS">SMS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input placeholder="Instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                                    </div>
                                    <Button size="sm" variant="outline" disabled={drafting} onClick={generateVariants}>
                                        {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                        Generate variants
                                    </Button>

                                    {variants.map((variant, index) => (
                                        <Card key={index} className="space-y-2 p-3">
                                            <p className="whitespace-pre-wrap text-sm">{variant}</p>
                                            <Button size="sm" onClick={() => applyVariant(variant)}>Use this draft</Button>
                                        </Card>
                                    ))}

                                    {composing && (
                                        <Card className="space-y-2 p-3">
                                            <Label className="text-xs">Recipient</Label>
                                            <Input value={composing.recipient} onChange={(e) => setComposing({ ...composing, recipient: e.target.value })} />
                                            {channel === "EMAIL" && (
                                                <>
                                                    <Label className="text-xs">Subject</Label>
                                                    <Input value={composing.subject} onChange={(e) => setComposing({ ...composing, subject: e.target.value })} />
                                                </>
                                            )}
                                            <Label className="text-xs">Message (edit before sending)</Label>
                                            <Textarea rows={5} value={composing.body} onChange={(e) => setComposing({ ...composing, body: e.target.value })} />
                                            <Button size="sm" disabled={sending} onClick={sendDraft}>
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

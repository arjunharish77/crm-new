"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { FixedStep, VoiceBotConfig } from "@/lib/voice-bot-config";
import { Section } from "@/components/common/section";
import { FormField } from "@/components/common/form-field";
import { SelectField } from "./select-field";
import { StandardDialog } from "@/components/common/standard-dialog";
import { RecordPicker } from "@/components/common/record-picker";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlaceholderTextarea } from "./placeholder-textarea";
import type { FieldCatalog, ProviderSettings, VoiceBotField } from "../types";

type Props = {
    config: VoiceBotConfig;
    update: (patch: Partial<VoiceBotConfig>) => void;
    catalog: FieldCatalog | null;
    fields: VoiceBotField[];
    teams: Array<{ id: string; name: string }>;
    providers: ProviderSettings | null;
    showErrors: boolean;
};

const newStepId = () => `step_${Math.random().toString(36).slice(2, 10)}`;

export function ConversationPanel({ config, update, catalog, fields, teams, providers, showErrors }: Props) {
    const details = (catalog?.callerDetails ?? []).filter((item) => config.callerDetails.includes(item.key));
    const [draftOpen, setDraftOpen] = useState(false);
    const claudeReady = !!providers?.claude.configured && providers.claude.spentThisMonthUsd < providers.claude.monthlyCapUsd;
    const textProps = { details };
    return (
        <div>
            <Section layout="split" id="conversation-opening" title="Opening" description="What the bot says first, in the start language. Keep it short; callers decide in seconds."
                actions={<Button variant="outline" size="sm" onClick={() => setDraftOpen(true)} disabled={!claudeReady} title={claudeReady ? undefined : "Add a Claude key in Providers"}><Sparkles className="size-4" aria-hidden />Redraft with Claude</Button>}>
                <PlaceholderTextarea id="bot-opening" label="Opening line" required rows={2} maxLength={600} value={config.openingLine} onChange={(openingLine) => update({ openingLine })}
                    placeholder="Namaste {{lead.firstName|ji}}, main Unnati Vidya se bol rahi hoon. Aapne MBA ke baare mein poocha tha, kya abhi do minute baat ho sakti hai?"
                    error={showErrors && !config.openingLine.trim() ? "Write the opening line." : null} {...textProps} />
                <Preview config={config} />
            </Section>

            <Section layout="split" id="conversation-guidance" title="Persona, goal and rules" description="How the AI behaves. Write plainly; it follows these on every call.">
                <PlaceholderTextarea id="bot-persona" label="Persona" rows={3} maxLength={4000} value={config.persona} onChange={(persona) => update({ persona })} placeholder="You are Asha, a warm admissions advisor…" {...textProps} />
                <PlaceholderTextarea id="bot-goal" label="Goal" required rows={2} maxLength={2000} value={config.goal} onChange={(goal) => update({ goal })}
                    placeholder="Find out the caller's preferred intake and budget, answer questions about the programme, and book a counselling call."
                    error={showErrors && !config.goal.trim() ? "Describe the goal." : null} {...textProps} />
                <PlaceholderTextarea id="bot-rules" label="Rules" rows={6} maxLength={6000} value={config.rules} onChange={(rules) => update({ rules })}
                    help="One rule per line. The bot only states facts from its knowledge or the caller details; otherwise it offers to have someone confirm." {...textProps} />
            </Section>

            <Section layout="split" id="conversation-steps" title="Fixed steps" description="Lines said or questions asked exactly as written, before or after the AI part, e.g. a consent question first or a fixed sign-off.">
                <StepsEditor title="Before the AI part" steps={config.fixedSteps.before} fields={fields} details={details} onChange={(before) => update({ fixedSteps: { ...config.fixedSteps, before } })} />
                <StepsEditor title="After the AI part" steps={config.fixedSteps.after} fields={fields} details={details} onChange={(after) => update({ fixedSteps: { ...config.fixedSteps, after } })} />
            </Section>

            <Section layout="split" id="conversation-transfer" title="Live transfer" description="Hand interested callers to a person: the lead owner first, then the next available agent of the team. If nobody answers, the bot books a callback (decision 3).">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <Label htmlFor="bot-transfer">Transfer to a person when it fits</Label>
                    <Switch id="bot-transfer" checked={config.transfer.enabled} onCheckedChange={(enabled) => update({ transfer: { ...config.transfer, enabled } })} />
                </div>
                {config.transfer.enabled ? (
                    <>
                        <PlaceholderTextarea id="bot-transfer-rule" label="When to transfer" rows={2} maxLength={1000} value={config.transfer.rule} onChange={(rule) => update({ transfer: { ...config.transfer, rule } })}
                            help="The caller asking for a person always counts." placeholder="When the caller wants to apply, asks about scholarships, or has a question the bot can't answer." {...textProps} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <SelectField id="bot-transfer-team" label="Team after the owner" help="Its next available agent rings if the owner doesn't answer." value={config.transfer.teamId ?? "__none"} onValueChange={(teamId) => update({ transfer: { ...config.transfer, teamId: teamId === "__none" ? null : teamId } })}>
                                        <SelectItem value="__none">No team (owner only)</SelectItem>
                                        {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                                    </SelectField>
                            <FormField id="bot-transfer-ring" label="Ring each person for (seconds)">
                                <Input type="number" inputMode="numeric" min={10} max={120} value={config.transfer.ringSeconds}
                                    onChange={(event) => update({ transfer: { ...config.transfer, ringSeconds: Math.min(120, Math.max(10, Number(event.target.value) || 10)) } })} className="max-w-32" />
                            </FormField>
                        </div>
                    </>
                ) : null}
            </Section>

            <Section layout="split" id="conversation-ending" title="Ending" description="When the bot wraps up, and what it says last.">
                <PlaceholderTextarea id="bot-end-rule" label="When to end the call" rows={2} maxLength={1000} value={config.endRule} onChange={(endRule) => update({ endRule })}
                    placeholder="When the questions are answered and a next step is agreed, or the caller isn't interested." {...textProps} />
                <PlaceholderTextarea id="bot-closing" label="Closing line" rows={2} maxLength={600} value={config.closingLine} onChange={(closingLine) => update({ closingLine })}
                    placeholder="Dhanyavaad {{lead.firstName|ji}}! Aapka din shubh ho." {...textProps} />
            </Section>

            <RedraftDialog open={draftOpen} onClose={() => setDraftOpen(false)} config={config} update={update} />
        </div>
    );
}

// The opening line and steps as a caller would hear them, filled from a real lead.
function Preview({ config }: { config: VoiceBotConfig }) {
    const [leadId, setLeadId] = useState<string | null>(null);
    const [result, setResult] = useState<{ openingLine: string; record: { leadName: string | null; opportunityTitle: string | null } } | null>(null);
    const [loading, setLoading] = useState(false);
    const run = async (id: string | null) => {
        setLeadId(id);
        setResult(null);
        if (!id) return;
        setLoading(true);
        try {
            setResult(await apiFetch("/voice-bots/preview", { method: "POST", body: JSON.stringify({ config, leadId: id }) }));
        } catch (error: any) {
            toast.error(error?.message || "The preview couldn't be made");
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <FormField id="bot-preview-lead" label="Preview with a lead" help="Fills the placeholders from this lead, as the caller would hear it. Uses unsaved changes.">
                <RecordPicker entity="lead" value={leadId} onChange={(id) => run(id ?? null)} placeholder="Search leads" />
            </FormField>
            {loading ? <p className="text-sm text-muted-foreground" role="status">Filling in…</p> : null}
            {result ? (
                <div className="space-y-1" aria-live="polite">
                    <p className="text-xs text-muted-foreground">{result.record.leadName}{result.record.opportunityTitle ? ` · ${result.record.opportunityTitle}` : ""}</p>
                    <p className="text-sm">{result.openingLine || <span className="text-muted-foreground">The opening line is empty.</span>}</p>
                </div>
            ) : null}
            {leadId && result ? <Button variant="ghost" size="xs" onClick={() => run(leadId)}>Refresh preview</Button> : null}
        </div>
    );
}

function StepsEditor({ title, steps, fields, details, onChange }: {
    title: string;
    steps: FixedStep[];
    fields: VoiceBotField[];
    details: Array<{ key: string; label: string }>;
    onChange: (steps: FixedStep[]) => void;
}) {
    const set = (index: number, patch: Partial<FixedStep>) => onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
    const move = (index: number, delta: number) => {
        const next = [...steps];
        const [item] = next.splice(index, 1);
        next.splice(index + delta, 0, item);
        onChange(next);
    };
    return (
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{title}</legend>
            {steps.length === 0 ? <p className="text-sm text-muted-foreground">No steps.</p> : null}
            <ol className="space-y-2">
                {steps.map((step, index) => (
                    <li key={step.id} className="space-y-3 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground tabular-nums">{index + 1}</span>
                            <Select value={step.kind} onValueChange={(kind) => set(index, { kind: kind as FixedStep["kind"], ...(kind === "say" ? { fieldKey: null, onAnswer: [] } : {}) })}>
                                <SelectTrigger className="w-32" aria-label={`Step ${index + 1} type`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="say">Say</SelectItem>
                                    <SelectItem value="ask">Ask</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="ml-auto flex items-center">
                                <IconButton label="Move up" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="size-4" /></IconButton>
                                <IconButton label="Move down" onClick={() => move(index, 1)} disabled={index === steps.length - 1}><ArrowDown className="size-4" /></IconButton>
                                <IconButton label={`Remove step ${index + 1}`} onClick={() => onChange(steps.filter((_, i) => i !== index))}><Trash2 className="size-4" /></IconButton>
                            </div>
                        </div>
                        <PlaceholderTextarea id={`${step.id}-text`} label={step.kind === "say" ? "Says" : "Asks"} rows={2} maxLength={1000} value={step.text} onChange={(text) => set(index, { text })} details={details} />
                        {step.kind === "ask" ? (
                            <div className="space-y-3">
                                <SelectField id={`${step.id}-field`} label="Save the answer to" value={step.fieldKey ?? "__none"} onValueChange={(fieldKey) => set(index, { fieldKey: fieldKey === "__none" ? null : fieldKey })} triggerClassName="max-w-80">
                                            <SelectItem value="__none">Don&apos;t save</SelectItem>
                                            {fields.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}
                                        </SelectField>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">If the answer is…</p>
                                    {step.onAnswer.map((rule, ruleIndex) => (
                                        <div key={ruleIndex} className="flex flex-wrap items-center gap-2">
                                            <Input value={rule.equals} maxLength={200} onChange={(event) => set(index, { onAnswer: step.onAnswer.map((item, i) => (i === ruleIndex ? { ...item, equals: event.target.value } : item)) })}
                                                placeholder="No" aria-label={`Answer ${ruleIndex + 1}`} className="w-40" />
                                            <Select value={rule.action} onValueChange={(action) => set(index, { onAnswer: step.onAnswer.map((item, i) => (i === ruleIndex ? { ...item, action: action as typeof item.action } : item)) })}>
                                                <SelectTrigger className="w-48" aria-label={`What happens after answer ${ruleIndex + 1}`}><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="continue">Carry on</SelectItem>
                                                    <SelectItem value="end">End the call politely</SelectItem>
                                                    <SelectItem value="transfer">Transfer to a person</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <IconButton label={`Remove answer ${ruleIndex + 1}`} onClick={() => set(index, { onAnswer: step.onAnswer.filter((_, i) => i !== ruleIndex) })}><X className="size-4" /></IconButton>
                                        </div>
                                    ))}
                                    <Button variant="ghost" size="xs" onClick={() => set(index, { onAnswer: [...step.onAnswer, { equals: "", action: "end" }] })} disabled={step.onAnswer.length >= 10}><Plus className="size-3.5" />Add an answer</Button>
                                </div>
                            </div>
                        ) : null}
                    </li>
                ))}
            </ol>
            <Button variant="outline" size="sm" onClick={() => onChange([...steps, { id: newStepId(), kind: "say", text: "", fieldKey: null, onAnswer: [] }])} disabled={steps.length >= 20}><Plus className="size-4" />Add step</Button>
        </fieldset>
    );
}

// Claude rewrites the conversation from a description; the result fills the form (unsaved) for review.
function RedraftDialog({ open, onClose, config, update }: { open: boolean; onClose: () => void; config: VoiceBotConfig; update: (patch: Partial<VoiceBotConfig>) => void }) {
    const [description, setDescription] = useState("");
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (open) { setDescription(config.description); setError(null); } }, [open, config.description]);
    const run = async () => {
        if (description.trim().length < 10) { setError("Describe the bot in at least 10 characters."); return; }
        setWorking(true);
        setError(null);
        try {
            const draft = await apiFetch<any>("/voice-bots/draft", { method: "POST", body: JSON.stringify({ description, callerDetails: config.callerDetails }) });
            update({
                persona: draft.persona, goal: draft.goal, rules: draft.rules, openingLine: draft.openingLine, closingLine: draft.closingLine, endRule: draft.endRule,
                transfer: { ...config.transfer, rule: draft.transferRule },
            });
            toast.success("Claude's draft is in the form. Review it, then save.");
            onClose();
        } catch (caught: any) {
            setError(caught?.message || "Claude couldn't draft the bot.");
        } finally {
            setWorking(false);
        }
    };
    return (
        <StandardDialog open={open} onClose={working ? () => undefined : onClose} title="Redraft with Claude" subtitle="Replaces the persona, goal, rules, lines and transfer and end rules in the form. Nothing is saved until you save." maxWidth="sm"
            actions={<><Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button><Button onClick={run} isLoading={working} disabled={working}>{working ? "Drafting…" : "Draft"}</Button></>}>
            <FormField id="redraft-description" label="What should this bot do?" required error={error} help="Uses Claude Sonnet 5.5, about $0.02.">
                <Textarea rows={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
            </FormField>
        </StandardDialog>
    );
}

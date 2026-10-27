"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Section } from "@/components/common/section";
import { FormField } from "@/components/common/form-field";
import { SaveBar } from "@/components/common/save-bar";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProviderSettings } from "./types";

type Provider = "groq" | "claude" | "google" | "azure";
type Draft = { groqKey: string; claudeKey: string; googleKey: string; azureKey: string; azureRegion: string; claudeMonthlyCapUsd: string; remove: Provider[] };

const emptyDraft = (settings: ProviderSettings): Draft => ({
    groqKey: "", claudeKey: "", googleKey: "", azureKey: "", azureRegion: settings.azure.region ?? "",
    claudeMonthlyCapUsd: String(settings.claude.monthlyCapUsd), remove: [],
});

const PROVIDERS: Array<{ key: Provider; title: string; description: string; field: keyof Draft; placeholder: string; help: string }> = [
    { key: "groq", title: "Groq", field: "groqKey", placeholder: "gsk_…", description: "Turns callers' speech into text (Whisper), and can run the conversation. Use a free Groq account just for the CRM.", help: "From console.groq.com › API keys." },
    { key: "claude", title: "Claude (Anthropic)", field: "claudeKey", placeholder: "sk-ant-…", description: "Runs the conversation for bots set to Claude, writes call summaries and fields, drafts bots and reviews calls.", help: "From console.anthropic.com › API keys." },
    { key: "google", title: "Google Text-to-Speech", field: "googleKey", placeholder: "AIza…", description: "The bot's voice: Chirp 3 HD Indian Hindi and English voices, free up to the monthly allowance.", help: "A Google Cloud API key with the Text-to-Speech API enabled." },
    { key: "azure", title: "Azure Speech", field: "azureKey", placeholder: "Key 1 from the Speech resource", description: "Backup voice when Google's free allowance runs out (decision 7).", help: "From the Azure portal › your Speech resource › Keys and endpoint." },
];

// Voice bots › Providers (settings template, SaveBar). Keys are write-only: a saved
// key shows only its last four characters, and an empty field keeps it.
export function ProvidersPanel() {
    const [settings, setSettings] = useState<ProviderSettings | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tests, setTests] = useState<Partial<Record<Provider, { ok: boolean; message: string } | "running">>>({});
    const [capError, setCapError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const next = await apiFetch<ProviderSettings>("/voice-bots/providers");
            setSettings(next);
            setDraft(emptyDraft(next));
        } catch {
            setFailed(true);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (failed) return <ErrorState description="The provider settings couldn't be loaded." onRetry={load} />;
    if (!settings || !draft) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;

    const baseline = emptyDraft(settings);
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
    const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

    const save = async () => {
        const cap = Number(draft.claudeMonthlyCapUsd);
        if (!Number.isFinite(cap) || cap < 1) { setCapError("Set a budget of at least $1."); return; }
        setCapError(null);
        setSaving(true);
        try {
            const body: Record<string, unknown> = { azureRegion: draft.azureRegion.trim(), claudeMonthlyCapUsd: cap, remove: draft.remove };
            for (const provider of PROVIDERS) if ((draft[provider.field] as string).trim()) body[provider.field] = (draft[provider.field] as string).trim();
            const next = await apiFetch<ProviderSettings>("/voice-bots/providers", { method: "PUT", body: JSON.stringify(body) });
            setSettings(next);
            setDraft(emptyDraft(next));
            setTests({});
            toast.success("Provider settings saved");
        } catch (error: any) {
            toast.error(error?.message || "The provider settings couldn't be saved");
        } finally {
            setSaving(false);
        }
    };

    const test = async (provider: Provider) => {
        setTests((current) => ({ ...current, [provider]: "running" }));
        try {
            const result = await apiFetch<{ ok: boolean; message: string }>("/voice-bots/providers/test", { method: "POST", body: JSON.stringify({ provider }) });
            setTests((current) => ({ ...current, [provider]: result }));
        } catch (error: any) {
            setTests((current) => ({ ...current, [provider]: { ok: false, message: error?.message || "The check failed." } }));
        }
    };

    const spentPercent = Math.min(100, Math.round((settings.claude.spentThisMonthUsd / settings.claude.monthlyCapUsd) * 100));

    return (
        <div className="max-w-4xl pb-20">
            {PROVIDERS.map((provider) => {
                const state = settings[provider.key];
                const removing = draft.remove.includes(provider.key);
                const result = tests[provider.key];
                return (
                    <Section key={provider.key} layout="split" id={`provider-${provider.key}`} title={provider.title} description={provider.description}
                        actions={<StatusBadge tone={state.configured && !removing ? "success" : "neutral"} label={removing ? "Will be removed" : state.configured ? "Key saved" : "Not set up"} />}>
                        <FormField id={`provider-${provider.key}-key`} label={state.configured ? "Replace key" : "API key"} help={state.configured ? `Saved key ends ${state.keyHint ?? ""}. Leave empty to keep it.` : provider.help}>
                            <Input type="password" autoComplete="off" spellCheck={false} placeholder={provider.placeholder} value={draft[provider.field] as string}
                                onChange={(event) => update({ [provider.field]: event.target.value, remove: draft.remove.filter((item) => item !== provider.key) } as Partial<Draft>)} />
                        </FormField>
                        {provider.key === "azure" ? (
                            <FormField id="provider-azure-region" label="Region" help="Where the Speech resource is, e.g. centralindia.">
                                <Input value={draft.azureRegion} onChange={(event) => update({ azureRegion: event.target.value })} placeholder="centralindia" className="max-w-60" />
                            </FormField>
                        ) : null}
                        {provider.key === "claude" ? (
                            <div className="space-y-3">
                                <FormField id="provider-claude-cap" label="Monthly budget (US$)" error={capError} help="Alerts go to admins at 50%, 80% and 95%. At 100%, bots use Groq until next month.">
                                    <Input type="number" inputMode="decimal" min={1} step={1} className="max-w-40" value={draft.claudeMonthlyCapUsd} onChange={(event) => update({ claudeMonthlyCapUsd: event.target.value })} />
                                </FormField>
                                <div className="space-y-1.5">
                                    <div className="flex items-baseline justify-between text-sm">
                                        <span>Used this month</span>
                                        <span className="tabular-nums text-muted-foreground">${settings.claude.spentThisMonthUsd.toFixed(2)} of ${settings.claude.monthlyCapUsd} ({spentPercent}%)</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Claude budget used this month" aria-valuemin={0} aria-valuemax={100} aria-valuenow={spentPercent}>
                                        <div className={spentPercent >= 95 ? "h-full bg-destructive" : spentPercent >= 80 ? "h-full bg-status-warning-foreground" : "h-full bg-primary"} style={{ width: `${spentPercent}%` }} />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-3">
                            <Button variant="outline" size="sm" onClick={() => test(provider.key)} disabled={!state.configured || result === "running" || removing} isLoading={result === "running"}>Test connection</Button>
                            {state.configured && !removing ? (
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => update({ remove: [...draft.remove, provider.key], [provider.field]: "" } as Partial<Draft>)}>Remove key</Button>
                            ) : null}
                            <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                {result && result !== "running" ? (
                                    <>{result.ok ? <CheckCircle2 className="size-4 text-primary" aria-hidden /> : <CircleAlert className="size-4 text-destructive" aria-hidden />}{result.message}</>
                                ) : !state.configured ? "Save a key, then test it." : null}
                            </p>
                        </div>
                    </Section>
                );
            })}
            <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { setDraft(baseline); setCapError(null); }} />
        </div>
    );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/common/section";
import { SaveBar } from "@/components/common/save-bar";
import { ErrorState } from "@/components/common/error-state";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Channel = "EMAIL" | "SMS" | "WHATSAPP";
type ExclusionWindow = { startDate: string; endDate: string; reason: string };

// Numbers are kept as text while editing so an empty field means "no limit".
type Draft = {
    daily: string;
    weekly: string;
    monthly: string;
    channelCaps: Record<Channel, string>;
    windows: ExclusionWindow[];
};

const CHANNELS: Array<{ value: Channel; label: string }> = [
    { value: "EMAIL", label: "Email" },
    { value: "SMS", label: "SMS" },
    { value: "WHATSAPP", label: "WhatsApp" },
];

const CAPS: Array<{ key: "daily" | "weekly" | "monthly"; label: string; help: string }> = [
    { key: "daily", label: "Per day", help: "Last 24 hours" },
    { key: "weekly", label: "Per week", help: "Last 7 days" },
    { key: "monthly", label: "Per month", help: "Last 30 days" },
];

function toText(value: unknown) {
    const number = Number(value);
    return value === null || value === undefined || value === "" || !Number.isFinite(number) || number <= 0 ? "" : String(number);
}

function fromSettings(data: any): Draft {
    const caps = data?.channelCaps && typeof data.channelCaps === "object" ? data.channelCaps : {};
    const windows = Array.isArray(data?.exclusionWindows) ? data.exclusionWindows : [];
    return {
        daily: toText(data?.dailyCapPerContact),
        weekly: toText(data?.weeklyCapPerContact),
        monthly: toText(data?.monthlyCapPerContact),
        channelCaps: { EMAIL: toText(caps.EMAIL), SMS: toText(caps.SMS), WHATSAPP: toText(caps.WHATSAPP) },
        windows: windows.map((window: any) => ({ startDate: String(window?.startDate ?? ""), endDate: String(window?.endDate ?? ""), reason: String(window?.reason ?? "") })),
    };
}

function capError(text: string) {
    if (!text.trim()) return null;
    const number = Number(text);
    return Number.isInteger(number) && number > 0 ? null : "Use a whole number above 0, or leave it empty.";
}

// Settings › Messaging & AI › Frequency limits (UI/UX plan decision 33): how many marketing
// messages one person can get, and dates when no marketing goes out. Only campaign and journey
// sends count and are held back; transactional messages (password resets, case replies,
// scheduled reports) are never limited.
export default function FrequencyLimitsPage() {
    const marketingEnabled = useModuleEnabled("MARKETING");
    const [saved, setSaved] = useState<Draft | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const next = fromSettings(await apiFetch<any>("/marketing/fatigue-settings"));
            setSaved(next);
            setDraft(next);
        } catch {
            setFailed(true);
        }
    }, []);
    useEffect(() => { if (marketingEnabled) load(); }, [marketingEnabled, load]);

    if (!marketingEnabled) {
        return <><PageHeader title="Frequency limits" /><ErrorState kind="module" description="Frequency limits apply to campaigns. Turn on the Marketing module in Settings › Modules to use them." /></>;
    }
    if (failed) {
        return <><PageHeader title="Frequency limits" /><ErrorState description="The frequency limits couldn't be loaded." onRetry={load} /></>;
    }

    const dirty = !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft);
    const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    const updateWindow = (index: number, patch: Partial<ExclusionWindow>) =>
        setDraft((current) => (current ? { ...current, windows: current.windows.map((window, i) => (i === index ? { ...window, ...patch } : window)) } : current));

    const windowError = (window: ExclusionWindow) => {
        if (!window.startDate || !window.endDate) return "Choose a start and an end date.";
        if (window.endDate < window.startDate) return "The end date must be on or after the start date.";
        return null;
    };

    const errors = draft ? {
        daily: capError(draft.daily),
        weekly: capError(draft.weekly),
        monthly: capError(draft.monthly),
        EMAIL: capError(draft.channelCaps.EMAIL),
        SMS: capError(draft.channelCaps.SMS),
        WHATSAPP: capError(draft.channelCaps.WHATSAPP),
        windows: draft.windows.map(windowError),
    } : null;
    const hasErrors = !!errors && (Object.entries(errors).some(([key, value]) => key !== "windows" && !!value) || errors.windows.some(Boolean));
    const visible = (message: string | null | undefined) => (showErrors ? message ?? null : null);

    const save = async () => {
        if (!draft) return;
        if (hasErrors) { setShowErrors(true); return; }
        setSaving(true);
        try {
            const toNumber = (text: string) => (text.trim() ? Number(text) : null);
            const channelCaps: Record<string, number> = {};
            for (const { value } of CHANNELS) {
                const cap = toNumber(draft.channelCaps[value]);
                if (cap) channelCaps[value] = cap;
            }
            const body = {
                dailyCapPerContact: toNumber(draft.daily),
                weeklyCapPerContact: toNumber(draft.weekly),
                monthlyCapPerContact: toNumber(draft.monthly),
                channelCaps,
                exclusionWindows: draft.windows.map((window) => ({ startDate: window.startDate, endDate: window.endDate, ...(window.reason.trim() ? { reason: window.reason.trim() } : {}) })),
            };
            const next = fromSettings(await apiFetch<any>("/marketing/fatigue-settings", { method: "PUT", body: JSON.stringify(body) }));
            setSaved(next);
            setDraft(next);
            setShowErrors(false);
            toast.success("Frequency limits saved");
        } catch (caught: any) {
            toast.error(caught?.message || "The frequency limits couldn't be saved");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-w-0 max-w-4xl">
            <PageHeader title="Frequency limits" description="Stop people getting too many marketing messages. Campaign and journey messages over a limit are held back and logged; transactional messages are never limited." />
            {!draft || !errors ? (
                <div className="space-y-3" aria-busy="true"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
            ) : (
                <>
                    <Section layout="split" id="per-person" title="Messages per person" description="Across all channels. Leave a field empty for no limit.">
                        <div className="grid gap-4 sm:grid-cols-3">
                            {CAPS.map(({ key, label, help }) => {
                                const error = visible(errors[key]);
                                return (
                                    <div key={key} className="space-y-1.5">
                                        <Label htmlFor={`cap-${key}`}>{label}</Label>
                                        <Input
                                            id={`cap-${key}`}
                                            type="number"
                                            inputMode="numeric"
                                            min={1}
                                            step={1}
                                            placeholder="No limit"
                                            value={draft[key]}
                                            onChange={(event) => update({ [key]: event.target.value } as Partial<Draft>)}
                                            aria-invalid={!!error || undefined}
                                            aria-describedby={error ? `cap-${key}-error` : `cap-${key}-help`}
                                        />
                                        {error ? <p id={`cap-${key}-error`} className="text-sm text-destructive">{error}</p> : <p id={`cap-${key}-help`} className="text-xs text-muted-foreground">{help}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <Section layout="split" id="per-channel" title="Daily limit per channel" description="The most messages one person can get on a channel in 24 hours. Leave empty for no limit.">
                        <div className="grid gap-4 sm:grid-cols-3">
                            {CHANNELS.map(({ value, label }) => {
                                const error = visible(errors[value]);
                                return (
                                    <div key={value} className="space-y-1.5">
                                        <Label htmlFor={`channel-cap-${value}`}>{label}</Label>
                                        <Input
                                            id={`channel-cap-${value}`}
                                            type="number"
                                            inputMode="numeric"
                                            min={1}
                                            step={1}
                                            placeholder="No limit"
                                            value={draft.channelCaps[value]}
                                            onChange={(event) => update({ channelCaps: { ...draft.channelCaps, [value]: event.target.value } })}
                                            aria-invalid={!!error || undefined}
                                            aria-describedby={error ? `channel-cap-${value}-error` : undefined}
                                        />
                                        {error ? <p id={`channel-cap-${value}-error`} className="text-sm text-destructive">{error}</p> : null}
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <Section
                        layout="split"
                        id="quiet-dates"
                        title="No-marketing dates"
                        description="No campaign or journey messages are sent on these dates, for example during exams or a holiday. Dates are in UTC."
                    >
                        {draft.windows.length === 0 ? <p className="text-sm text-muted-foreground">No dates set. Marketing can go out on any day.</p> : null}
                        <ul className="space-y-3">
                            {draft.windows.map((window, index) => {
                                const error = visible(errors.windows[index]);
                                const errorId = `window-${index}-error`;
                                return (
                                    <li key={index} className="space-y-2 rounded-lg border p-3">
                                        <div className="flex flex-wrap items-end gap-2">
                                            <div className="space-y-1.5">
                                                <Label htmlFor={`window-${index}-start`}>From</Label>
                                                <Input id={`window-${index}-start`} type="date" className="w-40" value={window.startDate} onChange={(event) => updateWindow(index, { startDate: event.target.value })} aria-invalid={!!error || undefined} aria-describedby={error ? errorId : undefined} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor={`window-${index}-end`}>To</Label>
                                                <Input id={`window-${index}-end`} type="date" className="w-40" value={window.endDate} onChange={(event) => updateWindow(index, { endDate: event.target.value })} aria-invalid={!!error || undefined} aria-describedby={error ? errorId : undefined} />
                                            </div>
                                            <div className="min-w-40 flex-1 space-y-1.5">
                                                <Label htmlFor={`window-${index}-reason`}>Reason (optional)</Label>
                                                <Input id={`window-${index}-reason`} value={window.reason} placeholder="Exam week" onChange={(event) => updateWindow(index, { reason: event.target.value })} />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`Remove the dates ${window.startDate || "not set"} to ${window.endDate || "not set"}`}
                                                onClick={() => update({ windows: draft.windows.filter((_, i) => i !== index) })}
                                            >
                                                <X className="size-4" />
                                            </Button>
                                        </div>
                                        {error ? <p id={errorId} className="text-sm text-destructive">{error}</p> : null}
                                    </li>
                                );
                            })}
                        </ul>
                        <Button variant="outline" size="sm" onClick={() => update({ windows: [...draft.windows, { startDate: "", endDate: "", reason: "" }] })}>
                            <Plus className="size-4" />Add dates
                        </Button>
                    </Section>

                    <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { if (saved) setDraft(saved); setShowErrors(false); }} />
                </>
            )}
        </div>
    );
}

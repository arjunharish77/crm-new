"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { WEEKDAYS, type VoiceBotConfig } from "@/lib/voice-bot-config";
import { Section } from "@/components/common/section";
import { FormField } from "@/components/common/form-field";
import { SelectField } from "./select-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

// When and how the bot places outbound calls (decisions 12, 14, 15).
export function CallingPanel({ config, update, numbers, timeError }: {
    config: VoiceBotConfig;
    update: (patch: Partial<VoiceBotConfig>) => void;
    numbers: Array<{ number: string; alias: string | null }>;
    timeError: string | null;
}) {
    const calling = config.calling;
    const toggleDay = (day: number) => {
        const days = calling.days.includes(day) ? calling.days.filter((item) => item !== day) : [...calling.days, day];
        if (days.length) update({ calling: { ...calling, days } });
    };
    const retries = config.retries;
    const gapHours = (index: number) => Math.round((retries.gapsMinutes[index] ?? 1440) / 60);
    const setGapHours = (index: number, hours: number) => {
        const gaps = Array.from({ length: retries.attempts - 1 }, (_, i) => retries.gapsMinutes[i] ?? 1440);
        gaps[index] = clamp(Math.round(hours * 60), 15, 10080);
        update({ retries: { ...retries, gapsMinutes: gaps } });
    };
    const setAttempts = (attempts: number) => {
        const gaps = Array.from({ length: attempts - 1 }, (_, i) => retries.gapsMinutes[i] ?? (i === 0 ? 120 : 1440));
        update({ retries: { attempts, gapsMinutes: gaps } });
    };
    return (
        <div>
            <Section layout="split" id="calling-hours" title="Calling hours" description="Outbound bot calls happen only in these hours, in the workspace time zone. Calls outside them wait for the next opening.">
                <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Days</legend>
                    <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((day) => {
                            const on = calling.days.includes(day.value);
                            return (
                                <button key={day.value} type="button" aria-pressed={on} onClick={() => toggleDay(day.value)}
                                    className={on
                                        ? "h-9 min-w-12 rounded-md border border-primary bg-primary/10 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        : "h-9 min-w-12 rounded-md border px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}>
                                    {day.label}
                                </button>
                            );
                        })}
                    </div>
                </fieldset>
                <div className="flex flex-wrap gap-4">
                    <FormField id="calling-start" label="From" error={timeError} className="w-36">
                        <Input type="time" value={calling.start} onChange={(event) => update({ calling: { ...calling, start: event.target.value } })} />
                    </FormField>
                    <FormField id="calling-end" label="Until" className="w-36">
                        <Input type="time" value={calling.end} onChange={(event) => update({ calling: { ...calling, end: event.target.value } })} />
                    </FormField>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="space-y-0.5">
                        <Label htmlFor="calling-holidays">Skip holidays</Label>
                        <p className="text-xs text-muted-foreground">The days listed in <Link href="/dashboard/voice-bots?tab=holidays" className="text-primary hover:underline">Holidays</Link>.</p>
                    </div>
                    <Switch id="calling-holidays" checked={calling.skipHolidays} onCheckedChange={(skipHolidays) => update({ calling: { ...calling, skipHolidays } })} />
                </div>
            </Section>

            <EnquiryCalls config={config} update={update} />

            <Section layout="split" id="calling-number" title="Calling from" description="The Plivo number callers see. It should be a number the bot also answers, so callbacks reach it.">
                <SelectField id="calling-outbound" label="Number" value={config.outboundNumber ?? "__default"} onValueChange={(value) => update({ outboundNumber: value === "__default" ? null : value })} triggerClassName="max-w-80">
                            <SelectItem value="__default">The phone system&apos;s caller ID</SelectItem>
                            {numbers.map((item) => <SelectItem key={item.number} value={item.number}>{item.number}{item.alias ? ` · ${item.alias}` : ""}</SelectItem>)}
                        </SelectField>
            </Section>

            <Section layout="split" id="calling-retries" title="When a call isn't answered" description="No answer, busy, switched off, or an answering machine (decision 12). Retries stay within calling hours.">
                <SelectField id="calling-attempts" label="Attempts in total" value={String(retries.attempts)} onValueChange={(value) => setAttempts(Number(value))} triggerClassName="max-w-40">{[1, 2, 3, 4, 5].map((count) => <SelectItem key={count} value={String(count)}>{count === 1 ? "1 (no retries)" : count}</SelectItem>)}</SelectField>
                {retries.attempts > 1 ? (
                    <div className="flex flex-wrap gap-4">
                        {Array.from({ length: retries.attempts - 1 }, (_, index) => (
                            <FormField key={index} id={`calling-gap-${index}`} label={`Retry ${index + 1} after (hours)`} className="w-44">
                                <Input type="number" inputMode="numeric" min={1} max={168} value={gapHours(index)} onChange={(event) => setGapHours(index, Number(event.target.value))} />
                            </FormField>
                        ))}
                    </div>
                ) : null}
                <SelectField id="calling-machine" label="Answering machines" help="Detection is free on Plivo India." value={config.answeringMachine} onValueChange={(value) => update({ answeringMachine: value as VoiceBotConfig["answeringMachine"] })} triggerClassName="max-w-96">
                            <SelectItem value="NOT_ANSWERED">Detect and treat as not answered</SelectItem>
                            <SelectItem value="OFF">Don&apos;t detect</SelectItem>
                        </SelectField>
            </Section>

            <Section layout="split" id="calling-limits" title="Limits" description="Keeps calls short and within the free tiers (decision 14).">
                <div className="flex flex-wrap gap-4">
                    <FormField id="calling-daily" label="Calls per day" className="w-40" help="Shown as “x of y used”.">
                        <Input type="number" inputMode="numeric" min={1} max={1000} value={config.dailyLimit} onChange={(event) => update({ dailyLimit: clamp(Number(event.target.value), 1, 1000) })} />
                    </FormField>
                    <FormField id="calling-max-minutes" label="Longest call (minutes)" className="w-44">
                        <Input type="number" inputMode="numeric" min={1} max={30} value={config.maxCallMinutes} onChange={(event) => update({ maxCallMinutes: clamp(Number(event.target.value), 1, 30) })} />
                    </FormField>
                    <FormField id="calling-silence" label="Silence limit (seconds)" className="w-44" help="Then the bot asks if the caller is still there.">
                        <Input type="number" inputMode="numeric" min={4} max={30} value={config.silenceSeconds} onChange={(event) => update({ silenceSeconds: clamp(Number(event.target.value), 4, 30) })} />
                    </FormField>
                </div>
            </Section>
        </div>
    );
}

const chip = "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// New enquiries (plan §5, wave F): leads from the chosen sources are called within about a minute.
function EnquiryCalls({ config, update }: { config: VoiceBotConfig; update: (patch: Partial<VoiceBotConfig>) => void }) {
    const enquiry = config.enquiryCalls;
    const [known, setKnown] = useState<Array<{ source: string; count: number }> | null>(null);
    const [other, setOther] = useState("");
    useEffect(() => {
        apiFetch<{ sources: Array<{ source: string; count: number }> }>("/voice-bots/lead-sources").then((data) => setKnown(data.sources ?? [])).catch(() => setKnown([]));
    }, []);
    const chosen = new Set(enquiry.sources.map((source) => source.toLowerCase()));
    const setSources = (sources: string[]) => update({ enquiryCalls: { ...enquiry, sources } });
    const toggle = (source: string) => setSources(chosen.has(source.toLowerCase()) ? enquiry.sources.filter((item) => item.toLowerCase() !== source.toLowerCase()) : [...enquiry.sources, source]);
    const addOther = () => {
        const value = other.trim().slice(0, 120);
        if (value && !chosen.has(value.toLowerCase())) setSources([...enquiry.sources, value]);
        setOther("");
    };
    const unlisted = enquiry.sources.filter((source) => !(known ?? []).some((item) => item.source.toLowerCase() === source.toLowerCase()));
    return (
        <Section layout="split" id="calling-enquiries" title="New enquiries" description="New leads from the sources you choose get a call within about a minute of arriving, before other waiting calls. Outside calling hours they're called at the next opening. Imported leads aren't called.">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5">
                    <Label htmlFor="calling-enquiries-on">Call new enquiries</Label>
                    <p className="text-xs text-muted-foreground">Only while the bot is live. If two live bots choose the same source, the first by name calls.</p>
                </div>
                <Switch id="calling-enquiries-on" checked={enquiry.enabled} onCheckedChange={(enabled) => update({ enquiryCalls: { ...enquiry, enabled } })} />
            </div>
            {enquiry.enabled ? (
                <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Lead sources</legend>
                    {known === null ? <p className="text-sm text-muted-foreground" role="status">Loading sources…</p> : null}
                    {known !== null && !known.length && !unlisted.length ? <p className="text-sm text-muted-foreground">No lead has a source yet. Add the source your forms or integrations use below.</p> : null}
                    <div className="flex flex-wrap gap-1.5">
                        {(known ?? []).map((item) => {
                            const on = chosen.has(item.source.toLowerCase());
                            return (
                                <button key={item.source} type="button" aria-pressed={on} onClick={() => toggle(item.source)}
                                    className={on ? `${chip} border-primary bg-primary/10 font-medium` : `${chip} text-muted-foreground hover:bg-muted`}>
                                    {item.source}<span className="tabular-nums text-xs text-muted-foreground">{item.count.toLocaleString()}</span>
                                </button>
                            );
                        })}
                        {unlisted.map((source) => (
                            <span key={source} className={`${chip} border-primary bg-primary/10 font-medium`}>
                                {source}
                                <button type="button" aria-label={`Remove ${source}`} onClick={() => toggle(source)} className="-mr-1 rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3.5" /></button>
                            </span>
                        ))}
                    </div>
                    <form className="flex max-w-96 gap-2" onSubmit={(event) => { event.preventDefault(); addOther(); }}>
                        <Input aria-label="Another lead source" placeholder="Another source, as leads will have it" value={other} onChange={(event) => setOther(event.target.value)} maxLength={120} />
                        <Button type="submit" variant="outline" disabled={!other.trim()}><Plus className="size-4" />Add</Button>
                    </form>
                    {!enquiry.sources.length ? <p className="text-xs text-destructive">Choose at least one source, or no enquiry is called.</p> : null}
                </fieldset>
            ) : null}
        </Section>
    );
}

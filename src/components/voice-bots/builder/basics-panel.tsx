"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { VOICE_BOT_AI_OPTIONS, type VoiceBotConfig } from "@/lib/voice-bot-config";
import { Section } from "@/components/common/section";
import { FormField } from "@/components/common/form-field";
import { SelectField } from "./select-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceSelect } from "./voice-select";
import type { FieldCatalog, ProviderSettings } from "../types";

type Props = {
    name: string;
    onNameChange: (name: string) => void;
    nameError?: string | null;
    config: VoiceBotConfig;
    update: (patch: Partial<VoiceBotConfig>) => void;
    providers: ProviderSettings | null;
    catalog: FieldCatalog | null;
    opportunityTypes: Array<{ id: string; name: string }>;
};

export function BasicsPanel({ name, onNameChange, nameError, config, update, providers, catalog, opportunityTypes }: Props) {
    const claudeAvailable = !!providers?.claude.configured && (providers.claude.spentThisMonthUsd < providers.claude.monthlyCapUsd);
    const groqAvailable = !!providers?.groq.configured;
    const toggleLanguage = (language: "hi" | "en", checked: boolean) => {
        const languages = checked ? [...new Set([...config.languages, language])] : config.languages.filter((item) => item !== language);
        if (!languages.length) return;
        update({ languages, startLanguage: languages.includes(config.startLanguage) ? config.startLanguage : languages[0] });
    };
    return (
        <div>
            <Section layout="split" id="basics-name" title="Name and purpose" description="The name also labels this bot's calls on lead timelines.">
                <FormField id="bot-name" label="Name" required error={nameError}>
                    <Input value={name} maxLength={80} onChange={(event) => onNameChange(event.target.value)} />
                </FormField>
                <FormField id="bot-description" label="Purpose" help="For your team; the bot follows the Goal and Rules in Conversation.">
                    <Textarea rows={2} maxLength={500} value={config.description} onChange={(event) => update({ description: event.target.value })} />
                </FormField>
            </Section>

            <Section layout="split" id="basics-ai" title="AI" description="Which AI runs the conversation. You can switch at any time; if it fails during a call, the other one takes over without the caller noticing.">
                <RadioGroup value={config.ai} onValueChange={(ai) => update({ ai: ai as VoiceBotConfig["ai"] })} aria-label="AI for the conversation" className="grid gap-2 sm:grid-cols-2">
                    {VOICE_BOT_AI_OPTIONS.map((option) => {
                        const unavailable = option.provider === "claude" ? !claudeAvailable : !groqAvailable;
                        return (
                            <Label key={option.value} htmlFor={`ai-${option.value}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                                <RadioGroupItem id={`ai-${option.value}`} value={option.value} className="mt-0.5" />
                                <span className="min-w-0 space-y-0.5">
                                    <span className="block text-sm font-medium">{option.label}</span>
                                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                                    {unavailable ? <span className="block text-xs text-status-warning-foreground">{option.provider === "claude" ? (providers?.claude.configured ? "This month's Claude budget is used up; Groq is used until next month." : "Add a Claude key in Providers.") : "Add a Groq key in Providers."}</span> : null}
                                </span>
                            </Label>
                        );
                    })}
                </RadioGroup>
            </Section>

            <Section layout="split" id="basics-languages" title="Languages and voices" description="The bot replies in the caller's language and switches when they do, including Hinglish (decision 16).">
                <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Languages</legend>
                    <div className="flex flex-wrap gap-4">
                        {(["hi", "en"] as const).map((language) => (
                            <div key={language} className="flex items-center gap-2">
                                <Checkbox id={`language-${language}`} checked={config.languages.includes(language)} onCheckedChange={(checked) => toggleLanguage(language, checked === true)} disabled={config.languages.length === 1 && config.languages.includes(language)} />
                                <Label htmlFor={`language-${language}`} className="font-normal">{language === "hi" ? "Hindi" : "English"}</Label>
                            </div>
                        ))}
                    </div>
                </fieldset>
                {config.languages.length > 1 ? (
                    <SelectField id="bot-start-language" label="Starts in" help="The language of the opening line; the bot follows the caller after that." value={config.startLanguage} onValueChange={(startLanguage) => update({ startLanguage: startLanguage as "hi" | "en" })} triggerClassName="max-w-60">
                                <SelectItem value="hi">Hindi</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                            </SelectField>
                ) : null}
                {config.languages.map((language) => (
                    <VoiceSelect key={language} language={language} value={config.voices[language]} providers={{ google: !!providers?.google.configured, azure: !!providers?.azure.configured && !!providers.azure.region }}
                        onChange={(value) => update({ voices: { ...config.voices, [language]: value } })} />
                ))}
            </Section>

            <Section layout="split" id="basics-details" title="Caller details" description="The lead and opportunity fields this bot may see. Only these are sent to the AI, and only these can be used as {{placeholders}} (decision 31).">
                <CallerDetailsPicker catalog={catalog} value={config.callerDetails} onChange={(callerDetails) => update({ callerDetails })} />
            </Section>

            <Section layout="split" id="basics-opportunity" title="Opportunity on lead calls" description="Which opportunity's details a call started from a lead uses. A call started from an opportunity always uses that one.">
                <SelectField id="bot-opportunity-mode" label="Use" value={config.opportunityChoice.mode} onValueChange={(mode) => update({ opportunityChoice: { ...config.opportunityChoice, mode: mode as VoiceBotConfig["opportunityChoice"]["mode"] } })} triggerClassName="max-w-80">
                            <SelectItem value="LATEST_OPEN">The latest open opportunity</SelectItem>
                            <SelectItem value="LATEST_OF_TYPE">The latest of one opportunity type</SelectItem>
                            <SelectItem value="NONE">None (lead details only)</SelectItem>
                        </SelectField>
                {config.opportunityChoice.mode === "LATEST_OF_TYPE" ? (
                    <SelectField id="bot-opportunity-type" label="Opportunity type" required error={!config.opportunityChoice.typeId ? "Choose the type." : null} value={config.opportunityChoice.typeId ?? undefined} onValueChange={(typeId) => update({ opportunityChoice: { ...config.opportunityChoice, typeId } })} placeholder="Choose a type" triggerClassName="max-w-80">{opportunityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectField>
                ) : null}
            </Section>

            <Section layout="split" id="basics-recording" title="Recording" description="Transcripts and the summary are always kept on the bot's activity (decision 17).">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="space-y-0.5">
                        <Label htmlFor="bot-keep-audio">Keep call audio</Label>
                        <p className="text-xs text-muted-foreground">Stored on your server and removed after the recording retention period in Compliance &amp; Consent.</p>
                    </div>
                    <Switch id="bot-keep-audio" checked={config.keepAudio} onCheckedChange={(keepAudio) => update({ keepAudio })} />
                </div>
            </Section>
        </div>
    );
}

// Grouped checkboxes with a filter, so a workspace with many custom fields stays usable.
function CallerDetailsPicker({ catalog, value, onChange }: { catalog: FieldCatalog | null; value: string[]; onChange: (value: string[]) => void }) {
    const [filter, setFilter] = useState("");
    const groups = useMemo(() => {
        const term = filter.trim().toLowerCase();
        const map = new Map<string, Array<{ key: string; label: string }>>();
        for (const item of catalog?.callerDetails ?? []) {
            if (term && !item.label.toLowerCase().includes(term) && !item.key.toLowerCase().includes(term)) continue;
            map.set(item.group, [...(map.get(item.group) ?? []), item]);
        }
        return [...map.entries()];
    }, [catalog, filter]);
    if (!catalog) return <p className="text-sm text-muted-foreground">Loading fields…</p>;
    const toggle = (key: string, checked: boolean) => onChange(checked ? [...new Set([...value, key])] : value.filter((item) => item !== key));
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative w-full max-w-72">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a field" aria-label="Find a caller detail" className="pl-8" />
                </div>
                <span className="text-sm text-muted-foreground" aria-live="polite">{value.length} selected</span>
            </div>
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border p-3">
                {groups.length === 0 ? <p className="text-sm text-muted-foreground">No fields match.</p> : groups.map(([group, items]) => (
                    <fieldset key={group} className="space-y-2">
                        <legend className="text-xs font-medium text-muted-foreground">{group}</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {items.map((item) => (
                                <div key={item.key} className="flex min-w-0 items-center gap-2">
                                    <Checkbox id={`detail-${item.key}`} checked={value.includes(item.key)} onCheckedChange={(checked) => toggle(item.key, checked === true)} />
                                    <Label htmlFor={`detail-${item.key}`} className="min-w-0 truncate font-normal" title={`{{${item.key}}}`}>{item.label}</Label>
                                </div>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>
        </div>
    );
}

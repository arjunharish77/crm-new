"use client";

import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { MAPPING_MODES, type FieldMapping, type VoiceBotConfig } from "@/lib/voice-bot-config";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FieldCatalog, VoiceBotField } from "../types";

// Copy the bot's answers to the lead or opportunity after a call (decision 11): per mapping, fill
// only an empty field, always overwrite, or never copy. Every change is in the record history.
export function MappingPanel({ config, update, fields, catalog }: { config: VoiceBotConfig; update: (patch: Partial<VoiceBotConfig>) => void; fields: VoiceBotField[]; catalog: FieldCatalog | null }) {
    const mappings = config.mappings;
    const set = (index: number, patch: Partial<FieldMapping>) => update({ mappings: mappings.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)) });
    const groups = new Map<string, Array<{ key: string; label: string }>>();
    for (const target of catalog?.mappingTargets ?? []) groups.set(target.group, [...(groups.get(target.group) ?? []), target]);
    const add = () => {
        const unmapped = fields.find((field) => !mappings.some((mapping) => mapping.fieldKey === field.key));
        const target = catalog?.mappingTargets[0]?.key;
        if (!unmapped || !target) return;
        update({ mappings: [...mappings, { fieldKey: unmapped.key, target, mode: "IF_EMPTY" }] });
    };
    return (
        <div className="space-y-4 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">Mapping</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">After a call, copy the bot&apos;s answers to the lead or opportunity. Each change shows in the record&apos;s history as set by the voice bot.</p>
                </div>
                <Button variant="outline" onClick={add} disabled={!fields.length || mappings.length >= fields.length}><Plus className="size-4" />Add mapping</Button>
            </div>
            {!fields.length ? (
                <EmptyState variant="inline" title="Add fields first" description="Mappings copy the bot's fields; add some in the Fields tab." />
            ) : mappings.length === 0 ? (
                <EmptyState variant="inline" title="No mappings" description="Answers stay on the bot's activity only. Add a mapping to copy one to the lead or opportunity." />
            ) : (
                <ul className="space-y-2">
                    {mappings.map((mapping, index) => (
                        <li key={index} className="grid items-center gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,12rem)_auto]">
                            <Select value={mapping.fieldKey} onValueChange={(fieldKey) => set(index, { fieldKey })}>
                                <SelectTrigger className="w-full" aria-label={`Bot field for mapping ${index + 1}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{fields.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <ArrowRight className="hidden size-4 text-muted-foreground md:block" aria-hidden />
                            <Select value={mapping.target} onValueChange={(target) => set(index, { target })}>
                                <SelectTrigger className="w-full" aria-label={`Copy to, mapping ${index + 1}`}><SelectValue placeholder="Choose a field" /></SelectTrigger>
                                <SelectContent>
                                    {[...groups.entries()].map(([group, items]) => (
                                        <SelectGroup key={group}>
                                            <SelectLabel>{group}</SelectLabel>
                                            {items.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={mapping.mode} onValueChange={(mode) => set(index, { mode: mode as FieldMapping["mode"] })}>
                                <SelectTrigger className="w-full" aria-label={`When to copy, mapping ${index + 1}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{MAPPING_MODES.map((mode) => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <IconButton label={`Remove mapping ${index + 1}`} onClick={() => update({ mappings: mappings.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></IconButton>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

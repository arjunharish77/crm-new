"use client";

import React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StandardDialog } from "@/components/common/standard-dialog";

export type PickableEntity = "lead" | "opportunity" | "user";
export type PickedRecord = { id: string; label: string; detail?: string };

// A searchable picker for a lead, opportunity or user (UI/UX plan Phase 1, RecordPicker). It
// replaces plain selects that loaded only the first 100 records, and text prompts that asked
// for a raw id. Leads and opportunities are searched on the server, under the same record
// access as their lists; users are the tenant's user list, filtered as you type.

const PAGE = 20;

function toRecord(entity: PickableEntity, item: any): PickedRecord {
    if (entity === "user") return { id: item.id, label: item.name || item.email || "User", detail: item.name ? item.email : undefined };
    if (entity === "opportunity") return { id: item.id, label: item.title || "Opportunity", detail: item.lead?.name || undefined };
    return { id: item.id, label: item.name || item.email || item.company || "Lead", detail: [item.email, item.company].filter(Boolean).join(" · ") || undefined };
}

function listOf(response: any): any[] {
    return Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
}

async function search(entity: PickableEntity, term: string, signal: AbortSignal): Promise<PickedRecord[]> {
    if (entity === "user") {
        const users = listOf(await apiFetch("/users", { signal }));
        const needle = term.toLowerCase();
        return users
            .filter((user) => !needle || `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(needle))
            .slice(0, 50)
            .map((user) => toRecord(entity, user));
    }
    const fields = entity === "lead" ? ["name", "email", "company"] : ["title"];
    const params = new URLSearchParams({ page: "1", limit: String(PAGE) });
    if (term) params.set("filters", JSON.stringify([{ logic: "OR", conditions: fields.map((field) => ({ field, operator: "contains", value: term })) }]));
    const path = entity === "lead" ? "/leads" : "/opportunities";
    return listOf(await apiFetch(`${path}?${params.toString()}`, { signal })).map((item) => toRecord(entity, item));
}

async function fetchOne(entity: PickableEntity, id: string): Promise<PickedRecord | null> {
    try {
        if (entity === "user") return (await search("user", "", new AbortController().signal)).find((user) => user.id === id) ?? null;
        const item = await apiFetch(`/${entity === "lead" ? "leads" : "opportunities"}/${id}`);
        return item ? toRecord(entity, item) : null;
    } catch {
        return null;
    }
}

export function RecordPicker({
    entity,
    value,
    onChange,
    id,
    placeholder,
    disabled,
    allowClear = true,
    invalid,
    describedBy,
    className,
}: {
    entity: PickableEntity;
    value: string | null | undefined;
    onChange: (id: string | null, record: PickedRecord | null) => void;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    allowClear?: boolean;
    invalid?: boolean;
    describedBy?: string;
    className?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const [term, setTerm] = React.useState("");
    const [results, setResults] = React.useState<PickedRecord[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [failed, setFailed] = React.useState(false);
    const [selected, setSelected] = React.useState<PickedRecord | null>(null);

    // Label for an id that came from outside (initial value, or set by the parent).
    React.useEffect(() => {
        if (!value) { setSelected(null); return; }
        if (selected?.id === value) return;
        let cancelled = false;
        fetchOne(entity, value).then((record) => { if (!cancelled) setSelected(record ?? { id: value, label: "Selected record" }); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entity, value]);

    React.useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        setLoading(true);
        setFailed(false);
        const timer = window.setTimeout(() => {
            search(entity, term.trim(), controller.signal)
                .then((records) => { if (!controller.signal.aborted) setResults(records); })
                .catch(() => { if (!controller.signal.aborted) { setResults([]); setFailed(true); } })
                .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        }, term ? 250 : 0);
        return () => { controller.abort(); window.clearTimeout(timer); };
    }, [entity, open, term]);

    const noun = entity === "user" ? "user" : entity;
    const choose = (record: PickedRecord | null) => {
        setSelected(record);
        onChange(record?.id ?? null, record);
        setOpen(false);
        setTerm("");
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    disabled={disabled}
                    className={cn("w-full justify-between border-input px-3 font-normal aria-invalid:border-destructive", className)}
                >
                    <span className={cn("truncate", !selected && "text-subtle-foreground")}>{selected?.label ?? placeholder ?? `Choose a ${noun}`}</span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput value={term} onValueChange={setTerm} placeholder={`Search ${noun}s…`} />
                    <CommandList>
                        {loading ? (
                            <div role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Searching…</div>
                        ) : failed ? (
                            <div role="alert" className="px-3 py-4 text-sm text-destructive">Couldn&apos;t search {noun}s. Try again.</div>
                        ) : (
                            <CommandEmpty>No {noun}s match.</CommandEmpty>
                        )}
                        {!loading && !failed && (
                            <CommandGroup>
                                {allowClear && selected ? (
                                    <CommandItem value="__clear__" onSelect={() => choose(null)} className="text-muted-foreground">No {noun}</CommandItem>
                                ) : null}
                                {results.map((record) => (
                                    <CommandItem key={record.id} value={record.id} onSelect={() => choose(record)}>
                                        <Check className={cn("size-4 shrink-0", record.id === value ? "opacity-100" : "opacity-0")} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">{record.label}</span>
                                            {record.detail ? <span className="block truncate text-xs text-muted-foreground">{record.detail}</span> : null}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

type PickRequest = { entity: PickableEntity; title: string; description?: string; label: string; confirmLabel: string; excludeId?: string };
type PendingPick = PickRequest & { resolve: (record: PickedRecord | null) => void };

// A dialog that asks for one record, e.g. "Transfer owner" (replaces a prompt for a raw user id).
// Resolves the picked record, or null on Cancel.
export function usePickRecordDialog(): [React.ReactNode, (request: PickRequest) => Promise<PickedRecord | null>] {
    const [pending, setPending] = React.useState<PendingPick | null>(null);
    const [picked, setPicked] = React.useState<PickedRecord | null>(null);

    const ask = React.useCallback((request: PickRequest) => new Promise<PickedRecord | null>((resolve) => {
        setPicked(null);
        setPending((current) => {
            current?.resolve(null);
            return { ...request, resolve };
        });
    }), []);

    const finish = (record: PickedRecord | null) => {
        pending?.resolve(record);
        setPending(null);
    };
    const sameAsExcluded = !!picked && picked.id === pending?.excludeId;

    const element = (
        <StandardDialog
            open={!!pending}
            onClose={() => finish(null)}
            title={pending?.title ?? ""}
            subtitle={pending?.description}
            maxWidth="xs"
            actions={
                <>
                    <Button variant="outline" onClick={() => finish(null)}>Cancel</Button>
                    <Button disabled={!picked || sameAsExcluded} onClick={() => finish(picked)}>{pending?.confirmLabel}</Button>
                </>
            }
        >
            {pending ? (
                <div className="space-y-1.5 pb-1">
                    <Label htmlFor="pick-record-dialog">{pending.label}</Label>
                    <RecordPicker id="pick-record-dialog" entity={pending.entity} value={picked?.id} allowClear={false} onChange={(_, record) => setPicked(record)} />
                    {sameAsExcluded ? <p className="text-xs text-destructive">Choose someone else; this is the current owner.</p> : null}
                </div>
            ) : null}
        </StandardDialog>
    );

    return [element, ask];
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
import { Section } from "@/components/common/section";
import { FormField } from "@/components/common/form-field";
import { ErrorState } from "@/components/common/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Holiday = { id: string; date: string; label: string | null };

// Days bots don't call (decision 15). Shared by every bot that has "Skip holidays" on.
export function HolidaysPanel() {
    const [items, setItems] = useState<Holiday[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [date, setDate] = useState("");
    const [label, setLabel] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            setItems(await apiFetch<Holiday[]>("/voice-bots/holidays"));
        } catch {
            setFailed(true);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!date) { setError("Choose a date."); return; }
        setAdding(true);
        try {
            await apiFetch("/voice-bots/holidays", { method: "POST", body: JSON.stringify({ date, label }) });
            setDate(""); setLabel(""); setError(null);
            await load();
        } catch (caught: any) {
            setError(caught?.message || "The holiday couldn't be added");
        } finally {
            setAdding(false);
        }
    };

    const remove = async (holiday: Holiday) => {
        setItems((current) => current?.filter((item) => item.id !== holiday.id) ?? current);
        try {
            await apiFetch(`/voice-bots/holidays/${holiday.id}`, { method: "DELETE" });
            toast.success(`${formatWorkspaceDate(holiday.date)} removed`);
        } catch (caught: any) {
            toast.error(caught?.message || "The holiday couldn't be removed");
            load();
        }
    };

    if (failed) return <ErrorState description="The holidays couldn't be loaded." onRetry={load} />;
    return (
        <div className="max-w-4xl">
            <Section layout="split" id="holidays" title="Holidays" description="Bots don't place calls on these days. Callbacks and retries move to the next calling day. Applies to every bot with “Skip holidays” on.">
                {!items ? <Skeleton className="h-24" /> : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No holidays yet. Bots call on every day their calling hours allow.</p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {items.map((holiday) => (
                            <li key={holiday.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                    <span className="text-sm font-medium tabular-nums">{formatWorkspaceDate(holiday.date)}</span>
                                    {holiday.label ? <span className="ml-2 text-sm text-muted-foreground">{holiday.label}</span> : null}
                                </div>
                                <IconButton label={`Remove ${formatWorkspaceDate(holiday.date)}`} onClick={() => remove(holiday)}><Trash2 className="size-4" /></IconButton>
                            </li>
                        ))}
                    </ul>
                )}
                <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); add(); }}>
                    <FormField id="holiday-date" label="Date" error={error} className="w-44">
                        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </FormField>
                    <FormField id="holiday-label" label="Name (optional)" className="min-w-48 flex-1">
                        <Input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder="Diwali" />
                    </FormField>
                    <Button type="submit" variant="outline" isLoading={adding} disabled={adding}><Plus className="size-4" />Add holiday</Button>
                </form>
            </Section>
        </div>
    );
}

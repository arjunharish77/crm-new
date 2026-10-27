"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Phone } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import type { VoiceBotSummary } from "./types";

type Mode = "OWNER" | "BOT" | "OWNER_THEN_BOT";
type NumberRow = { number: string; alias: string | null; voiceEnabled: boolean; mode: Mode; botId: string | null };

const MODES: Array<{ value: Mode; label: string; description: string }> = [
    { value: "OWNER", label: "People", description: "Rings the lead owner, then the default agent (as today)" },
    { value: "BOT", label: "Bot", description: "The bot answers every call" },
    { value: "OWNER_THEN_BOT", label: "People, then bot", description: "The bot takes calls nobody answers, and every call outside the bot's calling hours" },
];

// Who answers each Plivo number (decisions 4 and 23). Each change saves itself.
export function NumbersPanel() {
    const [data, setData] = useState<{ source: string; error: string | null; numbers: NumberRow[] } | null>(null);
    const [bots, setBots] = useState<VoiceBotSummary[]>([]);
    const [failed, setFailed] = useState(false);
    const [savedNumber, setSavedNumber] = useState<string | null>(null);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const [numbers, botList] = await Promise.all([
                apiFetch<{ source: string; error: string | null; numbers: NumberRow[] }>("/voice-bots/numbers"),
                apiFetch<VoiceBotSummary[]>("/voice-bots"),
            ]);
            setData(numbers);
            setBots(botList);
        } catch {
            setFailed(true);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const save = async (row: NumberRow, patch: Partial<Pick<NumberRow, "mode" | "botId">>) => {
        const next = { ...row, ...patch };
        if (next.mode === "OWNER") next.botId = null;
        else if (!next.botId) next.botId = bots[0]?.id ?? null;
        if (next.mode !== "OWNER" && !next.botId) {
            toast.error("Create a bot first, then choose it for this number.");
            return;
        }
        setData((current) => current ? { ...current, numbers: current.numbers.map((item) => (item.number === row.number ? next : item)) } : current);
        try {
            await apiFetch(`/voice-bots/numbers/${encodeURIComponent(row.number)}`, { method: "PUT", body: JSON.stringify({ mode: next.mode, botId: next.botId }) });
            setSavedNumber(row.number);
            window.setTimeout(() => setSavedNumber((current) => (current === row.number ? null : current)), 2500);
        } catch (error: any) {
            setData((current) => current ? { ...current, numbers: current.numbers.map((item) => (item.number === row.number ? row : item)) } : current);
            toast.error(error?.message || "The change couldn't be saved");
        }
    };

    if (failed) return <ErrorState description="The numbers couldn't be loaded." onRetry={load} />;
    if (!data) return <div className="space-y-2" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
    if (!data.numbers.length) {
        return (
            <EmptyState
                icon={<Phone className="size-10 text-muted-foreground" />}
                title="No phone numbers yet"
                description="Connect Plivo in Settings › Phone system. Your Plivo numbers then appear here."
                action={<Link href="/dashboard/settings/integrations?section=phone-system" className="text-sm font-medium text-primary hover:underline">Open Phone system</Link>}
            />
        );
    }
    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose who answers calls to each number. Outbound bot calls use the number chosen in each bot&apos;s Calling settings.</p>
            {data.error || data.source !== "plivo" ? (
                <Alert variant="info"><AlertDescription>{data.error ?? "Showing the numbers saved in the CRM. Turn on the Plivo connector to list every number on your Plivo account."}</AlertDescription></Alert>
            ) : null}
            <div className="overflow-x-auto rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Number</TableHead>
                            <TableHead>Who answers</TableHead>
                            <TableHead>Bot</TableHead>
                            <TableHead className="w-20"><span className="sr-only">Saved</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.numbers.map((row) => (
                            <TableRow key={row.number}>
                                <TableCell>
                                    <span className="font-medium tabular-nums">{row.number}</span>
                                    {row.alias ? <span className="block text-xs text-muted-foreground">{row.alias}</span> : null}
                                    {!row.voiceEnabled ? <span className="block text-xs text-muted-foreground">Voice not enabled on Plivo</span> : null}
                                </TableCell>
                                <TableCell className="min-w-48">
                                    <Select value={row.mode} onValueChange={(mode) => save(row, { mode: mode as Mode })}>
                                        <SelectTrigger className="w-full" aria-label={`Who answers ${row.number}`}><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {MODES.map((mode) => (
                                                <SelectItem key={mode.value} value={mode.value}>
                                                    <div className="flex min-w-0 flex-col whitespace-normal">
                                                        <span>{mode.label}</span>
                                                        <span className="text-xs text-muted-foreground">{mode.description}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell className="min-w-48">
                                    {row.mode === "OWNER" ? <span className="text-sm text-muted-foreground">—</span> : (
                                        <Select value={row.botId ?? undefined} onValueChange={(botId) => save(row, { botId })}>
                                            <SelectTrigger className="w-full" aria-label={`Bot for ${row.number}`}><SelectValue placeholder="Choose a bot" /></SelectTrigger>
                                            <SelectContent>{bots.map((bot) => <SelectItem key={bot.id} value={bot.id}>{bot.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    )}
                                </TableCell>
                                <TableCell aria-live="polite">
                                    {savedNumber === row.number ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3.5" aria-hidden />Saved</span> : null}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

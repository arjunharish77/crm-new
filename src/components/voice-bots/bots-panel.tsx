"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { VOICE_BOT_AI_OPTIONS } from "@/lib/voice-bot-config";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { BOT_STATUS, type VoiceBotSummary } from "./types";

const aiLabel = (value: string) => VOICE_BOT_AI_OPTIONS.find((option) => option.value === value)?.label ?? value;
const languagesLabel = (languages: string[]) => languages.map((language) => (language === "hi" ? "Hindi" : "English")).join(", ");

// The list of bots (UI/UX plan list template): name, status, AI, languages, numbers it answers.
export function BotsPanel({ onCreate }: { onCreate: () => void }) {
    const [bots, setBots] = useState<VoiceBotSummary[] | null>(null);
    const [failed, setFailed] = useState(false);
    const load = useCallback(async () => {
        setFailed(false);
        try {
            setBots(await apiFetch<VoiceBotSummary[]>("/voice-bots"));
        } catch {
            setFailed(true);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (failed) return <ErrorState description="The voice bots couldn't be loaded." onRetry={load} />;
    if (!bots) return <div className="space-y-2" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
    return (
        <div className="space-y-4">
            {bots.length === 0 ? (
                <EmptyState
                    icon={<Bot className="size-10 text-muted-foreground" />}
                    title="No voice bots yet"
                    description="Create a bot, describe what it should do, and Claude can draft its conversation and fields for you."
                    action={<Button onClick={onCreate}><Plus className="size-4" />Create bot</Button>}
                />
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden md:table-cell">AI</TableHead>
                                <TableHead className="hidden md:table-cell">Languages</TableHead>
                                <TableHead className="hidden text-right sm:table-cell">Numbers</TableHead>
                                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bots.map((bot) => (
                                <TableRow key={bot.id}>
                                    <TableCell className="max-w-72">
                                        <Link href={`/dashboard/voice-bots/${bot.id}`} className="block truncate font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                            {bot.name}
                                        </Link>
                                        {bot.config.description ? <span className="block truncate text-xs text-muted-foreground">{bot.config.description}</span> : null}
                                    </TableCell>
                                    <TableCell><StatusBadge tone={BOT_STATUS[bot.status].tone} label={BOT_STATUS[bot.status].label} /></TableCell>
                                    <TableCell className="hidden text-muted-foreground md:table-cell">{aiLabel(bot.config.ai)}</TableCell>
                                    <TableCell className="hidden text-muted-foreground md:table-cell">{languagesLabel(bot.config.languages)}</TableCell>
                                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{bot.numberCount}</TableCell>
                                    <TableCell className="hidden text-muted-foreground lg:table-cell">{formatWorkspaceRelativeTime(bot.updatedAt)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            <ArchivedBots onRestored={load} />
        </div>
    );
}

// Archived bots, collapsed until opened, with Restore (decision 31 pattern).
function ArchivedBots({ onRestored }: { onRestored: () => void }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<VoiceBotSummary[]>([]);
    const [restoring, setRestoring] = useState<string | null>(null);
    const load = useCallback(() => {
        apiFetch<VoiceBotSummary[]>("/voice-bots?archived=1").then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch(() => setItems([]));
    }, []);
    useEffect(() => { load(); }, [load]);
    if (!items.length) return null;
    const restore = async (bot: VoiceBotSummary) => {
        setRestoring(bot.id);
        try {
            await apiFetch(`/voice-bots/${bot.id}/restore`, { method: "POST" });
            toast.success(`${bot.name} restored as a draft`);
            load();
            onRestored();
        } catch (error: any) {
            toast.error(error?.message || "The bot couldn't be restored");
        } finally {
            setRestoring(null);
        }
    };
    return (
        <section className="rounded-lg border">
            <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                Archived ({items.length})
                <span className="font-normal text-muted-foreground">Archived bots take no calls; their past calls stay on records</span>
            </button>
            {open ? (
                <ul className="divide-y border-t">
                    {items.map((bot) => (
                        <li key={bot.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <span className="min-w-0 truncate text-sm">{bot.name}</span>
                            <Button variant="outline" size="sm" onClick={() => restore(bot)} isLoading={restoring === bot.id} disabled={!!restoring}>Restore</Button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}

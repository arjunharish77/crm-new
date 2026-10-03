"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
import { useArchiveActions } from "@/hooks/use-archive-actions";

type ArchivedItem = { id: string; name: string | null; deletedAt: string; deletedByName: string | null; purgeAfter: string | null; inUse: boolean };

// The "Archived" list under a screen's items (decision 31): what this person may restore, when
// each item will be removed for good, Restore, and Delete for good (typing the name). Collapsed
// until opened; it reloads when `refreshToken` changes (after an archive) and calls `onChange`
// after a restore so the screen reloads its own list.
export function ArchivedItemsSection({ kind, basePath, noun, title = "Archived", refreshToken, onChange }: {
    kind: string;
    basePath: string;
    noun: string;
    title?: string;
    refreshToken?: unknown;
    onChange: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<ArchivedItem[] | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const data = await apiFetch<ArchivedItem[]>(`/archive/${kind}`);
            setItems(Array.isArray(data) ? data : []);
        } catch {
            setFailed(true);
        }
    }, [kind]);

    useEffect(() => {
        load();
    }, [load, refreshToken]);

    const { restore, deletePermanently } = useArchiveActions({
        basePath,
        archiveKind: kind,
        noun,
        onChange: () => {
            load();
            onChange();
        },
    });

    if (!failed && (!items || items.length === 0)) return null;
    const label = items ? `${title} (${items.length})` : title;
    return (
        <section className="rounded-lg border">
            <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-accent/50">
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                {label}
                <span className="font-normal text-muted-foreground">Restore within 30 days of archiving</span>
            </button>
            {open ? (
                failed ? (
                    <div role="alert" className="flex flex-wrap items-center gap-2 border-t p-3 text-sm">The archived {noun}s couldn&apos;t be loaded. <Button variant="outline" size="sm" onClick={load}>Try again</Button></div>
                ) : (
                    <ul className="divide-y border-t">
                        {(items ?? []).map((item) => {
                            const name = item.name || `Untitled ${noun}`;
                            return (
                                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                    <div className="min-w-0 flex-1 basis-60">
                                        <p className="break-words text-sm font-medium">{name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Archived {formatWorkspaceDate(item.deletedAt)}{item.deletedByName ? ` by ${item.deletedByName}` : ""} ·{" "}
                                            {item.inUse ? "kept, because past payouts or points refer to it" : `deleted for good on ${item.purgeAfter ? formatWorkspaceDate(item.purgeAfter) : "—"}`}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        <Button size="sm" variant="outline" onClick={() => restore({ id: item.id, name })}>Restore</Button>
                                        {!item.inUse ? <Button size="sm" variant="ghost" onClick={() => deletePermanently({ id: item.id, name })}>Delete for good</Button> : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )
            ) : null}
        </section>
    );
}

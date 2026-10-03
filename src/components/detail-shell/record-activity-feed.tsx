"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Activity, ActivityType } from "@/types/activities";
import { Timeline, type TimelineNote } from "@/components/timeline/timeline";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE = 25;
type Range = "all" | "7d" | "30d" | "90d";
const RANGE_LABEL: Record<Range, string> = { all: "Any time", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };

// A record's activity feed (UI/UX plan §10.5): type chips (All, each activity type, Notes) and a
// date menu with no surrounding card, then the compact timeline 25 items at a time with "Load
// older". Filtering and paging happen on the server, so nothing beyond the loaded page is
// silently left out.
export function RecordActivityFeed({ entityType, entityId, refreshKey = 0 }: {
    entityType: "lead" | "opportunity";
    entityId: string;
    refreshKey?: number;
}) {
    const [types, setTypes] = useState<ActivityType[]>([]);
    const [kind, setKind] = useState<string>("all");
    const [range, setRange] = useState<Range>("all");
    const [activities, setActivities] = useState<Activity[]>([]);
    const [notes, setNotes] = useState<TimelineNote[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        apiFetch<ActivityType[]>("/activity-types").then((rows) => setTypes(Array.isArray(rows) ? rows.filter((type: any) => type.isActive !== false) : [])).catch(() => setTypes([]));
    }, []);

    const filtersFor = useCallback(() => {
        const conditions: any[] = [{ field: entityType === "lead" ? "leadId" : "opportunityId", operator: "equals", value: entityId }];
        if (kind !== "all" && kind !== "notes") conditions.push({ field: "typeId", operator: "equals", value: kind });
        if (range !== "all") {
            const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
            const from = new Date(Date.now() - days * 86_400_000);
            conditions.push({ field: "createdAt", operator: "after", value: new Date(from.getTime() - 86_400_000).toISOString().slice(0, 10) });
        }
        return [{ logic: "AND", conditions }];
    }, [entityType, entityId, kind, range]);

    const fetchPage = useCallback(async (pageNumber: number) => {
        const params = new URLSearchParams({ limit: String(PAGE), page: String(pageNumber), filters: JSON.stringify(filtersFor()) });
        const response: any = await apiFetch(`/activities?${params.toString()}`);
        const rows: Activity[] = Array.isArray(response) ? response : response?.data ?? [];
        const lastPage = Number(response?.meta?.last_page ?? 1);
        return { rows, more: pageNumber < lastPage };
    }, [filtersFor]);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const [first, noteRows] = await Promise.all([
                kind === "notes" ? Promise.resolve({ rows: [] as Activity[], more: false }) : fetchPage(1),
                kind === "all" || kind === "notes" ? apiFetch<any[]>(`/notes?entityType=${entityType}&entityId=${entityId}`).catch(() => []) : Promise.resolve([]),
            ]);
            setActivities(first.rows);
            setHasMore(first.more);
            setPage(1);
            const cutoff = range === "all" ? 0 : Date.now() - (range === "7d" ? 7 : range === "30d" ? 30 : 90) * 86_400_000;
            setNotes((Array.isArray(noteRows) ? noteRows : []).filter((note: any) => new Date(note.createdAt).getTime() >= cutoff));
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [entityType, entityId, kind, range, fetchPage]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const loadOlder = async () => {
        setLoadingMore(true);
        try {
            const next = await fetchPage(page + 1);
            setActivities((current) => [...current, ...next.rows.filter((row) => !current.some((item) => item.id === row.id))]);
            setHasMore(next.more);
            setPage(page + 1);
        } finally {
            setLoadingMore(false);
        }
    };

    const chips = [{ value: "all", label: "All" }, ...types.map((type) => ({ value: type.id, label: type.name })), { value: "notes", label: "Notes" }];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="radiogroup" aria-label="Show" className="flex min-w-0 max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
                    {chips.map((chip) => (
                        <button
                            key={chip.value}
                            type="button"
                            role="radio"
                            aria-checked={kind === chip.value}
                            onClick={() => setKind(chip.value)}
                            className={cn(
                                "h-7 shrink-0 rounded-full border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                kind === chip.value ? "border-transparent bg-selected text-primary" : "border-border-strong text-muted-foreground hover:bg-muted",
                            )}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
                <Select value={range} onValueChange={(value) => setRange(value as Range)}>
                    <SelectTrigger size="sm" aria-label="Date range" className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(RANGE_LABEL) as Range[]).map((option) => <SelectItem key={option} value={option}>{RANGE_LABEL[option]}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            {loading ? (
                <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14" />)}</div>
            ) : failed ? (
                <ErrorState variant="inline" description="Activity couldn't be loaded." onRetry={load} />
            ) : (
                <>
                    <Timeline
                        activities={activities}
                        notes={notes}
                        context={entityType === "lead" ? { leadId: entityId } : { opportunityId: entityId }}
                        emptyMessage={kind === "all" && range === "all" ? undefined : "Nothing matches this filter."}
                    />
                    {hasMore ? (
                        <div className="text-center">
                            <Button variant="outline" size="sm" isLoading={loadingMore} onClick={loadOlder}>Load older activity</Button>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}

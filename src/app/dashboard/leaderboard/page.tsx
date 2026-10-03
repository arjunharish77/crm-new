"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { useFeature } from "@/components/auth/feature-gate";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { SegmentedControl } from "@/components/common/page-tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUrlState } from "@/hooks/use-url-state";
import { formatCount } from "@/lib/display/format";
import { cn } from "@/lib/utils";

type LeaderboardRow = {
    userId?: string;
    teamId?: string;
    name?: string;
    teamName?: string;
    email?: string | null;
    points: number;
};

const RANGES = ["7", "30", "90", "all"] as const;
const RANGE_LABEL: Record<(typeof RANGES)[number], string> = { "7": "7 days", "30": "30 days", "90": "90 days", all: "All time" };
const SCOPES = ["INDIVIDUAL", "TEAM"] as const;
// The top three get a trophy in these colours (with the rank as text too).
const TROPHY_TONE = ["text-amber-500", "text-slate-400", "text-orange-700"];

// Insights › Leaderboard (UI/UX plan §5.17): rank as text ("#1"), not only a medal; your own row
// marked "You"; a load error shows an error, not "no points yet".
export default function LeaderboardPage() {
    const { user } = useAuth();
    const gamificationEnabled = useFeature("gamificationEnabled");
    const [scope, setScope] = useUrlState<(typeof SCOPES)[number]>("scope", "INDIVIDUAL", { allowed: SCOPES });
    const [range, setRange] = useUrlState<(typeof RANGES)[number]>("range", "30", { allowed: RANGES });
    const [rows, setRows] = useState<LeaderboardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({ scope });
            if (range !== "all") {
                const from = new Date();
                from.setDate(from.getDate() - Number(range));
                params.set("from", from.toISOString());
            }
            const data = await apiFetch<LeaderboardRow[]>(`/gamification/leaderboard?${params.toString()}`);
            setRows(Array.isArray(data) ? data : []);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [scope, range]);
    useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

    if (!gamificationEnabled) {
        return <EmptyState title="Gamification isn't turned on" description="Ask an admin to turn on the Gamification module." />;
    }

    const isMine = (row: LeaderboardRow) => (scope === "INDIVIDUAL" ? row.userId === user?.id : !!row.teamId && row.teamId === (user as any)?.teamId);

    return (
        <div className="mx-auto min-w-0 max-w-[900px]">
            <PageHeader
                title="Leaderboard"
                description="Ranked by points earned."
                secondaryActions={<Button variant="outline" asChild><Link href="/dashboard/my-points">My points</Link></Button>}
            />
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SegmentedControl label="Rank" value={scope} onChange={setScope} options={[{ value: "INDIVIDUAL", label: "People" }, { value: "TEAM", label: "Teams" }]} />
                <SegmentedControl label="Period" value={range} onChange={setRange} options={RANGES.map((value) => ({ value, label: RANGE_LABEL[value] }))} />
            </div>

            {loading ? (
                <TableSkeleton rows={6} columns={2} />
            ) : failed ? (
                <ErrorState description="The leaderboard couldn't be loaded." onRetry={fetchLeaderboard} />
            ) : rows.length === 0 ? (
                <EmptyState icon={<Trophy />} title="No points yet in this period" description="Rankings appear once points are awarded. Try a longer period." />
            ) : (
                <ol className="divide-y rounded-xl border bg-card">
                    {rows.map((row, index) => {
                        const mine = isMine(row);
                        const name = scope === "INDIVIDUAL" ? row.name : row.teamName;
                        return (
                            <li key={row.userId ?? row.teamId ?? index} className={cn("flex items-center gap-3 px-3 py-2.5", mine && "bg-selected")} aria-current={mine ? "true" : undefined}>
                                <span className="flex w-12 shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
                                    {index < 3 ? <Trophy className={cn("size-4", TROPHY_TONE[index])} aria-hidden /> : null}
                                    #{index + 1}
                                </span>
                                {scope === "INDIVIDUAL" ? (
                                    <Avatar className="size-8 shrink-0"><AvatarFallback className="bg-muted text-sm font-medium">{(name || "?").charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                                ) : null}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium">{name || "Unknown"}</span>
                                        {mine ? <Badge tone="info">You</Badge> : null}
                                    </div>
                                    {row.email ? <div className="truncate text-xs text-muted-foreground">{row.email}</div> : null}
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCount(row.points)} pts</span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}

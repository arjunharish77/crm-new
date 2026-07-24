"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem, cardHover, fadeInUp } from "@/lib/motion";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";

type LeaderboardRow = {
    userId?: string;
    teamId?: string;
    name?: string;
    teamName?: string;
    email?: string | null;
    points: number;
};

const RANGE_OPTIONS = [
    { value: "7", label: "7 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "all", label: "All time" },
];

const SCOPE_OPTIONS: { value: "INDIVIDUAL" | "TEAM"; label: string }[] = [
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "TEAM", label: "Team" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div className="inline-flex items-center rounded-md border p-0.5">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "rounded-[4px] px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        value === option.value
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default function LeaderboardPage() {
    const [scope, setScope] = useState<"INDIVIDUAL" | "TEAM">("INDIVIDUAL");
    const [range, setRange] = useState("30");
    const [rows, setRows] = useState<LeaderboardRow[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
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
            toast.error("Failed to load leaderboard");
        } finally {
            setLoading(false);
        }
    }, [scope, range]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-[900px] p-4 md:p-6"
        >
            <h1 className="text-lg font-extrabold tracking-tight">Leaderboard</h1>
            <p className="mt-1 text-xs text-muted-foreground">Ranked by gamification points earned.</p>

            <div className="mt-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
                <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
            </div>

            {loading ? (
                <TableSkeleton rows={6} columns={2} />
            ) : rows.length === 0 ? (
                <EmptyState title="No points earned yet" description="Rankings appear here once gamification rules start awarding points." />
            ) : (
                <motion.div variants={staggerContainer} initial="initial" animate="animate">
                    <AnimatePresence>
                        <div className="space-y-2.5">
                            {rows.map((row, index) => (
                                <motion.div key={row.userId ?? row.teamId} variants={staggerItem}>
                                    <motion.div variants={cardHover} initial="rest" whileHover="hover" animate="rest">
                                        <div
                                            className={cn(
                                                "rounded-[14px] border p-3.5",
                                                index < 3 ? "border-amber-400/40 bg-amber-400/[0.06]" : "border-border bg-card"
                                            )}
                                        >
                                            <div className="flex items-center gap-4">
                                                <span
                                                    className={cn(
                                                        "w-8 text-center font-bold text-muted-foreground",
                                                        index < 3 ? "text-[1.3rem]" : "text-sm"
                                                    )}
                                                >
                                                    {index < 3 ? MEDALS[index] : `#${index + 1}`}
                                                </span>
                                                {scope === "INDIVIDUAL" && (
                                                    <Avatar className="size-[34px] bg-primary/10 text-[0.85rem] font-bold text-primary">
                                                        <AvatarFallback>{(row.name || "?").charAt(0).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-bold">
                                                        {scope === "INDIVIDUAL" ? row.name : row.teamName}
                                                    </div>
                                                    {row.email && (
                                                        <div className="truncate text-xs text-muted-foreground">{row.email}</div>
                                                    )}
                                                </div>
                                                <span className={cn("text-base font-extrabold", index < 3 ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                                                    {row.points.toLocaleString()} pts
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            ))}
                        </div>
                    </AnimatePresence>
                </motion.div>
            )}
        </motion.div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem, fadeInUp, spring } from "@/lib/motion";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";

type LedgerEntry = {
    id: string;
    points: number;
    entryType: string;
    triggerEvent: string | null;
    createdAt: string;
};

type UserBadgeRow = {
    id: string;
    earnedAt: string;
    Badge: { name: string; description: string | null; iconEmoji: string } | null;
};

type RewardCatalogItem = {
    key?: string;
    name: string;
    pointsCost: number;
    rewardType: "MONETARY" | "THIRD_PARTY_REWARD" | "INTERNAL_PERK";
    monetaryAmount?: number | null;
    thirdPartyProvider?: string | null;
    isActive?: boolean;
};

type Redemption = {
    id: string;
    rewardName: string | null;
    redemptionType: string;
    pointsRedeemed: number;
    status: "REQUESTED" | "FULFILLED" | "FAILED";
    failureReason: string | null;
    createdAt: string;
};

export default function MyPointsPage() {
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [balance, setBalance] = useState(0);
    const [badges, setBadges] = useState<UserBadgeRow[]>([]);
    const [rewards, setRewards] = useState<RewardCatalogItem[]>([]);
    const [redemptions, setRedemptions] = useState<Redemption[]>([]);
    const [redeemingKey, setRedeemingKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAll = () => {
        setLoading(true);
        Promise.all([
            apiFetch<{ ledger: LedgerEntry[]; balance: number }>("/gamification/me/points").catch(() => ({ ledger: [], balance: 0 })),
            apiFetch<UserBadgeRow[]>("/gamification/me/badges").catch(() => []),
            apiFetch<RewardCatalogItem[]>("/gamification/rewards").catch(() => []),
            apiFetch<Redemption[]>("/gamification/me/redemptions").catch(() => []),
        ])
            .then(([pointsData, badgesData, settingsData, redemptionsData]) => {
                setLedger(pointsData.ledger ?? []);
                setBalance(pointsData.balance ?? 0);
                setBadges(Array.isArray(badgesData) ? badgesData : []);
                setRewards(Array.isArray(settingsData) ? settingsData.filter((reward) => reward.isActive !== false) : []);
                setRedemptions(Array.isArray(redemptionsData) ? redemptionsData : []);
            })
            .catch(() => toast.error("Failed to load points"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const handleRedeem = async (reward: RewardCatalogItem, index: number) => {
        const catalogItemKey = reward.key || `${reward.rewardType}:${reward.name}:${index}`;
        setRedeemingKey(catalogItemKey);
        try {
            await apiFetch("/gamification/me/redemptions", {
                method: "POST",
                body: JSON.stringify({
                    catalogItemKey,
                    rewardName: reward.name,
                    redemptionType: reward.rewardType,
                    notes: "",
                }),
            });
            toast.success("Redemption requested");
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to request redemption");
        } finally {
            setRedeemingKey(null);
        }
    };

    return (
        <motion.div variants={fadeInUp} initial="initial" animate="animate" className="mx-auto max-w-[1000px] p-4 md:p-6">
            <h1 className="text-lg font-extrabold tracking-tight">My Points</h1>
            <p className="mt-1 text-xs text-muted-foreground">Your gamification points and earned badges.</p>

            {loading ? (
                <TableSkeleton rows={4} columns={2} />
            ) : (
                <>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1, transition: spring.expressive }}
                        className="mt-5 rounded-[18px] border bg-gradient-to-br from-amber-400/12 to-primary/6 p-6 text-center"
                    >
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Points</p>
                        <p className="mt-1 text-3xl font-extrabold">{balance.toLocaleString()}</p>
                    </motion.div>

                    <h2 className="mt-6 mb-3 text-sm font-bold">Reward Catalog</h2>
                    {rewards.length === 0 ? (
                        <EmptyState title="No rewards configured" description="Rewards appear here once an admin adds them." />
                    ) : (
                        <div className="grid gap-3 md:grid-cols-3">
                            {rewards.map((reward, index) => {
                                const catalogItemKey = reward.key || `${reward.rewardType}:${reward.name}:${index}`;
                                const canRedeem = balance >= Number(reward.pointsCost ?? 0);
                                return (
                                    <div key={catalogItemKey} className="rounded-xl border bg-card p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold">{reward.name}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">{reward.rewardType.replaceAll("_", " ")}</p>
                                            </div>
                                            <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                                                {Number(reward.pointsCost).toLocaleString()} pts
                                            </Badge>
                                        </div>
                                        {reward.monetaryAmount ? (
                                            <p className="mt-2 text-xs text-muted-foreground">Value: ₹{Number(reward.monetaryAmount).toLocaleString()}</p>
                                        ) : null}
                                        {reward.thirdPartyProvider ? (
                                            <p className="mt-2 text-xs text-muted-foreground">Provider: {reward.thirdPartyProvider}</p>
                                        ) : null}
                                        <Button
                                            className="mt-4 w-full"
                                            size="sm"
                                            variant={canRedeem ? "default" : "outline"}
                                            disabled={!canRedeem || redeemingKey === catalogItemKey}
                                            onClick={() => handleRedeem(reward, index)}
                                        >
                                            {redeemingKey === catalogItemKey ? "Requesting..." : canRedeem ? "Redeem" : "Not enough points"}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <h2 className="mt-6 mb-3 text-sm font-bold">Redemption History</h2>
                    {redemptions.length === 0 ? (
                        <EmptyState title="No redemptions yet" description="Requested rewards and fulfillment status appear here." />
                    ) : (
                        <div className="space-y-2">
                            {redemptions.slice(0, 10).map((redemption) => (
                                <div key={redemption.id} className="rounded-xl border bg-card p-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold">{redemption.rewardName ?? redemption.redemptionType}</p>
                                            <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(redemption.createdAt)}</p>
                                            {redemption.failureReason ? (
                                                <p className="text-xs text-destructive">{redemption.failureReason}</p>
                                            ) : null}
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                                                {redemption.status}
                                            </Badge>
                                            <p className="mt-1 text-xs font-bold text-destructive">-{redemption.pointsRedeemed} pts</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <h2 className="mt-6 mb-3 text-sm font-bold">Badges Earned</h2>
                    {badges.length === 0 ? (
                        <EmptyState title="No badges yet" description="Badges appear here once you meet a milestone." />
                    ) : (
                        <motion.div variants={staggerContainer} initial="initial" animate="animate">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {badges.map((userBadge) => (
                                    <motion.div key={userBadge.id} variants={staggerItem}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4 text-center">
                                                    <p className="text-[2rem] leading-none">{userBadge.Badge?.iconEmoji ?? "🏆"}</p>
                                                    <p className="mt-1 text-sm font-bold">{userBadge.Badge?.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatWorkspaceDateTime(userBadge.earnedAt)}
                                                    </p>
                                                </div>
                                            </TooltipTrigger>
                                            {userBadge.Badge?.description && (
                                                <TooltipContent>{userBadge.Badge.description}</TooltipContent>
                                            )}
                                        </Tooltip>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    <h2 className="mt-6 mb-3 text-sm font-bold">Recent Activity</h2>
                    {ledger.length === 0 ? (
                        <EmptyState title="No points earned yet" description="Points appear here as you work leads and opportunities." />
                    ) : (
                        <div className="space-y-2">
                            {ledger.slice(0, 20).map((entry) => (
                                <div key={entry.id} className="rounded-xl border bg-card p-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold">{entry.triggerEvent ?? entry.entryType}</p>
                                            <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(entry.createdAt)}</p>
                                        </div>
                                        <span className={cn("text-sm font-bold", entry.points < 0 ? "text-destructive" : "text-primary")}>
                                            {entry.points > 0 ? "+" : ""}{entry.points}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </motion.div>
    );
}

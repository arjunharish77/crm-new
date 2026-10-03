"use client";

import { useConfirm } from "@/components/common/dialogs-provider";
import { ErrorState } from "@/components/common/error-state";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { Award } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { humanizeEnum } from "@/lib/display/status";
import { useFeature } from "@/components/auth/feature-gate";

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

const REDEMPTION_STATUS: Record<Redemption["status"], { label: string; tone: "warning" | "success" | "danger" }> = {
    REQUESTED: { label: "Waiting for an admin", tone: "warning" },
    FULFILLED: { label: "Fulfilled", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
};
const LEDGER_LABEL: Record<string, string> = {
    REDEEMED: "Reward redeemed",
    REDEMPTION_FAILED_REFUND: "Refund for a declined reward",
    MANUAL_ADJUSTMENT: "Adjusted by an admin",
    EARNED: "Points earned",
};
const REWARD_TYPE_LABEL: Record<RewardCatalogItem["rewardType"], string> = {
    MONETARY: "Cash",
    THIRD_PARTY_REWARD: "Gift card or voucher",
    INTERNAL_PERK: "Perk",
};

// Insights › My points (UI/UX plan §5.17): a load error shows an error, never a balance of 0;
// redeeming confirms the cost first; with nothing to show yet, one empty state, not five.
export default function MyPointsPage() {
    const gamificationEnabled = useFeature("gamificationEnabled");
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [balance, setBalance] = useState(0);
    const [badges, setBadges] = useState<UserBadgeRow[]>([]);
    const [rewards, setRewards] = useState<RewardCatalogItem[]>([]);
    const [redemptions, setRedemptions] = useState<Redemption[]>([]);
    const [redeemingKey, setRedeemingKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // The balance couldn't be loaded: show an error, not a balance of 0 (UI/UX plan §5.17).
    const [pointsFailed, setPointsFailed] = useState(false);
    const confirm = useConfirm();

    const fetchAll = () => {
        setLoading(true);
        setPointsFailed(false);
        Promise.all([
            apiFetch<{ ledger: LedgerEntry[]; balance: number }>("/gamification/me/points").catch(() => { setPointsFailed(true); return { ledger: [], balance: 0 }; }),
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
            .catch(() => setPointsFailed(true))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const handleRedeem = async (reward: RewardCatalogItem, index: number) => {
        const cost = Number(reward.pointsCost ?? 0);
        const ok = await confirm({
            title: `Redeem ${reward.name}?`,
            description: `It costs ${cost.toLocaleString()} points, leaving you ${(balance - cost).toLocaleString()}. The points are taken now and given back if an admin turns the request down.`,
            confirmLabel: `Redeem for ${cost.toLocaleString()} points`,
        });
        if (!ok) return;
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
            toast.success(`${reward.name} requested`);
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to request redemption");
        } finally {
            setRedeemingKey(null);
        }
    };

    if (!gamificationEnabled) {
        return <EmptyState title="Gamification isn't turned on" description="Ask an admin to turn on the Gamification module." />;
    }

    const nothingYet = rewards.length === 0 && redemptions.length === 0 && badges.length === 0 && ledger.length === 0;

    return (
        <div className="mx-auto min-w-0 max-w-[1000px]">
            <PageHeader
                title="My points"
                description="Points you've earned, rewards you can redeem, and badges."
                secondaryActions={<Button variant="outline" asChild><Link href="/dashboard/leaderboard">Leaderboard</Link></Button>}
            />

            {loading ? (
                <TableSkeleton rows={4} columns={2} hasToolbar={false} />
            ) : pointsFailed ? (
                <ErrorState description="Your points couldn't be loaded." onRetry={fetchAll} />
            ) : (
                <div className="space-y-6">
                    <div className="rounded-xl border bg-card p-5">
                        <p className="text-sm text-muted-foreground">Your balance</p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums">{balance.toLocaleString()} <span className="text-base font-normal text-muted-foreground">points</span></p>
                    </div>

                    {nothingYet ? (
                        <EmptyState icon={<Award />} title="Nothing here yet" description="Points, badges and rewards appear here as you work leads and opportunities and an admin sets up rewards." />
                    ) : null}

                    {rewards.length > 0 ? (
                        <section aria-labelledby="rewards-heading">
                            <h2 id="rewards-heading" className="mb-3 text-sm font-semibold">Rewards</h2>
                            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                                {rewards.map((reward, index) => {
                                    const catalogItemKey = reward.key || `${reward.rewardType}:${reward.name}:${index}`;
                                    const cost = Number(reward.pointsCost ?? 0);
                                    const canRedeem = balance >= cost;
                                    return (
                                        <div key={catalogItemKey} className="flex flex-col rounded-xl border bg-card p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="break-words text-sm font-semibold">{reward.name}</p>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">{REWARD_TYPE_LABEL[reward.rewardType] ?? reward.rewardType}</p>
                                                </div>
                                                <Badge tone="neutral" className="shrink-0 tabular-nums">{cost.toLocaleString()} pts</Badge>
                                            </div>
                                            {reward.monetaryAmount ? <p className="mt-2 text-xs text-muted-foreground">Value: ₹{Number(reward.monetaryAmount).toLocaleString()}</p> : null}
                                            {reward.thirdPartyProvider ? <p className="mt-1 text-xs text-muted-foreground">From {reward.thirdPartyProvider}</p> : null}
                                            <div className="mt-auto pt-4">
                                                <Button
                                                    className="w-full"
                                                    size="sm"
                                                    variant={canRedeem ? "default" : "outline"}
                                                    disabled={!canRedeem}
                                                    isLoading={redeemingKey === catalogItemKey}
                                                    onClick={() => handleRedeem(reward, index)}
                                                >
                                                    {canRedeem ? "Redeem" : `${(cost - balance).toLocaleString()} more points needed`}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ) : null}

                    {redemptions.length > 0 ? (
                        <section aria-labelledby="redemptions-heading">
                            <h2 id="redemptions-heading" className="mb-3 text-sm font-semibold">Your redemptions</h2>
                            <ul className="divide-y rounded-xl border bg-card">
                                {redemptions.slice(0, 10).map((redemption) => {
                                    const status = REDEMPTION_STATUS[redemption.status];
                                    return (
                                        <li key={redemption.id} className="flex items-center justify-between gap-4 p-3">
                                            <div className="min-w-0">
                                                <p className="break-words text-sm font-medium">{redemption.rewardName ?? redemption.redemptionType}</p>
                                                <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(redemption.createdAt)}</p>
                                                {redemption.failureReason ? <p className="text-xs text-destructive">{redemption.failureReason}</p> : null}
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <Badge tone={status?.tone ?? "neutral"}>{status?.label ?? redemption.status}</Badge>
                                                <p className="mt-1 text-xs tabular-nums text-muted-foreground">−{redemption.pointsRedeemed.toLocaleString()} pts</p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ) : null}

                    {badges.length > 0 ? (
                        <section aria-labelledby="badges-heading">
                            <h2 id="badges-heading" className="mb-3 text-sm font-semibold">Badges</h2>
                            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {badges.map((userBadge) => (
                                    <li key={userBadge.id}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div tabIndex={userBadge.Badge?.description ? 0 : undefined} className="rounded-xl border bg-card p-4 text-center">
                                                    <p className="text-3xl leading-none" aria-hidden>{userBadge.Badge?.iconEmoji ?? "🏆"}</p>
                                                    <p className="mt-2 break-words text-sm font-medium">{userBadge.Badge?.name}</p>
                                                    <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(userBadge.earnedAt)}</p>
                                                </div>
                                            </TooltipTrigger>
                                            {userBadge.Badge?.description ? <TooltipContent>{userBadge.Badge.description}</TooltipContent> : null}
                                        </Tooltip>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {ledger.length > 0 ? (
                        <section aria-labelledby="ledger-heading">
                            <h2 id="ledger-heading" className="mb-3 text-sm font-semibold">Recent points</h2>
                            <ul className="divide-y rounded-xl border bg-card">
                                {ledger.slice(0, 20).map((entry) => (
                                    <li key={entry.id} className="flex items-center justify-between gap-4 p-3">
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-medium">{LEDGER_LABEL[entry.triggerEvent ?? ""] ?? LEDGER_LABEL[entry.entryType] ?? humanizeEnum(entry.triggerEvent ?? entry.entryType)}</p>
                                            <p className="text-xs text-muted-foreground">{formatWorkspaceDateTime(entry.createdAt)}</p>
                                        </div>
                                        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", entry.points < 0 ? "text-destructive" : "text-status-success-foreground")}>
                                            {entry.points > 0 ? "+" : entry.points < 0 ? "−" : ""}{Math.abs(entry.points).toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}
                </div>
            )}
        </div>
    );
}

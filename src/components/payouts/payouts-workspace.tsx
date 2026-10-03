"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Gift, Inbox, PauseCircle, Plus, RefreshCw, Settings2, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab, type PageTab } from "@/components/common/page-tabs";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { useAskText, useConfirm } from "@/components/common/dialogs-provider";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useFeature } from "@/components/auth/feature-gate";
import { useUrlState } from "@/hooks/use-url-state";
import { showBulkResult } from "@/lib/bulk-selection";
import { formatWorkspaceDate, formatWorkspaceDateTime } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";
import { cn } from "@/lib/utils";
import { PayoutRow, partnerLabel, usePayoutActions, type Payout, type PayoutReasons } from "./payout-actions";

type TabKey = "to-approve" | "on-hold" | "to-pay" | "disputes" | "redemptions" | "cycles";
type QueueKey = "to-approve" | "on-hold" | "to-pay";

type PayoutCycle = { id: string; cycleLabel: string; startDate: string; endDate: string; status: "OPEN" | "CLOSED" };
type PayoutDispute = {
    id: string;
    payoutId: string;
    reason: string;
    status: "OPEN" | "RESOLVED" | "DISMISSED";
    createdAt: string;
    partner: { name?: string; email?: string } | null;
};
type Redemption = {
    id: string;
    userId: string;
    redemptionType: string;
    pointsRedeemed: number;
    status: "REQUESTED" | "FULFILLED" | "FAILED";
    rewardName: string | null;
    failureReason: string | null;
    thirdPartyReference: string | null;
    createdAt: string;
    user?: { name?: string | null; email?: string | null } | null;
};

const QUEUE_EMPTY: Record<QueueKey, { title: string; description: string }> = {
    "to-approve": { title: "Nothing to approve", description: "Draft payouts appear here after a cycle is computed from the commission ledger." },
    "on-hold": { title: "Nothing on hold", description: "Payouts you put on hold wait here until you release them." },
    "to-pay": { title: "Nothing to pay", description: "Approved payouts appear here until you mark them paid." },
};

const REDEMPTION_STATUS: Record<Redemption["status"], { label: string; tone: "warning" | "success" | "danger" }> = {
    REQUESTED: { label: "Waiting", tone: "warning" },
    FULFILLED: { label: "Fulfilled", tone: "success" },
    FAILED: { label: "Declined", tone: "danger" },
};

// Insights › Payouts for admins (decision 32): the day-to-day queues in one place — approve,
// hold, pay, disputes and reward redemptions — with the cycle-by-cycle view alongside. The rules
// (cycle length, tax, approvals, visibility, billing identity) stay in Settings › Rewards & payouts.
export function PayoutsWorkspace() {
    const payoutsEnabled = useFeature("payoutsEnabled");
    const gamificationEnabled = useFeature("gamificationEnabled");
    const [counts, setCounts] = useState<Record<QueueKey, number> | null>(null);
    const [openDisputes, setOpenDisputes] = useState<number | null>(null);
    const [waitingRedemptions, setWaitingRedemptions] = useState<number | null>(null);
    const [reasons, setReasons] = useState<PayoutReasons>({ holdReasons: [], adjustmentReasons: [] });

    const refreshCounts = useCallback(() => {
        if (!payoutsEnabled) return;
        apiFetch<Record<QueueKey, number>>("/payouts?counts=1").then(setCounts).catch(() => setCounts(null));
        apiFetch<PayoutDispute[]>("/payout-disputes?status=OPEN").then((rows) => setOpenDisputes(Array.isArray(rows) ? rows.length : null)).catch(() => setOpenDisputes(null));
    }, [payoutsEnabled]);
    useEffect(() => { refreshCounts(); }, [refreshCounts]);
    useEffect(() => {
        if (!payoutsEnabled) return;
        apiFetch<Partial<PayoutReasons> | null>("/payout-settings")
            .then((data) => setReasons({ holdReasons: data?.holdReasons ?? [], adjustmentReasons: data?.adjustmentReasons ?? [] }))
            .catch(() => undefined);
    }, [payoutsEnabled]);

    const tabs = useMemo(() => {
        const list: PageTab<TabKey>[] = [];
        if (payoutsEnabled) {
            list.push(
                { value: "to-approve", label: "To approve", count: counts?.["to-approve"] },
                { value: "on-hold", label: "On hold", count: counts?.["on-hold"] },
                { value: "to-pay", label: "To pay", count: counts?.["to-pay"] },
                { value: "disputes", label: "Disputes", count: openDisputes ?? undefined },
            );
        }
        if (gamificationEnabled) list.push({ value: "redemptions", label: "Reward redemptions", count: waitingRedemptions ?? undefined });
        if (payoutsEnabled) list.push({ value: "cycles", label: "Cycles" });
        return list;
    }, [payoutsEnabled, gamificationEnabled, counts, openDisputes, waitingRedemptions]);
    const [tab, setTab] = usePageTab(tabs, tabs[0]?.value ?? "to-approve");

    if (!tabs.length) {
        return <EmptyState title="Payouts isn't turned on" description="Ask an admin to turn on the Payouts or Gamification module." />;
    }

    return (
        <div className="mx-auto min-w-0 max-w-5xl">
            <PageHeader
                title="Payouts"
                description="Partner payouts and reward requests waiting for you."
                secondaryActions={
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/settings/rewards/payout-cycles"><Settings2 className="size-4" />Payout rules</Link>
                    </Button>
                }
            />
            <PageTabs label="Payout queues" tabs={tabs} value={tab} onChange={setTab} className="mb-4" />
            {tab === "to-approve" || tab === "on-hold" || tab === "to-pay" ? (
                <PayoutQueue key={tab} queue={tab} reasons={reasons} onChanged={refreshCounts} />
            ) : tab === "disputes" ? (
                <DisputesPanel onChanged={refreshCounts} />
            ) : tab === "redemptions" ? (
                <RedemptionsPanel onWaitingCount={setWaitingRedemptions} />
            ) : (
                <CyclesPanel reasons={reasons} onChanged={refreshCounts} />
            )}
        </div>
    );
}

function PayoutQueue({ queue, reasons, onChanged }: { queue: QueueKey; reasons: PayoutReasons; onChanged: () => void }) {
    const [rows, setRows] = useState<Payout[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const version = useRef(0);

    const load = useCallback(async () => {
        const current = ++version.current;
        setLoading(true);
        setFailed(false);
        try {
            const data = await apiFetch<Payout[]>(`/payouts?queue=${queue}`);
            if (current !== version.current) return;
            setRows(Array.isArray(data) ? data : []);
            setSelected((ids) => ids.filter((id) => (Array.isArray(data) ? data : []).some((row) => row.id === id)));
        } catch {
            if (current === version.current) setFailed(true);
        } finally {
            if (current === version.current) setLoading(false);
        }
    }, [queue]);
    useEffect(() => { load(); }, [load]);

    const reload = () => { load(); onChanged(); };
    const actions = usePayoutActions(reasons, reload);

    // Each approval is independent, so one failure (for example, below the minimum) doesn't
    // block the rest; failed payouts stay selected for a retry (UI/UX plan B12).
    const approveSelected = async () => {
        const chosen = rows.filter((row) => selected.includes(row.id));
        let approved = 0;
        const failures: Array<{ id: string; label: string; reason?: string }> = [];
        for (const payout of chosen) {
            try {
                await apiFetch(`/payouts/${payout.id}/approve`, { method: "POST" });
                approved += 1;
            } catch (error: any) {
                failures.push({ id: payout.id, label: partnerLabel(payout), reason: error?.message });
            }
        }
        showBulkResult({ done: "approved", succeeded: approved, noun: ["payout", "payouts"], failures });
        setSelected(failures.map((failure) => failure.id));
        reload();
    };

    if (loading && !rows.length) return <TableSkeleton rows={4} columns={2} hasToolbar={false} />;
    if (failed) return <ErrorState description="These payouts couldn't be loaded." onRetry={load} />;
    if (!rows.length) {
        const empty = QUEUE_EMPTY[queue];
        return <EmptyState icon={queue === "on-hold" ? <PauseCircle /> : queue === "to-pay" ? <Wallet /> : <CheckCircle2 />} title={empty.title} description={empty.description} />;
    }

    const selectable = queue === "to-approve";
    const allSelected = selectable && selected.length === rows.length;
    return (
        <>
            {selectable ? (
                <label className="mb-2 flex w-fit items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked={allSelected ? true : selected.length ? "indeterminate" : false} onCheckedChange={(checked) => setSelected(checked === true ? rows.map((row) => row.id) : [])} />
                    Select all {formatCount(rows.length)}
                </label>
            ) : null}
            <ul className="divide-y rounded-xl border bg-card">
                {rows.map((payout) => (
                    <PayoutRow
                        key={payout.id}
                        payout={payout}
                        actions={actions}
                        leading={selectable ? (
                            <Checkbox
                                checked={selected.includes(payout.id)}
                                onCheckedChange={(checked) => setSelected((ids) => (checked === true ? [...ids, payout.id] : ids.filter((id) => id !== payout.id)))}
                                aria-label={`Select the payout for ${partnerLabel(payout)}`}
                            />
                        ) : undefined}
                    />
                ))}
            </ul>
            {actions.dialogs}
            {selectable ? <BulkActionsToolbar selectedCount={selected.length} onClearSelection={() => setSelected([])} module="payouts" onApprove={approveSelected} /> : null}
        </>
    );
}

function DisputesPanel({ onChanged }: { onChanged: () => void }) {
    const askText = useAskText();
    const [disputes, setDisputes] = useState<PayoutDispute[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data = await apiFetch<PayoutDispute[]>("/payout-disputes?status=OPEN");
            setDisputes(Array.isArray(data) ? data : []);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const decide = async (dispute: PayoutDispute, status: "RESOLVED" | "DISMISSED") => {
        const who = dispute.partner?.name || dispute.partner?.email || "this partner";
        const notes = await askText({
            title: status === "RESOLVED" ? `Resolve the dispute from ${who}?` : `Dismiss the dispute from ${who}?`,
            description: dispute.reason,
            label: status === "RESOLVED" ? "What was done (optional, shown to the partner)" : "Why it's dismissed (optional, shown to the partner)",
            confirmLabel: status === "RESOLVED" ? "Resolve" : "Dismiss",
            destructive: status === "DISMISSED",
        });
        if (notes === null) return;
        setBusyId(dispute.id);
        try {
            await apiFetch(`/payout-disputes/${dispute.id}`, { method: "PATCH", body: JSON.stringify({ status, resolutionNotes: notes }) });
            toast.success(status === "RESOLVED" ? "Dispute resolved" : "Dispute dismissed");
            setDisputes((rows) => rows.filter((row) => row.id !== dispute.id));
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || "The dispute couldn't be updated");
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <TableSkeleton rows={3} columns={2} hasToolbar={false} />;
    if (failed) return <ErrorState description="The disputes couldn't be loaded." onRetry={load} />;
    if (!disputes.length) return <EmptyState icon={<Inbox />} title="No open disputes" description="When a partner disputes a payout from their payout details, it appears here." />;
    return (
        <ul className="divide-y rounded-xl border bg-card">
            {disputes.map((dispute) => (
                <li key={dispute.id} className="p-3">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 basis-64 break-words">
                            <p className="text-sm font-medium">{dispute.partner?.name || dispute.partner?.email || "Unknown partner"}</p>
                            <p className="text-xs text-muted-foreground">Raised {formatWorkspaceDateTime(dispute.createdAt)}</p>
                            <p className="mt-1.5 text-sm">{dispute.reason}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button size="sm" variant="outline" disabled={busyId === dispute.id} onClick={() => decide(dispute, "DISMISSED")}>Dismiss</Button>
                            <Button size="sm" isLoading={busyId === dispute.id} onClick={() => decide(dispute, "RESOLVED")}>Resolve</Button>
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function RedemptionsPanel({ onWaitingCount }: { onWaitingCount: (count: number) => void }) {
    const askText = useAskText();
    const [rows, setRows] = useState<Redemption[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data = await apiFetch<Redemption[]>("/gamification-redemptions");
            const list = Array.isArray(data) ? data : [];
            setRows(list);
            onWaitingCount(list.filter((row) => row.status === "REQUESTED").length);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [onWaitingCount]);
    useEffect(() => { load(); }, [load]);

    const review = async (redemption: Redemption, status: "FULFILLED" | "FAILED") => {
        const who = redemption.user?.name || redemption.user?.email || "this person";
        const reward = redemption.rewardName ?? redemption.redemptionType;
        const text = await askText(status === "FULFILLED"
            ? { title: `Mark ${reward} fulfilled for ${who}?`, label: "Voucher code or reference (optional)", confirmLabel: "Mark fulfilled" }
            : { title: `Decline ${reward} for ${who}?`, description: `Their ${formatCount(redemption.pointsRedeemed)} points are given back.`, label: "Reason (shown to them)", defaultValue: "We couldn't fulfil this reward", required: true, confirmLabel: "Decline and refund", destructive: true });
        if (text === null) return;
        setBusyId(redemption.id);
        try {
            await apiFetch(`/gamification-redemptions/${redemption.id}`, {
                method: "PATCH",
                body: JSON.stringify(status === "FULFILLED" ? { status, thirdPartyReference: text } : { status, failureReason: text }),
            });
            toast.success(status === "FULFILLED" ? `Fulfilled: ${reward}` : `Declined and refunded: ${reward}`);
            load();
        } catch (error: any) {
            toast.error(error?.message || "The request couldn't be updated");
        } finally {
            setBusyId(null);
        }
    };

    if (loading && !rows.length) return <TableSkeleton rows={3} columns={2} hasToolbar={false} />;
    if (failed) return <ErrorState description="Reward requests couldn't be loaded." onRetry={load} />;
    const waiting = rows.filter((row) => row.status === "REQUESTED");
    const reviewed = rows.filter((row) => row.status !== "REQUESTED").slice(0, 20);
    if (!rows.length) return <EmptyState icon={<Gift />} title="No reward requests" description="When someone redeems points for a reward, the request appears here." />;

    const row = (redemption: Redemption) => {
        const status = REDEMPTION_STATUS[redemption.status];
        return (
            <li key={redemption.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1 basis-56 break-words">
                    <p className="text-sm font-medium">{redemption.rewardName ?? redemption.redemptionType}</p>
                    <p className="text-xs text-muted-foreground">
                        {redemption.user?.name ?? redemption.user?.email ?? "Unknown person"} · {formatCount(redemption.pointsRedeemed)} points · {formatWorkspaceDateTime(redemption.createdAt)}
                    </p>
                    {redemption.failureReason ? <p className="text-xs text-destructive">{redemption.failureReason}</p> : null}
                    {redemption.thirdPartyReference ? <p className="text-xs text-muted-foreground">Reference: {redemption.thirdPartyReference}</p> : null}
                </div>
                {redemption.status === "REQUESTED" ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="outline" disabled={busyId === redemption.id} onClick={() => review(redemption, "FAILED")}>Decline and refund</Button>
                        <Button size="sm" isLoading={busyId === redemption.id} onClick={() => review(redemption, "FULFILLED")}>Mark fulfilled</Button>
                    </div>
                ) : (
                    <Badge tone={status.tone}>{status.label}</Badge>
                )}
            </li>
        );
    };

    return (
        <div className="space-y-5">
            {waiting.length ? (
                <ul className="divide-y rounded-xl border bg-card">{waiting.map(row)}</ul>
            ) : (
                <EmptyState icon={<Gift />} title="No requests waiting" description="Every reward request has been dealt with." />
            )}
            {reviewed.length ? (
                <section aria-labelledby="redemptions-reviewed">
                    <h2 id="redemptions-reviewed" className="mb-2 text-sm font-semibold">Recently reviewed</h2>
                    <ul className="divide-y rounded-xl border bg-card">{reviewed.map(row)}</ul>
                </section>
            ) : null}
        </div>
    );
}

function CyclesPanel({ reasons, onChanged }: { reasons: PayoutReasons; onChanged: () => void }) {
    const confirm = useConfirm();
    const [cycles, setCycles] = useState<PayoutCycle[]>([]);
    const [loadingCycles, setLoadingCycles] = useState(true);
    const [cyclesFailed, setCyclesFailed] = useState(false);
    const [cycleId, setCycleId] = useUrlState<string>("cycle", "");
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [loadingPayouts, setLoadingPayouts] = useState(false);
    const [payoutsFailed, setPayoutsFailed] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [computing, setComputing] = useState(false);
    const version = useRef(0);

    const loadCycles = useCallback(async () => {
        setLoadingCycles(true);
        setCyclesFailed(false);
        try {
            const data = await apiFetch<PayoutCycle[]>("/payout-cycles");
            setCycles(Array.isArray(data) ? data : []);
        } catch {
            setCyclesFailed(true);
        } finally {
            setLoadingCycles(false);
        }
    }, []);
    useEffect(() => { loadCycles(); }, [loadCycles]);

    const selectedCycle = cycles.find((cycle) => cycle.id === cycleId) ?? null;
    const loadPayouts = useCallback(async (id: string) => {
        const current = ++version.current;
        setLoadingPayouts(true);
        setPayoutsFailed(false);
        try {
            const data = await apiFetch<Payout[]>(`/payout-cycles/${id}/payouts`);
            if (current === version.current) setPayouts(Array.isArray(data) ? data : []);
        } catch {
            if (current === version.current) setPayoutsFailed(true);
        } finally {
            if (current === version.current) setLoadingPayouts(false);
        }
    }, []);
    useEffect(() => { if (selectedCycle) loadPayouts(selectedCycle.id); }, [selectedCycle, loadPayouts]);

    const actions = usePayoutActions(reasons, () => { if (selectedCycle) loadPayouts(selectedCycle.id); onChanged(); });

    const generateCycle = async () => {
        const ok = await confirm({ title: "Start the next payout cycle?", description: "The next period is created from your cycle rules. Commission earned in it is computed when you choose Recompute.", confirmLabel: "Start cycle" });
        if (!ok) return;
        setGenerating(true);
        try {
            await apiFetch("/payout-cycles", { method: "POST" });
            toast.success("Next payout cycle started");
            loadCycles();
        } catch (error: any) {
            toast.error(error?.message || "The next cycle couldn't be started");
        } finally {
            setGenerating(false);
        }
    };

    const recompute = async () => {
        if (!selectedCycle) return;
        setComputing(true);
        try {
            await apiFetch(`/payout-cycles/${selectedCycle.id}/compute`, { method: "POST" });
            toast.success("Payouts recomputed from the commission ledger");
            loadPayouts(selectedCycle.id);
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || "The payouts couldn't be recomputed");
        } finally {
            setComputing(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 md:flex-row">
            <div className="w-full min-w-0 shrink-0 md:w-64">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Cycles</h2>
                    <Button size="sm" variant="outline" isLoading={generating} onClick={generateCycle}><Plus className="size-4" />Next cycle</Button>
                </div>
                {cyclesFailed ? (
                    <ErrorState variant="inline" description="Cycles couldn't be loaded." onRetry={loadCycles} />
                ) : loadingCycles ? (
                    <TableSkeleton rows={4} columns={1} hasToolbar={false} />
                ) : !cycles.length ? (
                    <EmptyState icon={<CalendarDays />} title="No cycles yet" description="Start the first payout cycle." />
                ) : (
                    <ul className="space-y-1.5">
                        {cycles.map((cycle) => (
                            <li key={cycle.id}>
                                <button
                                    type="button"
                                    onClick={() => setCycleId(cycle.id)}
                                    aria-current={cycle.id === cycleId ? "true" : undefined}
                                    className={cn(
                                        "w-full rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        cycle.id === cycleId ? "border-primary bg-selected" : "bg-card hover:bg-accent/50",
                                    )}
                                >
                                    <span className="flex min-w-0 items-center justify-between gap-2">
                                        <span className="min-w-0 break-words text-sm font-medium">{cycle.cycleLabel}</span>
                                        <Badge tone={cycle.status === "OPEN" ? "info" : "neutral"}>{cycle.status === "OPEN" ? "Open" : "Closed"}</Badge>
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">{formatWorkspaceDate(cycle.startDate)} – {formatWorkspaceDate(cycle.endDate)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="min-w-0 flex-1">
                {!selectedCycle ? (
                    <EmptyState title="Choose a cycle" description="Pick a cycle to see its payouts." />
                ) : (
                    <>
                        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold">{selectedCycle.cycleLabel}</h2>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <QueueExportButton moduleName="PAYOUTS" filters={{ exportScope: "CYCLE_FINANCE", payoutCycleId: selectedCycle.id }} label="Export CSV" size="sm" variant="ghost" />
                                <Button variant="ghost" size="sm" isLoading={computing} onClick={recompute}><RefreshCw className="size-4" />Recompute from ledger</Button>
                            </div>
                        </div>
                        {payoutsFailed ? (
                            <ErrorState description="This cycle's payouts couldn't be loaded." onRetry={() => loadPayouts(selectedCycle.id)} />
                        ) : loadingPayouts && !payouts.length ? (
                            <TableSkeleton rows={4} columns={2} hasToolbar={false} />
                        ) : !payouts.length ? (
                            <EmptyState title="No payouts in this cycle yet" description="Recompute from the ledger to add up the commission earned in this cycle." />
                        ) : (
                            <ul className="divide-y rounded-xl border bg-card">
                                {payouts.map((payout) => <PayoutRow key={payout.id} payout={payout} actions={actions} />)}
                            </ul>
                        )}
                        {actions.dialogs}
                    </>
                )}
            </div>
        </div>
    );
}

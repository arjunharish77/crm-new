"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CircleDollarSign, Download, FileWarning, History, PauseCircle, Receipt } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { formatMoney } from "@/lib/display/format";
import { InvoiceHistoryDialog } from "./invoice-list";

export type Payout = {
    id: string;
    partnerId: string;
    totalCommissionAmount: number;
    status: "DRAFT" | "APPROVED" | "INVOICED" | "PAID";
    paymentReference: string | null;
    invoiceId: string | null;
    isHeld: boolean;
    holdReason: string | null;
    cycleLabel?: string;
    partner: { name?: string; email?: string; legalBusinessName?: string | null } | null;
};

export type PayoutReasons = { holdReasons: string[]; adjustmentReasons: string[] };

export const PAYOUT_STATUS: Record<Payout["status"], { label: string; tone: "neutral" | "info" | "success" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    APPROVED: { label: "Approved", tone: "info" },
    INVOICED: { label: "Invoiced", tone: "info" },
    PAID: { label: "Paid", tone: "success" },
};

export const partnerLabel = (payout: Payout) => payout.partner?.legalBusinessName || payout.partner?.name || payout.partner?.email || "Unknown partner";
export const formatPayoutAmount = (amount: number) => formatMoney(amount, { currency: "INR" });

// One payout as a row: who, how much, where it stands, and the next steps it allows. The same
// rules as before: only unheld drafts can be approved; only approved payouts get an invoice;
// approved or invoiced payouts can be marked paid; a held payout is released before anything else.
export function PayoutRow({ payout, actions, leading }: { payout: Payout; actions: ReturnType<typeof usePayoutActions>; leading?: React.ReactNode }) {
    const status = PAYOUT_STATUS[payout.status];
    const busy = actions.busyId === payout.id;
    return (
        <li className="p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                    {leading}
                    <div className="min-w-0 break-words">
                        <p className="text-sm font-medium">{partnerLabel(payout)}</p>
                        <p className="text-xs text-muted-foreground">
                            {[payout.cycleLabel, payout.partner?.email].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{formatPayoutAmount(payout.totalCommissionAmount)}</span>
                    <Badge tone={status?.tone ?? "neutral"}>{status?.label ?? payout.status}</Badge>
                    {payout.isHeld ? <Badge tone="danger">On hold</Badge> : null}
                </div>
            </div>
            {payout.isHeld && payout.holdReason ? <p className="mt-1.5 text-xs text-destructive">Hold reason: {payout.holdReason}</p> : null}
            {payout.status === "PAID" && payout.paymentReference ? <p className="mt-1.5 text-xs text-muted-foreground">Payment reference: {payout.paymentReference}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {payout.isHeld ? (
                    <Button size="sm" variant="outline" isLoading={busy} onClick={() => actions.releaseHold(payout)}>Release hold</Button>
                ) : (
                    <>
                        {payout.status === "DRAFT" ? <Button size="sm" isLoading={busy} onClick={() => actions.approve(payout)}>Approve</Button> : null}
                        {payout.status === "APPROVED" ? (
                            <Button size="sm" variant="outline" isLoading={busy} onClick={() => actions.generateInvoice(payout)}><Receipt className="size-4" />Generate invoice</Button>
                        ) : null}
                        {payout.status === "APPROVED" || payout.status === "INVOICED" ? (
                            <Button size="sm" onClick={() => actions.openMarkPaid(payout)}>Mark paid</Button>
                        ) : null}
                        {payout.status === "DRAFT" || payout.status === "APPROVED" ? (
                            <Button size="sm" variant="ghost" onClick={() => actions.openAdjustment(payout)}><CircleDollarSign className="size-4" />Adjust</Button>
                        ) : null}
                        {payout.status !== "PAID" ? (
                            <Button size="sm" variant="ghost" onClick={() => actions.openHold(payout)}><PauseCircle className="size-4" />Hold</Button>
                        ) : null}
                    </>
                )}
                {payout.invoiceId ? (
                    <>
                        <Button size="sm" variant="ghost" asChild>
                            <a href={`/api/partner-invoices/${payout.invoiceId}/pdf`} target="_blank" rel="noreferrer"><Download className="size-4" />Invoice</a>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => actions.openReissue(payout)}><FileWarning className="size-4" />Cancel and reissue</Button>
                    </>
                ) : null}
                {payout.invoiceId || payout.status === "INVOICED" || payout.status === "PAID" ? (
                    <Button size="sm" variant="ghost" onClick={() => actions.openInvoiceHistory(payout)}><History className="size-4" />Invoice history</Button>
                ) : null}
            </div>
        </li>
    );
}

// The payout actions and their dialogs. `onChanged` reloads whatever list is showing.
export function usePayoutActions(reasons: PayoutReasons, onChanged: () => void) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [markPaidTarget, setMarkPaidTarget] = useState<Payout | null>(null);
    const [paymentReference, setPaymentReference] = useState("");
    const [holdTarget, setHoldTarget] = useState<Payout | null>(null);
    const [holdReason, setHoldReason] = useState("");
    const [adjustmentTarget, setAdjustmentTarget] = useState<Payout | null>(null);
    const [adjustmentDirection, setAdjustmentDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
    const [adjustmentAmount, setAdjustmentAmount] = useState("");
    const [adjustmentReason, setAdjustmentReason] = useState("");
    const [adjustmentNotes, setAdjustmentNotes] = useState("");
    const [reissueTarget, setReissueTarget] = useState<Payout | null>(null);
    const [reissueReason, setReissueReason] = useState("");
    const [historyTarget, setHistoryTarget] = useState<Payout | null>(null);
    const [saving, setSaving] = useState(false);

    const run = async (payout: Payout, request: () => Promise<unknown>, done: string, failed: string) => {
        setBusyId(payout.id);
        try {
            await request();
            toast.success(`${done}: ${partnerLabel(payout)}`);
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || failed);
        } finally {
            setBusyId(null);
        }
    };

    const submitDialog = async (request: () => Promise<unknown>, done: string, failed: string, close: () => void) => {
        setSaving(true);
        try {
            await request();
            toast.success(done);
            close();
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || failed);
        } finally {
            setSaving(false);
        }
    };

    const actions = {
        busyId,
        approve: (payout: Payout) => run(payout, () => apiFetch(`/payouts/${payout.id}/approve`, { method: "POST" }), "Approved", "The payout couldn't be approved"),
        releaseHold: (payout: Payout) => run(payout, () => apiFetch(`/payouts/${payout.id}/release-hold`, { method: "POST" }), "Hold released", "The hold couldn't be released"),
        generateInvoice: (payout: Payout) => run(payout, () => apiFetch(`/payouts/${payout.id}/generate-invoice`, { method: "POST" }), "Invoice generated", "The invoice couldn't be generated"),
        openMarkPaid: (payout: Payout) => { setPaymentReference(""); setMarkPaidTarget(payout); },
        openHold: (payout: Payout) => { setHoldReason(reasons.holdReasons?.[0] ?? ""); setHoldTarget(payout); },
        openAdjustment: (payout: Payout) => {
            setAdjustmentDirection("CREDIT");
            setAdjustmentAmount("");
            setAdjustmentNotes("");
            setAdjustmentReason(reasons.adjustmentReasons?.[0] ?? "");
            setAdjustmentTarget(payout);
        },
        openReissue: (payout: Payout) => { setReissueReason(""); setReissueTarget(payout); },
        openInvoiceHistory: (payout: Payout) => setHistoryTarget(payout),
    };

    const dialogs = (
        <>
            <InvoiceHistoryDialog payoutId={historyTarget?.id ?? null} title={historyTarget ? partnerLabel(historyTarget) : ""} onClose={() => setHistoryTarget(null)} />
            <StandardDialog
                open={!!markPaidTarget}
                onClose={() => setMarkPaidTarget(null)}
                title="Mark as paid"
                subtitle={markPaidTarget ? `${partnerLabel(markPaidTarget)} · ${formatPayoutAmount(markPaidTarget.totalCommissionAmount)}` : undefined}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setMarkPaidTarget(null)}>Cancel</Button>
                        <Button
                            isLoading={saving}
                            disabled={!paymentReference.trim()}
                            onClick={() => markPaidTarget && submitDialog(
                                () => apiFetch(`/payouts/${markPaidTarget.id}/mark-paid`, { method: "POST", body: JSON.stringify({ paymentReference: paymentReference.trim() }) }),
                                `Marked paid: ${partnerLabel(markPaidTarget)}`,
                                "The payout couldn't be marked paid",
                                () => setMarkPaidTarget(null),
                            )}
                        >
                            Mark paid
                        </Button>
                    </>
                }
            >
                <div className="space-y-1.5">
                    <Label htmlFor="payout-payment-reference">Payment reference (UTR)</Label>
                    <Input id="payout-payment-reference" placeholder="The bank transfer reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!holdTarget}
                onClose={() => setHoldTarget(null)}
                title="Put on hold"
                subtitle={holdTarget ? `${partnerLabel(holdTarget)} · ${formatPayoutAmount(holdTarget.totalCommissionAmount)}` : undefined}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setHoldTarget(null)}>Cancel</Button>
                        <Button
                            isLoading={saving}
                            disabled={!holdReason.trim()}
                            onClick={() => holdTarget && submitDialog(
                                () => apiFetch(`/payouts/${holdTarget.id}/hold`, { method: "POST", body: JSON.stringify({ holdReason: holdReason.trim() }) }),
                                `On hold: ${partnerLabel(holdTarget)}`,
                                "The payout couldn't be put on hold",
                                () => setHoldTarget(null),
                            )}
                        >
                            Put on hold
                        </Button>
                    </>
                }
            >
                <ReasonPicker id="payout-hold-reason" label="Reason" reasons={reasons.holdReasons} value={holdReason} onChange={setHoldReason} />
            </StandardDialog>

            <StandardDialog
                open={!!adjustmentTarget}
                onClose={() => setAdjustmentTarget(null)}
                title="Adjust payout"
                subtitle={adjustmentTarget ? `${partnerLabel(adjustmentTarget)} · ${formatPayoutAmount(adjustmentTarget.totalCommissionAmount)}` : undefined}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setAdjustmentTarget(null)}>Cancel</Button>
                        <Button
                            isLoading={saving}
                            disabled={!adjustmentReason.trim() || !(Number(adjustmentAmount) > 0)}
                            onClick={() => adjustmentTarget && submitDialog(
                                () => apiFetch(`/payouts/${adjustmentTarget.id}/adjustments`, {
                                    method: "POST",
                                    body: JSON.stringify({ direction: adjustmentDirection, amount: Number(adjustmentAmount), reason: adjustmentReason.trim(), notes: adjustmentNotes }),
                                }),
                                `Adjusted: ${partnerLabel(adjustmentTarget)}`,
                                "The adjustment couldn't be saved",
                                () => setAdjustmentTarget(null),
                            )}
                        >
                            Save adjustment
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="payout-adjust-direction">Direction</Label>
                            <Select value={adjustmentDirection} onValueChange={(value) => setAdjustmentDirection(value as "CREDIT" | "DEBIT")}>
                                <SelectTrigger id="payout-adjust-direction" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CREDIT">Add to the payout</SelectItem>
                                    <SelectItem value="DEBIT">Take off the payout</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="payout-adjust-amount">Amount (₹)</Label>
                            <Input id="payout-adjust-amount" type="number" inputMode="decimal" min={0} value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} />
                        </div>
                    </div>
                    <ReasonPicker id="payout-adjust-reason" label="Reason" reasons={reasons.adjustmentReasons} value={adjustmentReason} onChange={setAdjustmentReason} />
                    <div className="space-y-1.5">
                        <Label htmlFor="payout-adjust-notes">Notes (optional)</Label>
                        <Input id="payout-adjust-notes" value={adjustmentNotes} onChange={(e) => setAdjustmentNotes(e.target.value)} />
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!reissueTarget}
                onClose={() => setReissueTarget(null)}
                title="Cancel and reissue the invoice"
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setReissueTarget(null)}>Keep the invoice</Button>
                        <Button
                            variant="destructive"
                            isLoading={saving}
                            disabled={!reissueReason.trim()}
                            onClick={() => reissueTarget?.invoiceId && submitDialog(
                                () => apiFetch(`/partner-invoices/${reissueTarget.invoiceId}/reissue`, { method: "POST", body: JSON.stringify({ reason: reissueReason.trim() }) }),
                                "Invoice cancelled and reissued",
                                "The invoice couldn't be reissued",
                                () => setReissueTarget(null),
                            )}
                        >
                            Cancel and reissue
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        The current invoice is cancelled (kept for the audit history) and a new one with a new number is made for the same payout.
                        Use this to correct details such as a wrong GSTIN. To change the amount, use Adjust instead.
                    </p>
                    <div className="space-y-1.5">
                        <Label htmlFor="payout-reissue-reason">Reason</Label>
                        <Input id="payout-reissue-reason" placeholder="For example: wrong GSTIN on the original" value={reissueReason} onChange={(e) => setReissueReason(e.target.value)} />
                    </div>
                </div>
            </StandardDialog>
        </>
    );

    return { ...actions, dialogs };
}

// A reason from the workspace's list, or one typed in.
function ReasonPicker({ id, label, reasons, value, onChange }: { id: string; label: string; reasons: string[]; value: string; onChange: (value: string) => void }) {
    const known = (reasons ?? []).includes(value);
    const [custom, setCustom] = useState(!known && !!value);
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select
                value={custom || !known ? "__custom__" : value}
                onValueChange={(next) => {
                    if (next === "__custom__") { setCustom(true); onChange(""); } else { setCustom(false); onChange(next); }
                }}
            >
                <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>
                    {(reasons ?? []).map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                    <SelectItem value="__custom__">Another reason…</SelectItem>
                </SelectContent>
            </Select>
            {custom || !known ? <Input aria-label={`${label}, in your own words`} placeholder="Type the reason" value={value} onChange={(e) => onChange(e.target.value)} /> : null}
        </div>
    );
}

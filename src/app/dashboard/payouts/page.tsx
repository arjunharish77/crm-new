"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Receipt, Download, Info, TriangleAlert, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { useFeature } from "@/components/auth/feature-gate";

type Payout = {
    id: string;
    totalCommissionAmount: number;
    status: "DRAFT" | "APPROVED" | "INVOICED" | "PAID";
    paymentReference: string | null;
    invoiceId: string | null;
    isHeld?: boolean;
    createdAt: string;
};

type LedgerEntry = {
    id: string;
    entryType: string;
    baseAmount: number | null;
    commissionAmount: number;
    createdAt: string;
    triggerEvent: string | null;
};

type InvoiceTemplate = {
    logoUrl: string | null;
    footerNotes: string | null;
    signatoryName: string | null;
};

type PartnerProfile = {
    legalBusinessName: string | null;
    gstin: string | null;
    panNumber: string | null;
    registeredState: string | null;
};

type PartnerChangeRequest = {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    proposedChanges: Record<string, unknown>;
    reviewComment: string | null;
    createdAt: string;
};

type PayoutBreakdown = {
    payout: Payout;
    cycle: { cycleLabel: string; startDate: string; endDate: string };
    ledgerEntries: LedgerEntry[];
    history: { id: string; action: string; metadata: any; createdAt: string }[];
};

type PayoutDispute = {
    id: string;
    reason: string;
    status: "OPEN" | "RESOLVED" | "DISMISSED";
    resolutionNotes: string | null;
    createdAt: string;
};

const STATUS_BADGE_CLASSNAMES: Record<Payout["status"], string> = {
    PAID: "border-primary/20 bg-primary/10 text-primary",
    APPROVED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    INVOICED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    DRAFT: "border-border bg-muted text-muted-foreground",
};

export default function MyPayoutsPage() {
    const payoutsEnabled = useFeature("payoutsEnabled");
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatingFor, setGeneratingFor] = useState<string | null>(null);

    const [template, setTemplate] = useState<InvoiceTemplate>({ logoUrl: "", footerNotes: "", signatoryName: "" });
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [profile, setProfile] = useState<PartnerProfile | null>(null);
    // Gap checklist Module 10's "approval inbox" item, "partner changes" sub-item -- a partner
    // could never change their own profile at all before this (PATCH /api/partners/[id] is
    // tenant-admin-only); this is the new self-service request path, gated behind admin approval.
    const [changeRequestOpen, setChangeRequestOpen] = useState(false);
    const [changeRequestForm, setChangeRequestForm] = useState({ legalBusinessName: "", gstin: "", panNumber: "", registeredState: "" });
    const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
    const [myChangeRequests, setMyChangeRequests] = useState<PartnerChangeRequest[]>([]);

    const [breakdownTarget, setBreakdownTarget] = useState<Payout | null>(null);
    const [breakdown, setBreakdown] = useState<PayoutBreakdown | null>(null);
    const [loadingBreakdown, setLoadingBreakdown] = useState(false);
    const [disputes, setDisputes] = useState<PayoutDispute[]>([]);

    const [disputeTarget, setDisputeTarget] = useState<Payout | null>(null);
    const [disputeReason, setDisputeReason] = useState("");
    const [submittingDispute, setSubmittingDispute] = useState(false);

    const fetchPayouts = useCallback(() => {
        return apiFetch<Payout[]>("/partners/me/payouts").catch(() => []);
    }, []);

    useEffect(() => {
        Promise.all([
            fetchPayouts(),
            apiFetch<LedgerEntry[]>("/partners/me/commission-ledger").catch(() => []),
            apiFetch<InvoiceTemplate | null>("/partners/me/invoice-template").catch(() => null),
            apiFetch<PartnerProfile | null>("/partners/me").catch(() => null),
        ])
            .then(([payoutsData, ledgerData, templateData, profileData]) => {
                setPayouts(Array.isArray(payoutsData) ? payoutsData : []);
                setLedger(Array.isArray(ledgerData) ? ledgerData : []);
                if (templateData) {
                    setTemplate({
                        logoUrl: templateData.logoUrl ?? "",
                        footerNotes: templateData.footerNotes ?? "",
                        signatoryName: templateData.signatoryName ?? "",
                    });
                }
                setProfile(profileData ?? null);
            })
            .catch(() => toast.error("Failed to load payout history"))
            .finally(() => setLoading(false));
        apiFetch<PartnerChangeRequest[]>("/partners/me/change-requests").then((data) => setMyChangeRequests(Array.isArray(data) ? data : [])).catch(() => undefined);
    }, [fetchPayouts]);

    const openChangeRequest = () => {
        setChangeRequestForm({
            legalBusinessName: profile?.legalBusinessName ?? "",
            gstin: profile?.gstin ?? "",
            panNumber: profile?.panNumber ?? "",
            registeredState: profile?.registeredState ?? "",
        });
        setChangeRequestOpen(true);
    };

    const submitChangeRequest = async () => {
        setSubmittingChangeRequest(true);
        try {
            const created = await apiFetch<PartnerChangeRequest>("/partners/me/change-requests", {
                method: "POST",
                body: JSON.stringify(changeRequestForm),
            });
            setMyChangeRequests((current) => [created, ...current]);
            toast.success("Change request submitted -- your admin will review it");
            setChangeRequestOpen(false);
        } catch (error: any) {
            toast.error(error?.message || "Failed to submit change request");
        } finally {
            setSubmittingChangeRequest(false);
        }
    };

    const pendingChangeRequest = myChangeRequests.find((request) => request.status === "PENDING");

    const openBreakdown = async (payout: Payout) => {
        setBreakdownTarget(payout);
        setLoadingBreakdown(true);
        try {
            const [breakdownData, disputeData] = await Promise.all([
                apiFetch<PayoutBreakdown>(`/payouts/${payout.id}/breakdown`),
                apiFetch<PayoutDispute[]>(`/payouts/${payout.id}/disputes`).catch(() => []),
            ]);
            setBreakdown(breakdownData);
            setDisputes(Array.isArray(disputeData) ? disputeData : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load payout breakdown");
            setBreakdownTarget(null);
        } finally {
            setLoadingBreakdown(false);
        }
    };

    const handleRaiseDispute = async () => {
        if (!disputeTarget) return;
        setSubmittingDispute(true);
        try {
            await apiFetch(`/payouts/${disputeTarget.id}/disputes`, {
                method: "POST",
                body: JSON.stringify({ reason: disputeReason }),
            });
            toast.success("Dispute raised — your admin has been notified");
            setDisputeTarget(null);
            setDisputeReason("");
            if (breakdownTarget?.id === disputeTarget.id) {
                const disputeData = await apiFetch<PayoutDispute[]>(`/payouts/${disputeTarget.id}/disputes`).catch(() => []);
                setDisputes(Array.isArray(disputeData) ? disputeData : []);
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to raise dispute");
        } finally {
            setSubmittingDispute(false);
        }
    };

    const taxReadiness = profile
        ? {
              gstNoted: !!profile.gstin,
              stateSet: !!profile.registeredState,
              panSet: !!profile.panNumber,
          }
        : null;
    const taxReady = taxReadiness ? taxReadiness.stateSet && taxReadiness.panSet : true;

    const handleGenerateInvoice = async (payoutId: string) => {
        setGeneratingFor(payoutId);
        try {
            await apiFetch(`/payouts/${payoutId}/generate-invoice`, { method: "POST" });
            toast.success("Invoice generated");
            setPayouts(await fetchPayouts());
        } catch (error: any) {
            toast.error(error.message || "Failed to generate invoice");
        } finally {
            setGeneratingFor(null);
        }
    };

    const handleSaveTemplate = async () => {
        setSavingTemplate(true);
        try {
            await apiFetch("/partners/me/invoice-template", { method: "PUT", body: JSON.stringify(template) });
            toast.success("Invoice template saved");
        } catch (error: any) {
            toast.error(error.message || "Failed to save invoice template");
        } finally {
            setSavingTemplate(false);
        }
    };

    if (!payoutsEnabled) {
        return (
            <div className="mx-auto max-w-[1200px] p-4 md:p-6">
                <EmptyState title="Payouts isn't enabled" description="This feature isn't enabled for your workspace. Contact your admin if you think this is a mistake." />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-lg font-extrabold tracking-tight">My Payouts</h1>
                <QueueExportButton moduleName="PAYOUTS" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Your commission and payout history.</p>

            {taxReadiness && !taxReady && (
                <Alert variant="destructive" className="mt-4">
                    <TriangleAlert className="size-4" />
                    <AlertTitle>Tax details incomplete</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            {!taxReadiness.stateSet && "Registered state is missing. "}
                            {!taxReadiness.panSet && "PAN number is missing. "}
                            {!taxReadiness.gstNoted && "No GSTIN on file — invoices will be issued as unregistered. "}
                        </span>
                        <Button size="sm" variant="outline" onClick={openChangeRequest} disabled={!!pendingChangeRequest}>
                            {pendingChangeRequest ? "Change request pending" : "Request Profile Change"}
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {profile && !(taxReadiness && !taxReady) && (
                <div className="mt-4 flex items-center justify-between rounded-[14px] border bg-card p-3">
                    <div>
                        <p className="text-sm font-medium">My Profile</p>
                        <p className="text-xs text-muted-foreground">{profile.legalBusinessName || "No business name on file"}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={openChangeRequest} disabled={!!pendingChangeRequest}>
                        {pendingChangeRequest ? "Change request pending" : "Request Profile Change"}
                    </Button>
                </div>
            )}

            <StandardDialog
                open={changeRequestOpen}
                onClose={() => setChangeRequestOpen(false)}
                title="Request Profile Change"
                subtitle="Your admin reviews and approves this before it takes effect."
                actions={
                    <>
                        <Button variant="outline" onClick={() => setChangeRequestOpen(false)}>Cancel</Button>
                        <Button onClick={submitChangeRequest} disabled={submittingChangeRequest}>
                            {submittingChangeRequest ? "Submitting..." : "Submit for Approval"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label>Legal Business Name</Label>
                        <Input value={changeRequestForm.legalBusinessName} onChange={(e) => setChangeRequestForm((f) => ({ ...f, legalBusinessName: e.target.value }))} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>GSTIN</Label>
                            <Input value={changeRequestForm.gstin} onChange={(e) => setChangeRequestForm((f) => ({ ...f, gstin: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>PAN Number</Label>
                            <Input value={changeRequestForm.panNumber} onChange={(e) => setChangeRequestForm((f) => ({ ...f, panNumber: e.target.value }))} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Registered State</Label>
                        <Input value={changeRequestForm.registeredState} onChange={(e) => setChangeRequestForm((f) => ({ ...f, registeredState: e.target.value }))} />
                    </div>
                    {myChangeRequests.length > 0 && (
                        <div className="space-y-1.5 border-t pt-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your requests</p>
                            {myChangeRequests.slice(0, 5).map((request) => (
                                <div key={request.id} className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{formatWorkspaceDateTime(request.createdAt)}</span>
                                    <Badge variant="outline" className={cn(
                                        request.status === "APPROVED" && "border-primary/20 bg-primary/10 text-primary",
                                        request.status === "REJECTED" && "border-destructive/20 bg-destructive/10 text-destructive",
                                    )}>
                                        {request.status}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </StandardDialog>

            <div className="mt-4 rounded-[14px] border bg-card">
                <Accordion type="single" collapsible>
                    <AccordionItem value="invoice-template" className="border-b-0">
                        <AccordionTrigger className="px-4 py-3 text-sm font-bold hover:no-underline">
                            Invoice Template
                        </AccordionTrigger>
                        <AccordionContent className="px-4">
                            <p className="mb-4 text-xs text-muted-foreground">
                                Customize the branding on invoices you generate. The layout itself stays GST-compliant.
                            </p>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Logo URL (optional)</Label>
                                    <Input
                                        value={template.logoUrl ?? ""}
                                        onChange={(e) => setTemplate((t) => ({ ...t, logoUrl: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Footer Notes (optional)</Label>
                                    <Textarea
                                        rows={2}
                                        value={template.footerNotes ?? ""}
                                        onChange={(e) => setTemplate((t) => ({ ...t, footerNotes: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Signatory Name (optional)</Label>
                                    <Input
                                        value={template.signatoryName ?? ""}
                                        onChange={(e) => setTemplate((t) => ({ ...t, signatoryName: e.target.value }))}
                                    />
                                </div>
                                <Button size="sm" onClick={handleSaveTemplate} disabled={savingTemplate}>
                                    {savingTemplate ? "Saving..." : "Save Template"}
                                </Button>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>

            {loading ? (
                <TableSkeleton rows={4} columns={3} />
            ) : (
                <>
                    <h2 className="mt-6 mb-2 text-sm font-bold">Payout Cycles</h2>
                    {payouts.length === 0 ? (
                        <EmptyState title="No payouts yet" description="Payouts appear here once a cycle including your commission is generated." />
                    ) : (
                        <div className="space-y-3">
                            {payouts.map((payout) => (
                                <div key={payout.id} className="rounded-[14px] border bg-card p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="text-xs text-muted-foreground">
                                            {formatWorkspaceDateTime(payout.createdAt)}
                                        </span>
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-sm font-bold">
                                                ₹{payout.totalCommissionAmount.toLocaleString()}
                                            </span>
                                            <Badge variant="outline" className={cn("rounded-md text-[0.65rem] font-semibold", STATUS_BADGE_CLASSNAMES[payout.status])}>
                                                {payout.status}
                                            </Badge>
                                            {payout.status === "APPROVED" && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleGenerateInvoice(payout.id)}
                                                    disabled={generatingFor === payout.id}
                                                >
                                                    <Receipt className="size-4" />
                                                    {generatingFor === payout.id ? "Generating..." : "Generate Invoice"}
                                                </Button>
                                            )}
                                            {payout.invoiceId && (
                                                <Button size="sm" variant="ghost" asChild>
                                                    <a href={`/api/partner-invoices/${payout.invoiceId}/pdf`} target="_blank" rel="noreferrer">
                                                        <Download className="size-4" />
                                                        Invoice
                                                    </a>
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => openBreakdown(payout)}>
                                                <Info className="size-4" />
                                                Details
                                            </Button>
                                        </div>
                                    </div>
                                    {payout.paymentReference && (
                                        <p className="mt-1 text-xs text-muted-foreground">Ref: {payout.paymentReference}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <Separator className="my-6" />

                    <h2 className="mb-2 text-sm font-bold">Commission Ledger</h2>
                    {ledger.length === 0 ? (
                        <EmptyState title="No commission earned yet" description="Entries appear here as your deals move through opportunity stages." />
                    ) : (
                        <div className="space-y-2">
                            {ledger.map((entry) => (
                                <div key={entry.id} className="rounded-xl border bg-card p-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold">{entry.entryType}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatWorkspaceDateTime(entry.createdAt)} {entry.triggerEvent ? `· ${entry.triggerEvent}` : ""}
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold">
                                            {entry.entryType === "CORRECTION_DEBIT" ? "-" : "+"}₹{entry.commissionAmount.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            <StandardDialog
                open={!!breakdownTarget}
                onClose={() => { setBreakdownTarget(null); setBreakdown(null); }}
                title="Payout Breakdown"
                maxWidth="sm"
                actions={
                    breakdownTarget ? (
                        <>
                            <Button variant="outline" asChild>
                                <a href={`/api/payouts/${breakdownTarget.id}/statement`} target="_blank" rel="noreferrer">
                                    <Download className="size-4" />
                                    Download Statement
                                </a>
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => { setDisputeTarget(breakdownTarget); setDisputeReason(""); }}
                            >
                                <FileWarning className="size-4" />
                                Raise a Dispute
                            </Button>
                        </>
                    ) : null
                }
            >
                {loadingBreakdown ? (
                    <TableSkeleton rows={3} columns={2} />
                ) : breakdown ? (
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground">Cycle</p>
                            <p className="text-sm">{breakdown.cycle.cycleLabel}</p>
                        </div>

                        {disputes.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase text-muted-foreground">Disputes</p>
                                {disputes.map((dispute) => (
                                    <div key={dispute.id} className="rounded-lg border bg-surface-container-low p-2 text-xs">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold">{dispute.reason}</span>
                                            <Badge variant="outline" className="rounded-md text-[0.65rem]">{dispute.status}</Badge>
                                        </div>
                                        {dispute.resolutionNotes && <p className="mt-1 text-muted-foreground">{dispute.resolutionNotes}</p>}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div>
                            <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">Included Conversions</p>
                            {breakdown.ledgerEntries.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No ledger entries in this cycle.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {breakdown.ledgerEntries.map((entry) => (
                                        <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 text-xs">
                                            <span>
                                                {entry.entryType}
                                                {entry.triggerEvent ? ` · ${entry.triggerEvent}` : ""}
                                                {" · "}
                                                {formatWorkspaceDateTime(entry.createdAt)}
                                            </span>
                                            <span className="font-semibold">
                                                {entry.entryType === "CORRECTION_DEBIT" ? "-" : "+"}₹{entry.commissionAmount.toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">History</p>
                            {breakdown.history.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No status changes recorded yet.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {breakdown.history.map((event) => (
                                        <div key={event.id} className="rounded-lg border bg-card p-2 text-xs">
                                            <span className="text-muted-foreground">{formatWorkspaceDateTime(event.createdAt)} · </span>
                                            {event.metadata?.hold?.after === true && "Placed on hold"}
                                            {event.metadata?.hold?.after === false && "Hold released"}
                                            {event.metadata?.status && `Status changed to ${event.metadata.status.after}`}
                                            {event.metadata?.adjustment && `Adjustment: ${event.metadata.adjustment.direction} ₹${event.metadata.adjustment.amount} (${event.metadata.adjustment.reason})`}
                                            {!event.metadata?.hold && !event.metadata?.status && !event.metadata?.adjustment && event.action}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </StandardDialog>

            <StandardDialog
                open={!!disputeTarget}
                onClose={() => setDisputeTarget(null)}
                title="Raise a Payout Dispute"
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setDisputeTarget(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleRaiseDispute} disabled={!disputeReason.trim() || submittingDispute}>
                            {submittingDispute ? "Submitting..." : "Submit Dispute"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-2">
                    <Label>What looks wrong about this payout?</Label>
                    <Textarea
                        rows={3}
                        placeholder="e.g. Missing commission for opportunity X"
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                    />
                </div>
            </StandardDialog>
        </div>
    );
}

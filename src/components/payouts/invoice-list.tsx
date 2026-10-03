"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Link2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { TableSkeleton } from "@/components/common/skeletons";
import { formatWorkspaceDate, formatWorkspaceDateTime } from "@/lib/date-format";
import { formatMoney } from "@/lib/display/format";

export type PartnerInvoice = {
    id: string;
    partnerId: string;
    payoutId: string;
    invoiceNumber: string;
    invoiceDate: string | null;
    totalAmount: number | string;
    status: string;
    cancellationReason: string | null;
    cancelledAt: string | null;
    supersedesInvoiceId: string | null;
    createdAt: string;
};

// Partner invoices, newest first, including cancelled ones and what replaced them (UI/UX plan
// §12.3 / decision 32). Download goes through the existing PDF route; "Copy share link" makes a
// time-limited link someone without an account can open (only for the invoice's own partner or
// an admin, the same rule the server applies).
export function InvoiceList({ invoices, canDownload, canShare }: {
    invoices: PartnerInvoice[];
    canDownload: (invoice: PartnerInvoice) => boolean;
    canShare: (invoice: PartnerInvoice) => boolean;
}) {
    const [sharingId, setSharingId] = useState<string | null>(null);
    const share = async (invoice: PartnerInvoice) => {
        setSharingId(invoice.id);
        try {
            const { url, expiresAt } = await apiFetch<{ url: string; expiresAt: string }>(`/partner-invoices/${invoice.id}/signed-url`, { method: "POST" });
            await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
            toast.success(`Link copied. It works until ${formatWorkspaceDateTime(expiresAt)}.`);
        } catch (error: any) {
            toast.error(error?.message || "The link couldn't be created");
        } finally {
            setSharingId(null);
        }
    };

    return (
        <ul className="divide-y rounded-xl border bg-card">
            {invoices.map((invoice) => {
                const cancelled = invoice.status === "CANCELLED";
                return (
                    <li key={invoice.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1 basis-56">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                {invoice.invoiceNumber}
                                <Badge tone={cancelled ? "neutral" : "success"}>{cancelled ? "Cancelled" : "Issued"}</Badge>
                                {invoice.supersedesInvoiceId ? <Badge tone="info">Replacement</Badge> : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {formatWorkspaceDate(invoice.invoiceDate || invoice.createdAt)} · {formatMoney(invoice.totalAmount, { currency: "INR" })}
                            </p>
                            {cancelled && invoice.cancellationReason ? <p className="text-xs text-muted-foreground">Cancelled: {invoice.cancellationReason}</p> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {canDownload(invoice) ? (
                                <Button size="sm" variant="ghost" asChild>
                                    <a href={`/api/partner-invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer"><Download className="size-4" />Download</a>
                                </Button>
                            ) : null}
                            {canShare(invoice) && !cancelled ? (
                                <Button size="sm" variant="ghost" isLoading={sharingId === invoice.id} onClick={() => share(invoice)}>
                                    <Link2 className="size-4" />Copy share link
                                </Button>
                            ) : null}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

// Loads and lists invoices from one endpoint, with loading, error and empty states.
export function InvoicesPanel({ path, emptyDescription, canDownload, canShare }: {
    path: string;
    emptyDescription: string;
    canDownload: (invoice: PartnerInvoice) => boolean;
    canShare: (invoice: PartnerInvoice) => boolean;
}) {
    const [invoices, setInvoices] = useState<PartnerInvoice[] | null>(null);
    const [failed, setFailed] = useState(false);
    const load = useCallback(() => {
        setFailed(false);
        setInvoices(null);
        apiFetch<PartnerInvoice[]>(path)
            .then((data) => setInvoices(Array.isArray(data) ? data : []))
            .catch(() => setFailed(true));
    }, [path]);
    useEffect(() => { load(); }, [load]);

    if (failed) return <ErrorState variant="inline" description="Invoices couldn't be loaded." onRetry={load} />;
    if (!invoices) return <TableSkeleton rows={2} columns={2} hasToolbar={false} />;
    if (!invoices.length) return <EmptyState icon={<FileText />} title="No invoices yet" description={emptyDescription} />;
    return <InvoiceList invoices={invoices} canDownload={canDownload} canShare={canShare} />;
}

// Admin: every invoice made for one payout, including cancelled ones.
export function InvoiceHistoryDialog({ payoutId, title, onClose }: { payoutId: string | null; title: string; onClose: () => void }) {
    return (
        <StandardDialog open={!!payoutId} onClose={onClose} title="Invoice history" subtitle={title} maxWidth="sm">
            {payoutId ? (
                <InvoicesPanel
                    path={`/payouts/${payoutId}/invoices`}
                    emptyDescription="No invoice has been generated for this payout."
                    canDownload={() => true}
                    canShare={() => true}
                />
            ) : null}
        </StandardDialog>
    );
}

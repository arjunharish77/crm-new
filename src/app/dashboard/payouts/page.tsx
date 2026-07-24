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
import { Receipt, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { QueueExportButton } from "@/components/exports/queue-export-button";

type Payout = {
    id: string;
    totalCommissionAmount: number;
    status: "DRAFT" | "APPROVED" | "INVOICED" | "PAID";
    paymentReference: string | null;
    invoiceId: string | null;
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

const STATUS_BADGE_CLASSNAMES: Record<Payout["status"], string> = {
    PAID: "border-primary/20 bg-primary/10 text-primary",
    APPROVED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    INVOICED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    DRAFT: "border-border bg-muted text-muted-foreground",
};

export default function MyPayoutsPage() {
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatingFor, setGeneratingFor] = useState<string | null>(null);

    const [template, setTemplate] = useState<InvoiceTemplate>({ logoUrl: "", footerNotes: "", signatoryName: "" });
    const [savingTemplate, setSavingTemplate] = useState(false);

    const fetchPayouts = useCallback(() => {
        return apiFetch<Payout[]>("/partners/me/payouts").catch(() => []);
    }, []);

    useEffect(() => {
        Promise.all([
            fetchPayouts(),
            apiFetch<LedgerEntry[]>("/partners/me/commission-ledger").catch(() => []),
            apiFetch<InvoiceTemplate | null>("/partners/me/invoice-template").catch(() => null),
        ])
            .then(([payoutsData, ledgerData, templateData]) => {
                setPayouts(Array.isArray(payoutsData) ? payoutsData : []);
                setLedger(Array.isArray(ledgerData) ? ledgerData : []);
                if (templateData) {
                    setTemplate({
                        logoUrl: templateData.logoUrl ?? "",
                        footerNotes: templateData.footerNotes ?? "",
                        signatoryName: templateData.signatoryName ?? "",
                    });
                }
            })
            .catch(() => toast.error("Failed to load payout history"))
            .finally(() => setLoading(false));
    }, [fetchPayouts]);

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

    return (
        <div className="mx-auto max-w-[1200px] p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-lg font-extrabold tracking-tight">My Payouts</h1>
                <QueueExportButton moduleName="PAYOUTS" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Your commission and payout history.</p>

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
        </div>
    );
}

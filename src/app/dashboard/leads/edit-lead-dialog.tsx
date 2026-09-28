
"use client";

import { useEffect, useState } from "react";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Pencil, Loader2 } from "lucide-react";
import { LeadForm } from "./lead-form";
import { apiFetch } from "@/lib/api";
import { ErrorState } from "@/components/common/error-state";

import { Lead } from "@/types/leads";

interface EditLeadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lead: Lead;
    onSuccess: () => void;
}

export function EditLeadDialog({ open, onOpenChange, lead, onSuccess }: EditLeadDialogProps) {
    const [fullLead, setFullLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!open || !lead?.id) return;

        let cancelled = false;
        setLoading(true);
        setLoadError(false);
        setFullLead(null);
        const controller = new AbortController();

        apiFetch<Lead>(`/leads/${lead.id}`, { signal: controller.signal })
            .then((data) => {
                if (!cancelled) {
                    if (!data) { setLoadError(true); return; }
                    setFullLead(data);
                }
            })
            .catch(() => {
                if (!cancelled) setLoadError(true);
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [open, lead, attempt]);

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title="Edit Lead"
            subtitle="Update lead details and classification"
            icon={<Pencil className="size-5" />}
        >
            {loading ? (
                <div className="flex min-h-[180px] items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : loadError ? <ErrorState description="Full lead details could not be loaded." onRetry={() => setAttempt(value => value + 1)} /> : fullLead ? (
                <LeadForm
                    initialData={fullLead}
                    onSuccess={() => {
                        onSuccess();
                        onOpenChange(false);
                    }}
                    onCancel={() => onOpenChange(false)}
                />
            ) : (
                <p className="text-sm text-muted-foreground">
                    Unable to load lead details.
                </p>
            )}
        </StandardDialog>
    );
}

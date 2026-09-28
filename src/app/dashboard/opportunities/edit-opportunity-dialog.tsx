"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Opportunity } from "@/types/opportunities";
import { StandardDialog } from "@/components/common/standard-dialog";
import { OpportunityForm } from "./opportunity-form";
import { apiFetch } from "@/lib/api";
import { ErrorState } from "@/components/common/error-state";

interface EditOpportunityDialogProps {
    opportunity: Opportunity;
    onSuccess: (updatedOpportunity: Opportunity) => void;
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function EditOpportunityDialog({
    opportunity,
    onSuccess,
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: EditOpportunityDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [fullOpportunity, setFullOpportunity] = useState<Opportunity | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

    const handleClose = () => setOpen(false);

    useEffect(() => {
        if (!open || !opportunity?.id) return;

        let cancelled = false;
        setLoading(true);
        setLoadError(false);
        setFullOpportunity(null);
        const controller = new AbortController();

        apiFetch<Opportunity>(`/opportunities/${opportunity.id}`, { signal: controller.signal })
            .then((data) => {
                if (!cancelled) {
                    if (!data) { setLoadError(true); return; }
                    setFullOpportunity(data);
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
    }, [open, opportunity, attempt]);

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Edit Opportunity"
            subtitle="Update deal details."
            icon={<Pencil className="size-4" />}
        >
            <div style={{ padding: '8px 0' }}>
                {loading ? (
                    <div className="flex min-h-[180px] items-center justify-center">
                        <Loader2 className="size-6 animate-spin text-primary" />
                    </div>
                ) : loadError ? <ErrorState description="Full opportunity details could not be loaded." onRetry={() => setAttempt(value => value + 1)} /> : fullOpportunity ? (
                    <OpportunityForm
                        initialData={fullOpportunity}
                        onSuccess={(updated) => {
                            handleClose();
                            onSuccess(updated);
                        }}
                        onCancel={handleClose}
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">Unable to load opportunity details.</p>
                )}
            </div>
        </StandardDialog>
    );
}

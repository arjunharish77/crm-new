"use client";

import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Opportunity } from "@/types/opportunities";
import { StandardDialog } from "@/components/common/standard-dialog";
import { OpportunityForm } from "./opportunity-form";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Box, CircularProgress, Typography } from "@mui/material";

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
    const [fullOpportunity, setFullOpportunity] = useState<Opportunity | null>(opportunity);
    const [loading, setLoading] = useState(false);

    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

    const handleClose = () => setOpen(false);

    useEffect(() => {
        if (!open || !opportunity?.id) return;

        let cancelled = false;
        setLoading(true);

        apiFetch<Opportunity>(`/opportunities/${opportunity.id}`)
            .then((data) => {
                if (!cancelled) {
                    setFullOpportunity(data ?? opportunity);
                }
            })
            .catch((error) => {
                console.error(error);
                if (!cancelled) {
                    setFullOpportunity(opportunity);
                    toast.error("Failed to load full opportunity details");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [open, opportunity]);

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Edit Opportunity"
            subtitle="Update deal details."
            icon={<Pencil fontSize="small" />}
        >
            <div style={{ padding: '8px 0' }}>
                {loading && !fullOpportunity ? (
                    <Box sx={{ minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : fullOpportunity ? (
                    <OpportunityForm
                        initialData={fullOpportunity}
                        onSuccess={(updated) => {
                            handleClose();
                            onSuccess(updated);
                        }}
                        onCancel={handleClose}
                    />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Unable to load opportunity details.
                    </Typography>
                )}
            </div>
        </StandardDialog>
    );
}

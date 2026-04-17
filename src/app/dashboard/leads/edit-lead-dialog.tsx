
"use client";

import { useEffect, useState } from "react";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Edit as EditIcon } from "@mui/icons-material";
import { Box, CircularProgress, Typography } from "@mui/material";
import { LeadForm } from "./lead-form";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

import { Lead } from "@/types/leads";

interface EditLeadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lead: Lead;
    onSuccess: () => void;
}

export function EditLeadDialog({ open, onOpenChange, lead, onSuccess }: EditLeadDialogProps) {
    const [fullLead, setFullLead] = useState<Lead | null>(lead);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !lead?.id) return;

        let cancelled = false;
        setLoading(true);

        apiFetch<Lead>(`/leads/${lead.id}`)
            .then((data) => {
                if (!cancelled) {
                    setFullLead(data ?? lead);
                }
            })
            .catch((error) => {
                console.error(error);
                if (!cancelled) {
                    setFullLead(lead);
                    toast.error("Failed to load full lead details");
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
    }, [open, lead]);

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title="Edit Lead"
            subtitle="Update lead details and classification"
            icon={<EditIcon />}
        >
            {loading && !fullLead ? (
                <Box sx={{ minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CircularProgress size={24} />
                </Box>
            ) : fullLead ? (
                <LeadForm
                    initialData={fullLead}
                    onSuccess={() => {
                        onSuccess();
                        onOpenChange(false);
                    }}
                    onCancel={() => onOpenChange(false)}
                />
            ) : (
                <Typography variant="body2" color="text.secondary">
                    Unable to load lead details.
                </Typography>
            )}
        </StandardDialog>
    );
}

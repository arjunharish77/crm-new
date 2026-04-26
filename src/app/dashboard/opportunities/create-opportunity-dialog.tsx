'use client';

import React, { useState } from "react";
import {
    Button as MuiButton,
    Box,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import { StandardDialog } from "@/components/common/standard-dialog";
import { OpportunityForm } from "./opportunity-form";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";

interface CreateOpportunityDialogProps {
    onSuccess: () => void;
    defaultLeadId?: string;
    trigger?: React.ReactNode;
    open?: boolean; // Controlled
    onOpenChange?: (open: boolean) => void; // Controlled
}

export function CreateOpportunityDialog({ onSuccess, defaultLeadId, trigger, open: controlledOpen, onOpenChange: setControlledOpen }: CreateOpportunityDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    // Use controlled state if provided, otherwise internal
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);

    return (
        <>
            {trigger ? (
                <Box onClick={handleOpen}>{trigger}</Box>
            ) : (
                <MuiButton
                    variant="contained"
                    color="secondary"
                    startIcon={<AddIcon />}
                    onClick={handleOpen}
                >
                    Add Opportunity
                </MuiButton>
            )}

            <StandardDialog
                open={open}
                onClose={handleClose}
                title="Add Opportunity"
                subtitle="Create a new deal in your pipeline."
                icon={<AddIcon />}
            >
                <div style={{ padding: '8px 0' }}>
                    <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                        <ContextualFormsPanel
                            placement="OPPORTUNITY_CREATE"
                            context={{ leadId: defaultLeadId ?? null }}
                            onSaved={() => {
                                handleClose();
                                onSuccess();
                            }}
                        />
                    </Box>
                    <OpportunityForm
                        initialData={defaultLeadId ? { leadId: defaultLeadId } : {}}
                        onSuccess={() => {
                            handleClose();
                            onSuccess();
                        }}
                        onCancel={handleClose}
                    />
                </div>
            </StandardDialog>
        </>
    );
}

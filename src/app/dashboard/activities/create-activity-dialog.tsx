'use client';

import React, { useState } from "react";
import {
    Button as MuiButton,
    Box,
} from "@mui/material";
import { History as HistoryIcon } from "@mui/icons-material";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ActivityForm } from "./activity-form";

interface CreateActivityDialogProps {
    onSuccess: () => void;
    defaultLeadId?: string;
    defaultOpportunityId?: string;
    trigger?: React.ReactNode;
    open?: boolean; // Controlled
    onOpenChange?: (open: boolean) => void; // Controlled
}

export function CreateActivityDialog({
    onSuccess,
    defaultLeadId,
    defaultOpportunityId,
    trigger,
    open: controlledOpen,
    onOpenChange: setControlledOpen
}: CreateActivityDialogProps) {
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
                    color="primary"
                    startIcon={<HistoryIcon />}
                    onClick={handleOpen}
                >
                    Log Activity
                </MuiButton>
            )}

            <StandardDialog
                open={open}
                onClose={handleClose}
                title="Log Activity"
                subtitle="Record an interaction with a lead or opportunity"
                icon={<HistoryIcon />}
            >
                <div style={{ padding: '8px 0' }}>
                    <ActivityForm
                        initialData={{
                            leadId: defaultLeadId || "",
                            opportunityId: defaultOpportunityId || ""
                        }}
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

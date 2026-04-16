'use client';

import React, { useState } from "react";
import { Button as MuiButton, Box } from "@mui/material";
import { Add as AddIcon, PersonAdd as PersonAddIcon } from "@mui/icons-material";
import { StandardDialog } from "@/components/common/standard-dialog";
import { LeadForm } from "./lead-form";

interface CreateLeadDialogProps {
    onSuccess: () => void;
    trigger?: React.ReactNode;
    open?: boolean; // Controlled
    onOpenChange?: (open: boolean) => void; // Controlled
}

export function CreateLeadDialog({ onSuccess, trigger, open: controlledOpen, onOpenChange: setControlledOpen }: CreateLeadDialogProps) {
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
                    startIcon={<AddIcon />}
                    onClick={handleOpen}
                >
                    Add Lead
                </MuiButton>
            )}

            <StandardDialog
                open={open}
                onClose={handleClose}
                title="Create New Lead"
                subtitle="Add a new prospect to your pipeline"
                icon={<PersonAddIcon />}
            >
                <LeadForm
                    onSuccess={() => {
                        onSuccess();
                        handleClose();
                    }}
                    onCancel={handleClose}
                />
            </StandardDialog>
        </>
    );
}

"use client";

import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { Opportunity } from "@/types/opportunities";
import { StandardDialog } from "@/components/common/standard-dialog";
import { OpportunityForm } from "./opportunity-form";

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

    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

    const handleClose = () => setOpen(false);

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Edit Opportunity"
            subtitle="Update deal details."
            icon={<Pencil fontSize="small" />}
        >
            <div style={{ padding: '8px 0' }}>
                <OpportunityForm
                    initialData={opportunity}
                    onSuccess={(updated) => {
                        handleClose();
                        onSuccess(updated);
                    }}
                    onCancel={handleClose}
                />
            </div>
        </StandardDialog>
    );
}


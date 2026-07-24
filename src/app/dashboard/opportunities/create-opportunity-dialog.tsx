'use client';

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
                <div onClick={handleOpen}>{trigger}</div>
            ) : (
                <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={handleOpen}>
                    <Plus className="size-4" />
                    Add Opportunity
                </Button>
            )}

            <StandardDialog
                open={open}
                onClose={handleClose}
                title="Add Opportunity"
                subtitle="Create a new deal with an opportunity type and stage."
                icon={<Plus className="size-4" />}
            >
                <div style={{ padding: '8px 0' }}>
                    <div className="mb-2 flex justify-end">
                        <ContextualFormsPanel
                            placement="OPPORTUNITY_CREATE"
                            context={{ leadId: defaultLeadId ?? null }}
                            onSaved={() => {
                                handleClose();
                                onSuccess();
                            }}
                        />
                    </div>
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

'use client';

import React, { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StandardDialog } from "@/components/common/standard-dialog";
import { LeadForm } from "./lead-form";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { Lead } from "@/types/leads";
import { Slot } from "@radix-ui/react-slot";

interface CreateLeadDialogProps {
    onSuccess: () => void;
    trigger?: React.ReactNode;
    open?: boolean; // Controlled
    onOpenChange?: (open: boolean) => void; // Controlled
    initialData?: Partial<Lead>;
}

export function CreateLeadDialog({ onSuccess, trigger, open: controlledOpen, onOpenChange: setControlledOpen, initialData }: CreateLeadDialogProps) {
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
                // Slot, not a wrapping <div onClick>: the trigger keeps its own button semantics and
                // keyboard behaviour (UI/UX plan gap check D6).
                <Slot onClick={handleOpen}>{trigger}</Slot>
            ) : (
                <Button onClick={handleOpen}>
                    <Plus />
                    Create lead
                </Button>
            )}

            <StandardDialog
                open={open}
                onClose={handleClose}
                title="Create lead"
                subtitle="Add a new prospect to your CRM"
                icon={<UserPlus className="size-5" />}
            >
                <div className="mb-2 flex justify-end">
                    <ContextualFormsPanel
                        placement="LEAD_CREATE"
                        context={{}}
                        onSaved={() => {
                            onSuccess();
                            handleClose();
                        }}
                    />
                </div>
                <LeadForm
                    initialData={initialData}
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

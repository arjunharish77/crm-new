
"use client";

import { StandardDialog } from "@/components/common/standard-dialog";
import { Edit as EditIcon } from "@mui/icons-material";
import { LeadForm } from "./lead-form";

import { Lead } from "@/types/leads";

interface EditLeadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lead: Lead;
    onSuccess: () => void;
}

export function EditLeadDialog({ open, onOpenChange, lead, onSuccess }: EditLeadDialogProps) {
    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title="Edit Lead"
            subtitle="Update lead details and classification"
            icon={<EditIcon />}
        >
            <LeadForm
                initialData={lead}
                onSuccess={() => {
                    onSuccess();
                    onOpenChange(false);
                }}
                onCancel={() => onOpenChange(false)}
            />
        </StandardDialog>
    );
}

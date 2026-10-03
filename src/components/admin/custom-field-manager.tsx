"use client";

import { StandardDialog } from "@/components/common/standard-dialog";
import { FieldsEditor } from "@/components/admin/fields-editor";

interface CustomFieldManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityType: "OPPORTUNITY_TYPE" | "ACTIVITY_TYPE";
    relatedTypeId: string;
    relatedTypeName: string;
}

// The fields for one opportunity type or activity type, from that type's settings page. The
// editor itself is the shared one (fields-editor.tsx), used by Settings › Objects & fields too.
export function CustomFieldManager({ open, onOpenChange, entityType, relatedTypeId, relatedTypeName }: CustomFieldManagerProps) {
    return (
        <StandardDialog open={open} onClose={() => onOpenChange(false)} title={`Fields for ${relatedTypeName}`} maxWidth="md">
            {open && relatedTypeId ? (
                <FieldsEditor
                    objectType={entityType === "OPPORTUNITY_TYPE" ? "OPPORTUNITY" : "ACTIVITY"}
                    scope={{ entityType, typeId: relatedTypeId, typeName: relatedTypeName }}
                />
            ) : null}
        </StandardDialog>
    );
}

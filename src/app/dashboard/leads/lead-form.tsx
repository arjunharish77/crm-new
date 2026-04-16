'use client';

import React from "react";
import { Lead } from "@/types/leads";
import { DynamicFormRenderer } from "@/components/common/DynamicFormRenderer";

interface LeadFormProps {
    initialData?: Partial<Lead>;
    onSuccess: () => void;
    onCancel: () => void;
}

export function LeadForm({ initialData, onSuccess, onCancel }: LeadFormProps) {
    return (
        <DynamicFormRenderer
            objectName="lead"
            initialData={initialData}
            onSuccess={onSuccess}
            onCancel={onCancel}
        />
    );
}

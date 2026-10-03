"use client";

import * as React from "react";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusSelect } from "@/components/common/status-select";
import { leadStatusKey, useLeadStatuses } from "@/hooks/use-lead-statuses";

// Lead status with the tenant's own statuses (UI/UX plan decision 6): labels, tones and the
// order admins set in Settings › Lead statuses.
export function LeadStatusBadge({ value, className }: { value: unknown; className?: string }) {
    const { display } = useLeadStatuses();
    const shown = display(value);
    return <StatusBadge tone={shown.tone} label={shown.label} className={className} />;
}

export function LeadStatusSelect({ value, onChange, disabled, ariaLabel, className }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaLabel: string;
    className?: string;
}) {
    const { active, display } = useLeadStatuses();
    // The stored value may be a legacy spelling ("Hot") of a key (HOT); show it as that status.
    const currentKey = leadStatusKey(value);
    const known = active.some((status) => status.key === currentKey);
    return (
        <StatusSelect
            display={display}
            value={known ? currentKey : value}
            options={active.map((status) => status.key)}
            onChange={onChange}
            disabled={disabled}
            ariaLabel={ariaLabel}
            className={className}
        />
    );
}

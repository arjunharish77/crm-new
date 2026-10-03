"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Form primitives (UI/UX plan §11.6 G): a visible label tied to its control, a required marker
// with aria-required, helper text below, and an inline error linked with aria-describedby.
// The child control receives id, aria-required, aria-invalid and aria-describedby.
export function FormField({ id, label, required, help, error, children, className }: {
    id: string;
    label: React.ReactNode;
    required?: boolean;
    help?: React.ReactNode;
    error?: string | null;
    children: React.ReactElement<Record<string, unknown>>;
    className?: string;
}) {
    const helpId = help ? `${id}-help` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
    const control = React.cloneElement(children, {
        id,
        "aria-required": required || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
    });
    return (
        <div className={cn("space-y-1.5", className)}>
            <Label htmlFor={id}>
                {label}
                {required ? <span aria-hidden className="text-destructive"> *</span> : null}
            </Label>
            {control}
            {error ? <p id={errorId} className="text-xs text-destructive">{error}</p> : null}
            {help ? <p id={helpId} className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
    );
}

// After a failed submit: a summary of what to fix, each item linking to its field, and focus
// moved here so keyboard and screen-reader users land on it.
export function ErrorSummary({ errors, title = "Fix these before saving" }: {
    errors: Array<{ fieldId: string; message: string }>;
    title?: string;
}) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (errors.length) ref.current?.focus();
    }, [errors.length]);
    if (!errors.length) return null;
    return (
        <div ref={ref} tabIndex={-1} role="alert" className="rounded-lg border border-status-danger bg-status-danger/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="font-medium">{title}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {errors.map((error) => (
                    <li key={error.fieldId}>
                        <a
                            href={`#${error.fieldId}`}
                            onClick={(event) => { event.preventDefault(); document.getElementById(error.fieldId)?.focus(); }}
                            className="underline underline-offset-2"
                        >
                            {error.message}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}

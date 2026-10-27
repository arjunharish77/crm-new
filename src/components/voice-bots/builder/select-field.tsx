"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// A labelled dropdown (UI/UX plan §11.6 G): the label points at the trigger, which carries the
// required, invalid and described-by attributes. FormField can't do this for a Select, whose
// root element takes no id.
export function SelectField({ id, label, required, help, error, value, onValueChange, placeholder, disabled, className, triggerClassName, children }: {
    id: string;
    label: React.ReactNode;
    required?: boolean;
    help?: React.ReactNode;
    error?: string | null;
    value: string | undefined;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    triggerClassName?: string;
    children: React.ReactNode;
}) {
    const helpId = help ? `${id}-help` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    return (
        <div className={cn("space-y-1.5", className)}>
            <Label htmlFor={id}>{label}{required ? <span aria-hidden className="text-destructive"> *</span> : null}</Label>
            <Select value={value} onValueChange={onValueChange} disabled={disabled}>
                <SelectTrigger id={id} className={cn("w-full", triggerClassName)} aria-required={required || undefined} aria-invalid={error ? true : undefined} aria-describedby={[errorId, helpId].filter(Boolean).join(" ") || undefined}>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>{children}</SelectContent>
            </Select>
            {error ? <p id={errorId} className="text-xs text-destructive">{error}</p> : null}
            {help ? <p id={helpId} className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
    );
}

"use client";

import { useRef } from "react";
import { Braces } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { findMalformedPlaceholders, placeholdersOutsideDetails } from "@/lib/voice-bot-placeholders";

// A text box for what the bot says or follows, with "Insert detail" for the caller details the
// bot was given ({{lead.name}}), and a note for placeholders that would always be empty.
export function PlaceholderTextarea({ id, label, value, onChange, rows = 3, maxLength, help, placeholder, details, required, error }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    maxLength: number;
    help?: string;
    placeholder?: string;
    details: Array<{ key: string; label: string }>;
    required?: boolean;
    error?: string | null;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const insert = (key: string) => {
        const token = `{{${key}}}`;
        const element = ref.current;
        const start = element?.selectionStart ?? value.length;
        const end = element?.selectionEnd ?? value.length;
        const next = `${value.slice(0, start)}${token}${value.slice(end)}`.slice(0, maxLength);
        onChange(next);
        requestAnimationFrame(() => {
            element?.focus();
            element?.setSelectionRange(start + token.length, start + token.length);
        });
    };
    const malformed = findMalformedPlaceholders(value);
    const missing = placeholdersOutsideDetails(value, details.map((detail) => detail.key));
    const helpId = `${id}-help`;
    const noteId = `${id}-note`;
    const errorId = `${id}-error`;
    const note = malformed.length
        ? `${malformed.join(", ")} isn't a valid placeholder. Use the form {{lead.name}}.`
        : missing.length
            ? `${missing.map((key) => `{{${key}}}`).join(", ")} will be empty: add ${missing.length === 1 ? "it" : "them"} to Caller details in Basics.`
            : null;
    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <Label htmlFor={id}>{label}{required ? <span aria-hidden className="text-destructive"> *</span> : null}</Label>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="xs" disabled={!details.length} aria-label={`Insert a caller detail into ${label}`}>
                            <Braces className="size-3.5" aria-hidden />Insert detail
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                        <DropdownMenuLabel>Caller details</DropdownMenuLabel>
                        {details.map((detail) => (
                            <DropdownMenuItem key={detail.key} onSelect={() => insert(detail.key)}>
                                <span className="truncate">{detail.label}</span>
                                <span className="ml-auto pl-3 font-mono text-xs text-muted-foreground">{`{{${detail.key}}}`}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <Textarea
                ref={ref}
                id={id}
                rows={rows}
                maxLength={maxLength}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                aria-required={required || undefined}
                aria-invalid={error || malformed.length ? true : undefined}
                aria-describedby={[error ? errorId : null, note ? noteId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined}
            />
            {error ? <p id={errorId} className="text-xs text-destructive">{error}</p> : null}
            {note ? <p id={noteId} className={malformed.length ? "text-xs text-destructive" : "text-xs text-status-warning-foreground"}>{note}</p> : null}
            {help ? <p id={helpId} className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
    );
}

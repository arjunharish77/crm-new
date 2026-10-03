"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StandardDialog } from "@/components/common/standard-dialog";

export type ReasonRequest = {
    title: string;
    description?: string;
    label: string;
    confirmLabel: string;
    placeholder?: string;
    defaultValue?: string;
    required?: boolean;
    destructive?: boolean;
    // One-line input (names) instead of a multi-line text area (notes, reasons).
    singleLine?: boolean;
    // Returns an error message to show under the field, or null when the value is fine.
    validate?: (value: string) => string | null;
};

type Pending = ReasonRequest & { resolve: (value: string | null) => void };

// Replaces window.prompt for "name / notes / reason" steps before an action (UI/UX plan B1). The
// browser prompt returns null on Cancel, and callers used to turn that into "no notes" and go
// ahead anyway. Here Cancel, Escape and closing the dialog all resolve to null, and the caller
// must stop; Confirm resolves to the trimmed text.
//
//   const [reasonDialog, askReason] = useReasonDialog();
//   const notes = await askReason({ title: "Publish version", label: "Publish notes (optional)", confirmLabel: "Publish" });
//   if (notes === null) return;
//
// Or, without rendering anything, `const askText = useAskText()` from common/dialogs-provider.
export function useReasonDialog(): [React.ReactNode, (request: ReasonRequest) => Promise<string | null>] {
    const [pending, setPending] = React.useState<Pending | null>(null);
    const [value, setValue] = React.useState("");

    const ask = React.useCallback((request: ReasonRequest) => new Promise<string | null>((resolve) => {
        setValue(request.defaultValue ?? "");
        setPending((current) => {
            current?.resolve(null);
            return { ...request, resolve };
        });
    }), []);

    const finish = (result: string | null) => {
        pending?.resolve(result);
        setPending(null);
    };

    const trimmed = value.trim();
    const error = pending?.validate && trimmed ? pending.validate(trimmed) : null;
    const blocked = (!!pending?.required && !trimmed) || !!error;
    const submit = () => { if (!blocked) finish(trimmed); };

    const element = (
        <StandardDialog
            open={!!pending}
            onClose={() => finish(null)}
            title={pending?.title ?? ""}
            subtitle={pending?.description}
            maxWidth="xs"
            actions={
                <>
                    <Button variant="outline" onClick={() => finish(null)}>Cancel</Button>
                    <Button variant={pending?.destructive ? "destructive" : "default"} disabled={blocked} onClick={submit}>
                        {pending?.confirmLabel}
                    </Button>
                </>
            }
        >
            <div className="space-y-1.5 pb-1">
                <Label htmlFor="reason-dialog-input">{pending?.label}</Label>
                {pending?.singleLine ? (
                    <Input
                        id="reason-dialog-input"
                        value={value}
                        placeholder={pending?.placeholder}
                        aria-invalid={!!error}
                        aria-describedby={error ? "reason-dialog-error" : undefined}
                        onChange={(event) => setValue(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }}
                        autoFocus
                    />
                ) : (
                    <Textarea
                        id="reason-dialog-input"
                        value={value}
                        placeholder={pending?.placeholder}
                        aria-invalid={!!error}
                        aria-describedby={error ? "reason-dialog-error" : undefined}
                        onChange={(event) => setValue(event.target.value)}
                        rows={3}
                        autoFocus
                    />
                )}
                {error ? <p id="reason-dialog-error" className="text-xs text-destructive">{error}</p> : null}
            </div>
        </StandardDialog>
    );

    return [element, ask];
}

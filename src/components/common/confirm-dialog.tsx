"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StandardDialog } from "@/components/common/standard-dialog";

export type ConfirmRequest = {
    title: string;
    description?: string;
    body?: React.ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
    // Irreversible actions (UI/UX plan decision 31): the confirm button stays disabled until the
    // user types this text exactly, for example the record name or "DELETE 120".
    typedConfirmation?: string;
};

type Pending = ConfirmRequest & { resolve: (confirmed: boolean) => void };

// Confirmation step for actions with real side effects. Resolves true only on the confirm
// button; Cancel, Escape and closing resolve false.
//
//   const [confirmDialog, askConfirm] = useConfirmDialog();
//   if (!(await askConfirm({ title: "Launch campaign?", confirmLabel: "Send to 120 recipients" }))) return;
//   ...
//   return <>{confirmDialog}...</>;
//
// Or, without rendering anything, `const confirm = useConfirm()` from common/dialogs-provider.
export function useConfirmDialog(): [React.ReactNode, (request: ConfirmRequest) => Promise<boolean>] {
    const [pending, setPending] = React.useState<Pending | null>(null);
    const [typed, setTyped] = React.useState("");

    const ask = React.useCallback((request: ConfirmRequest) => new Promise<boolean>((resolve) => {
        setTyped("");
        setPending((current) => {
            current?.resolve(false);
            return { ...request, resolve };
        });
    }), []);

    const finish = (confirmed: boolean) => {
        pending?.resolve(confirmed);
        setPending(null);
    };

    const needsTyping = !!pending?.typedConfirmation;
    const typedOk = !needsTyping || typed.trim() === pending?.typedConfirmation;

    const element = (
        <StandardDialog
            open={!!pending}
            onClose={() => finish(false)}
            title={pending?.title ?? ""}
            subtitle={pending?.description}
            maxWidth="xs"
            actions={
                <>
                    <Button variant="outline" onClick={() => finish(false)}>{pending?.cancelLabel ?? "Cancel"}</Button>
                    <Button variant={pending?.destructive ? "destructive" : "default"} disabled={!typedOk} onClick={() => finish(true)}>
                        {pending?.confirmLabel}
                    </Button>
                </>
            }
        >
            {pending?.body || needsTyping ? (
                <div className="space-y-3 pb-1 text-sm">
                    {pending?.body}
                    {needsTyping ? (
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm-dialog-typed">
                                Type <span className="font-mono font-semibold">{pending?.typedConfirmation}</span> to confirm
                            </Label>
                            <Input
                                id="confirm-dialog-typed"
                                value={typed}
                                autoComplete="off"
                                autoFocus
                                onChange={(event) => setTyped(event.target.value)}
                                onKeyDown={(event) => { if (event.key === "Enter" && typedOk) finish(true); }}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </StandardDialog>
    );

    return [element, ask];
}

"use client";

import React from "react";
import { X as CloseIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { EditorDismissContext } from "@/hooks/use-editor-dismiss-guard";
import { cn } from "@/lib/utils";

type SheetSize = "md" | "lg" | "xl";

// Right-side sheet for editing one item (UI/UX plan §11.6 C): 480px, or 640–800px for rule
// builders. Sticky footer for actions, the same unsaved-changes guard as StandardDialog
// (editors register with useEditorDismissGuard), and focus goes back to the opener on close.
const SIZE_CLASS: Record<SheetSize, string> = {
    md: "sm:max-w-[480px]",
    lg: "sm:max-w-[640px]",
    xl: "sm:max-w-[800px]",
};

export function StandardSheet({ open, onClose, title, description, actions, size = "md", children }: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    actions?: React.ReactNode;
    size?: SheetSize;
    children: React.ReactNode;
}) {
    const openerRef = React.useRef<HTMLElement | null>(null);
    const guards = React.useRef(new Set<() => boolean>());
    const register = React.useCallback((guard: () => boolean) => {
        guards.current.add(guard);
        return () => { guards.current.delete(guard); };
    }, []);
    const requestClose = () => {
        for (const guard of guards.current) if (!guard()) return;
        onClose();
    };
    return (
        <EditorDismissContext.Provider value={register}>
            <Sheet open={open} onOpenChange={(next) => !next && requestClose()}>
                <SheetContent
                    side="right"
                    showCloseButton={false}
                    onOpenAutoFocus={() => {
                        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    }}
                    onCloseAutoFocus={(event) => {
                        if (openerRef.current?.isConnected) {
                            event.preventDefault();
                            openerRef.current.focus();
                        }
                    }}
                    className={cn("flex w-full flex-col gap-0 p-0", SIZE_CLASS[size])}
                >
                    <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                        <div className="min-w-0">
                            <SheetTitle className="break-words text-lg font-semibold leading-tight">{title}</SheetTitle>
                            {description ? <SheetDescription className="mt-0.5 break-words text-sm">{description}</SheetDescription> : null}
                        </div>
                        <button type="button" onClick={requestClose} aria-label="Close" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <CloseIcon className="size-4" />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
                    {actions ? <div className="flex flex-wrap justify-end gap-2 border-t bg-card px-5 py-3">{actions}</div> : null}
                </SheetContent>
            </Sheet>
        </EditorDismissContext.Provider>
    );
}

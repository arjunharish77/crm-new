"use client";

import React from "react";
import { X as CloseIcon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { EditorDismissContext } from "@/hooks/use-editor-dismiss-guard";
import { cn } from "@/lib/utils";

// No "xl" (1536px): anything that big becomes its own page (UI/UX plan §11.6 C).
type DialogMaxWidth = "xs" | "sm" | "md" | "lg";

interface StandardDialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    actions?: React.ReactNode;
    maxWidth?: DialogMaxWidth;
    fullWidth?: boolean;
}

// Dialog widths: xs 444px, sm 600px, md 900px, lg 1200px, never wider than the window.
const MAX_WIDTH_CLASS: Record<DialogMaxWidth, string> = {
    xs: "sm:max-w-[min(444px,calc(100dvw-2rem))]",
    sm: "sm:max-w-[min(600px,calc(100dvw-2rem))]",
    md: "sm:max-w-[min(900px,calc(100dvw-2rem))]",
    lg: "sm:max-w-[min(1200px,calc(100dvw-2rem))]",
};

export function StandardDialog({
    open,
    onClose,
    title,
    subtitle,
    icon,
    children,
    actions,
    maxWidth = "sm",
    fullWidth = true,
}: StandardDialogProps) {
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
        <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
            <DialogContent
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
                className={cn(MAX_WIDTH_CLASS[maxWidth], fullWidth ? "w-[calc(100dvw-2rem)]" : "w-fit", "min-w-0 grid-cols-[minmax(0,1fr)] max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] p-0 gap-0 overflow-hidden rounded-xl")}
            >
                <div className="flex min-w-0 items-center justify-between gap-3 p-[18px] pb-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                        {icon && (
                            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                                {icon}
                            </div>
                        )}
                        <div className="min-w-0">
                            <DialogTitle className="min-w-0 break-words text-lg font-semibold leading-tight">
                                {title}
                            </DialogTitle>
                            {subtitle && (
                                <DialogDescription className="mt-0.5 break-words">{subtitle}</DialogDescription>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        aria-label="Close"
                        className="shrink-0 rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-foreground/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <CloseIcon className="size-4" />
                    </button>
                </div>

                <div className={cn("min-h-0 min-w-0 px-4 overflow-y-auto overscroll-contain", actions ? "pb-3" : "pb-[18px]", "pt-0.5")}>
                    {children}
                </div>

                {actions && (
                    <DialogFooter className="gap-1.5 px-[18px] pb-[18px] sm:flex-row sm:justify-end">
                        {actions}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
        </EditorDismissContext.Provider>
    );
}

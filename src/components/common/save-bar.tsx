"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The settings save bar (UI/UX plan §11.6, "Settings form"): appears only when there are
// unsaved changes, with Discard and Save, and the browser asks before you close or reload the
// tab with changes unsaved.
export function SaveBar({ dirty, saving, onSave, onDiscard, message = "You have unsaved changes", saveLabel = "Save changes", className }: {
    dirty: boolean;
    saving?: boolean;
    onSave: () => void;
    onDiscard: () => void;
    message?: string;
    saveLabel?: string;
    className?: string;
}) {
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    if (!dirty && !saving) return null;
    return (
        <div role="region" aria-label="Unsaved changes" className={cn("sticky bottom-4 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-menu", className)}>
            <p className="text-sm font-medium" aria-live="polite">{message}</p>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onDiscard} disabled={saving}>Discard</Button>
                <Button onClick={onSave} isLoading={saving}>{saveLabel}</Button>
            </div>
        </div>
    );
}

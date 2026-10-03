"use client";

import React from "react";
import { Inbox, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    // "page" fills an empty list or panel; "inline" sits inside a section or table body.
    variant?: "page" | "inline";
    // "no-match": filters or search found nothing (the action is usually "Clear filters").
    kind?: "empty" | "no-match";
    className?: string;
}

// Neutral by design (UI/UX plan rule R1: one accent): a grey icon tile, a 16px title and one
// action at most. role="status" is a polite live region, so a screen-reader user hears
// "no results" once things settle, without interrupting like an alert would.
export function EmptyState({ icon, title, description, action, variant = "page", kind = "empty", className }: EmptyStateProps) {
    const inline = variant === "inline";
    return (
        <div
            role="status"
            className={cn("flex flex-col items-center justify-center text-center", inline ? "gap-2 px-4 py-8" : "gap-3 px-8 py-16", className)}
        >
            <div
                className={cn(
                    "flex items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:!size-5 [&_svg]:!text-muted-foreground [&_svg]:!opacity-100",
                    inline ? "size-10" : "size-12",
                )}
                aria-hidden
            >
                {icon || (kind === "no-match" ? <SearchX /> : <Inbox />)}
            </div>
            <div className="space-y-1">
                <h3 className={cn("font-semibold text-foreground", inline ? "text-sm" : "text-base")}>{title}</h3>
                {description && <p className="mx-auto max-w-[420px] text-sm text-muted-foreground">{description}</p>}
            </div>
            {action ? <div className="mt-1">{action}</div> : null}
        </div>
    );
}

"use client";

import React from "react";
import { AlertTriangle, Lock, Puzzle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
    // An extra way out, e.g. a "Go to dashboard" link.
    action?: React.ReactNode;
    // "error": loading failed; "permission": the user can't see this; "module": the module is off.
    kind?: "error" | "permission" | "module";
    variant?: "page" | "inline";
    className?: string;
}

const DEFAULTS = {
    error: { icon: AlertTriangle, title: "Something went wrong", description: "This couldn't be loaded." },
    permission: { icon: Lock, title: "You don't have access", description: "Ask an admin for access to this page." },
    module: { icon: Puzzle, title: "This module isn't turned on", description: "Ask an admin to turn it on in Settings › Modules." },
};

// Sibling to EmptyState, so a failed load reads differently from "nothing here". role="alert"
// announces a failure immediately to screen-reader users; permission and module notices are
// steady states, so they use a polite status instead.
export function ErrorState({ title, description, onRetry, action, kind = "error", variant = "page", className }: ErrorStateProps) {
    const preset = DEFAULTS[kind];
    const Icon = preset.icon;
    const inline = variant === "inline";

    if (inline) {
        return (
            <div
                role={kind === "error" ? "alert" : "status"}
                className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-status-danger bg-status-danger/40 px-3 py-2 text-sm", kind !== "error" && "border-border bg-muted", className)}
            >
                <Icon className={cn("size-4 shrink-0", kind === "error" ? "text-status-danger-foreground" : "text-muted-foreground")} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="font-medium">{title ?? preset.title}.</span> {description ?? preset.description}
                </span>
                {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="size-4" />Try again</Button>}
                {action}
            </div>
        );
    }

    return (
        <div role={kind === "error" ? "alert" : "status"} className={cn("flex flex-col items-center justify-center gap-3 px-8 py-16 text-center", className)}>
            <div
                aria-hidden
                className={cn("flex size-12 items-center justify-center rounded-full", kind === "error" ? "bg-status-danger text-status-danger-foreground" : "bg-muted text-muted-foreground")}
            >
                <Icon className="size-5" />
            </div>
            <div className="space-y-1">
                <h3 className="text-base font-semibold">{title ?? preset.title}</h3>
                <p className="mx-auto max-w-[420px] text-sm text-muted-foreground">{description ?? preset.description}</p>
            </div>
            {(onRetry || action) && (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                    {onRetry && (
                        <Button variant="outline" onClick={onRetry}>
                            <RefreshCw className="size-4" />
                            Try again
                        </Button>
                    )}
                    {action}
                </div>
            )}
        </div>
    );
}

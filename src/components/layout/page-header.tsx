import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared page composition: content may wrap, actions never widen the workspace. */
export function PageHeader({ title, description, actions, className }: {
    title: string; description?: string; actions?: ReactNode; className?: string;
}) {
    return (
        <div data-slot="page-header" className={cn("mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3", className)}>
            <div className="min-w-0 flex-1 basis-60">
                <h1 className="break-words text-2xl font-semibold leading-8 tracking-tight">{title}</h1>
                {description && <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

import * as React from "react";
import { cn } from "@/lib/utils";

// A titled region without a box (UI/UX plan §11.7, rule R2: one container level). Sections are
// separated by dividers, not nested cards. `layout="split"` puts the title and help on the
// left and the controls on the right (the settings page template).
export function Section({ title, description, actions, layout = "stacked", children, className, id }: {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    layout?: "stacked" | "split";
    children: React.ReactNode;
    className?: string;
    id?: string;
}) {
    const headingId = id ? `${id}-heading` : undefined;
    const heading = (
        <div className="min-w-0 space-y-1">
            <h2 id={headingId} className="text-base font-semibold">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
    );
    if (layout === "split") {
        return (
            <section id={id} aria-labelledby={headingId} className={cn("grid gap-4 border-b py-6 last:border-b-0 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-8", className)}>
                <div className="space-y-3">{heading}{actions}</div>
                <div className="min-w-0 space-y-4">{children}</div>
            </section>
        );
    }
    return (
        <section id={id} aria-labelledby={headingId} className={cn("space-y-4 border-b py-6 first:pt-0 last:border-b-0", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">{heading}{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}</div>
            {children}
        </section>
    );
}

// Label/value rows (record details, summaries). Empty values show "—" (rule N).
export function DescriptionList({ items, columns = 1, compact, className }: {
    items: Array<{ label: string; value: React.ReactNode }>;
    columns?: 1 | 2;
    // Narrow columns (a record's summary): a shorter label column, values right-aligned.
    compact?: boolean;
    className?: string;
}) {
    return (
        <dl className={cn("grid gap-x-6", columns === 2 ? "sm:grid-cols-2" : "grid-cols-1", className)}>
            {items.map((item) => (
                <div key={item.label} className={cn("flex min-w-0 border-b last:border-b-0", compact ? "items-baseline justify-between gap-3 py-2" : "flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4")}>
                    <dt className={cn("shrink-0 text-sm text-muted-foreground", compact ? "" : "sm:w-40")}>{item.label}</dt>
                    <dd className={cn("min-w-0 break-words text-sm", compact && "text-right")}>{item.value === null || item.value === undefined || item.value === "" ? "—" : item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

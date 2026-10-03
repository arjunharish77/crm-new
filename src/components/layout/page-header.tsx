"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PageHeaderMenuItem = {
    label: string;
    onSelect: () => void;
    icon?: ReactNode;
    destructive?: boolean;
    disabled?: boolean;
    separatorBefore?: boolean;
};

// Shared page heading. The header budget (UI/UX plan rule R5): a title, an optional one-line
// description, one primary action, at most two secondary actions, and everything else in the
// "More" menu. `actions` is kept for pages not yet moved to the slots.
export function PageHeader({ title, description, actions, primaryAction, secondaryActions, menuItems, meta, backHref, backLabel = "Back", className }: {
    title: string;
    description?: string;
    actions?: ReactNode;
    primaryAction?: ReactNode;
    secondaryActions?: ReactNode;
    menuItems?: PageHeaderMenuItem[];
    // A short line under the title for status or counts ("1,201 leads", a status pill).
    meta?: ReactNode;
    backHref?: string;
    backLabel?: string;
    className?: string;
}) {
    const hasMenu = !!menuItems?.length;
    const hasActions = actions || primaryAction || secondaryActions || hasMenu;
    return (
        <div data-slot="page-header" className={cn("mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3", className)}>
            <div className="min-w-0 flex-1 basis-60">
                {backHref ? (
                    <Link href={backHref} className="mb-1 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <ArrowLeft className="size-4" aria-hidden />
                        {backLabel}
                    </Link>
                ) : null}
                <h1 className="break-words text-2xl font-semibold leading-8">{title}</h1>
                {description && <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>}
                {meta ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div> : null}
            </div>
            {hasActions && (
                <div className="flex max-w-full flex-wrap items-center gap-2">
                    {actions}
                    {secondaryActions}
                    {hasMenu ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" aria-label="More actions">
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {menuItems!.map((item) => (
                                    <Fragment key={item.label}>
                                        {item.separatorBefore ? <DropdownMenuSeparator /> : null}
                                        <DropdownMenuItem variant={item.destructive ? "destructive" : "default"} disabled={item.disabled} onSelect={item.onSelect}>
                                            {item.icon}
                                            {item.label}
                                        </DropdownMenuItem>
                                    </Fragment>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                    {primaryAction}
                </div>
            )}
        </div>
    );
}

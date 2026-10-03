"use client";

// Sticky record header (UI/UX plan §10.5, decision 7): back · name · status · owner on the left,
// the record's quick actions on the right, and everything else in "More". It stays opaque, so
// the timeline never shows through it when scrolled.
import { Fragment, useId, useState } from "react";
import { ArrowLeft, ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type DetailMenuItem = {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  destructive?: boolean;
  separatorBefore?: boolean;
  hidden?: boolean;
};

export function DetailPageHeader({
  title,
  subtitle,
  statusBadge,
  meta,
  onBack,
  backLabel = "Back",
  actions,
  primaryAction,
  quickActions,
  menuItems,
  mobileActionBar,
}: {
  title: string;
  subtitle?: React.ReactNode;
  statusBadge?: React.ReactNode;
  // Inline controls next to the name: status and owner pickers.
  meta?: React.ReactNode;
  onBack: () => void;
  backLabel?: string;
  // Older pages: a row of extra actions behind "More actions". New pages use menuItems.
  actions?: React.ReactNode;
  primaryAction?: React.ReactNode;
  quickActions?: React.ReactNode;
  menuItems?: DetailMenuItem[];
  // The page shows its own bottom action bar on phones; quick actions and "More" hide there.
  mobileActionBar?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  const visibleItems = (menuItems ?? []).filter((item) => !item.hidden);
  return (
    <div className="sticky top-[var(--app-header-offset,56px)] z-20 -mx-2.5 mb-4 border-b bg-background px-2.5 py-2 md:-mx-4 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={backLabel} className="shrink-0 text-muted-foreground">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 title={title} className="truncate text-lg font-semibold leading-tight">{title}</h1>
              {statusBadge}
              {meta}
            </div>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {primaryAction}
          {/* Phones use the record's bottom action bar instead (decision 10). */}
          {quickActions ? <div className={mobileActionBar ? "hidden flex-wrap items-center gap-2 md:flex" : "contents"}>{quickActions}</div> : null}
          {visibleItems.length ? (
            <div className={mobileActionBar ? "hidden md:block" : "contents"}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                  <span className="hidden sm:inline">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {visibleItems.map((item) => (
                  <Fragment key={item.label}>
                    {item.separatorBefore ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem variant={item.destructive ? "destructive" : "default"} onSelect={item.onSelect}>
                      {item.icon}
                      {item.label}
                    </DropdownMenuItem>
                  </Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          ) : null}
          {actions ? (
            <Button variant="outline" size="sm" aria-expanded={expanded} aria-controls={actionsId} onClick={() => setExpanded(!expanded)}>
              More actions <ChevronDown className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {actions ? <div id={actionsId} className={expanded ? "mt-2 flex flex-wrap items-center gap-2 border-t pt-3" : "hidden"}>{actions}</div> : null}
    </div>
  );
}

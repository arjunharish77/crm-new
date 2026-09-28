"use client";

// Gap checklist Module 10's "detail-page productivity shell" item, "sticky record header" --
// previously the Lead/Opportunity detail pages each had their own independently hand-rolled,
// non-sticky top action bar (back button + quick actions), with the record's own name/status
// only visible in the sidebar's identity card, which is itself only sticky at the `lg:` desktop
// breakpoint. This gives both detail pages a genuinely sticky header, with the record's
// identity, for the first time on every viewport size (not just desktop).
import { useId, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DetailPageHeader({
  title,
  subtitle,
  statusBadge,
  onBack,
  actions,
  primaryAction,
}: {
  title: string;
  subtitle?: React.ReactNode;
  statusBadge?: React.ReactNode;
  onBack: () => void;
  actions: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  return (
    <div className="sticky top-[var(--app-header-offset,56px)] z-20 -mx-2.5 mb-4 border-b bg-background/95 px-2.5 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-4 md:px-4">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            onClick={onBack}
            className="h-[34px] shrink-0 rounded-[10px] px-3 text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <div className="min-w-0 border-l pl-2.5">
            <div className="flex items-center gap-2">
              <h1 title={title} className="truncate text-lg font-semibold leading-tight">{title}</h1>
              {statusBadge}
            </div>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {primaryAction}
          <Button variant="outline" size="sm" aria-expanded={expanded} aria-controls={actionsId} onClick={() => setExpanded(!expanded)}>
            More actions <ChevronDown className="size-4" />
          </Button>
        </div>
        <div id={actionsId} className={expanded ? "flex flex-wrap items-center gap-2 border-t pt-3" : "hidden"}>{actions}</div>
      </div>
    </div>
  );
}

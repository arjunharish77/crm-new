"use client";

// Gap checklist Module 10's "detail-page productivity shell" item, "compact related-record
// previews" -- distinct from the pre-existing `RecordPreview` (a full side Sheet, Lead-only,
// wired into the Leads LIST page's own "quick view" action). This is deliberately smaller: a
// click-triggered popover (this design system has no hover-card primitive, and hover has no
// touch-device equivalent anyway) for wrapping a BARE related-record mention that today has no
// link or preview at all -- e.g. Tasks' "Lead: {name}" / "Opportunity: {title}" plain text.
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

type PreviewEntityType = "lead" | "opportunity";

const PAGE_PATHS: Record<PreviewEntityType, string> = {
  lead: "/dashboard/leads",
  opportunity: "/dashboard/opportunities",
};

const API_PATHS: Record<PreviewEntityType, string> = {
  lead: "/leads",
  opportunity: "/opportunities",
};

export function RecordPreviewPopover({
  entityType,
  entityId,
  children,
}: {
  entityType: PreviewEntityType;
  entityId: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = () => {
    if (loaded || loading) return;
    setLoading(true);
    setError(false);
    apiFetch(`${API_PATHS[entityType]}/${entityId}`)
      .then((result) => {
        if (!result) {
          setError(true);
          return;
        }
        setData(result);
        setLoaded(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  return (
    <Popover onOpenChange={(open) => { if (open) load(); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground">Failed to load preview.</p>
        ) : entityType === "lead" ? (
          <div className="space-y-1.5">
            <p className="font-bold leading-tight">{data.name}</p>
            <Badge variant="outline" className="text-[0.65rem] font-semibold uppercase">{data.status}</Badge>
            <p className="text-xs text-muted-foreground">{data.email || "No email"}</p>
            <p className="text-xs text-muted-foreground">{data.company || "No company"}</p>
            <p className="text-xs text-muted-foreground">Score: {data.score ?? 0}</p>
            <Button asChild size="sm" variant="outline" className="mt-2 w-full">
              <Link href={`${PAGE_PATHS.lead}/${data.id}`}>
                <ExternalLink className="size-3.5" />
                Open Lead
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="font-bold leading-tight">{data.title}</p>
            {data.stage?.label ? <Badge variant="outline" className="text-[0.65rem] font-semibold uppercase">{data.stage.label}</Badge> : null}
            <p className="text-xs text-muted-foreground">{formatCurrency(data.amount ?? 0)}</p>
            <Button asChild size="sm" variant="outline" className="mt-2 w-full">
              <Link href={`${PAGE_PATHS.opportunity}/${data.id}`}>
                <ExternalLink className="size-3.5" />
                Open Opportunity
              </Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

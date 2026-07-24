"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Download, Files, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type QueueExportButtonProps = {
  moduleName: "LEADS" | "OPPORTUNITIES" | "ACTIVITIES" | "TASKS" | "PARTNERS" | "PAYOUTS" | "REPORTS" | "FORMS";
  filters?: Record<string, unknown>;
  columns?: string[];
  selectedIds?: string[];
  currentPageIds?: string[];
  totalItems?: number;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
};

type ExportScope = "SELECTED" | "CURRENT_PAGE" | "FULL_VIEW";

const SCOPE_LABELS: Record<ExportScope, string> = {
  SELECTED: "Selected rows",
  CURRENT_PAGE: "Current page",
  FULL_VIEW: "All matching this view",
};

const SCOPE_DESCRIPTIONS: Record<ExportScope, string> = {
  SELECTED: "Only the rows checked in this page.",
  CURRENT_PAGE: "Only the rows currently visible here.",
  FULL_VIEW: "Every record matching the current filters.",
};

function cleanIds(ids?: string[]) {
  return Array.from(new Set((ids ?? []).map((id) => String(id)).filter(Boolean)));
}

export function QueueExportButton({
  moduleName,
  filters = {},
  columns = [],
  selectedIds,
  currentPageIds,
  totalItems,
  label = "Export",
  size,
  variant = "outline",
  disabled = false,
}: QueueExportButtonProps) {
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => cleanIds(selectedIds), [selectedIds]);
  const currentPage = React.useMemo(() => cleanIds(currentPageIds), [currentPageIds]);
  const hasScopedChoices = selected.length > 0 || currentPage.length > 0;
  const defaultScope: ExportScope = selected.length > 0 ? "SELECTED" : currentPage.length > 0 ? "CURRENT_PAGE" : "FULL_VIEW";
  const [scope, setScope] = React.useState<ExportScope>(defaultScope);

  React.useEffect(() => {
    setScope((current) => {
      if (current === "SELECTED" && selected.length === 0) return defaultScope;
      if (current === "CURRENT_PAGE" && currentPage.length === 0) return defaultScope;
      return current;
    });
  }, [currentPage.length, defaultScope, selected.length]);

  const scopeCount = (candidate: ExportScope) => {
    if (candidate === "SELECTED") return selected.length;
    if (candidate === "CURRENT_PAGE") return currentPage.length;
    return totalItems ?? null;
  };

  const queueExport = async (exportScope: ExportScope = defaultScope) => {
    setLoading(true);
    try {
      const scopedFilters = { ...filters };
      if (exportScope === "SELECTED") scopedFilters.selectedIds = selected;
      if (exportScope === "CURRENT_PAGE") scopedFilters.selectedIds = currentPage;
      await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({
          moduleName,
          filters: scopedFilters,
          columns,
          metadata: {
            exportScope,
            requestedRecordCount: scopeCount(exportScope),
          },
        }),
      });
      setOpen(false);
      toast.success("Export queued", {
        description: `${SCOPE_LABELS[exportScope]} export is being prepared.`,
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = "/dashboard/exports";
          },
        },
      });
    } catch (error: any) {
      toast.error(error?.message || "Could not queue export");
    } finally {
      setLoading(false);
    }
  };

  if (!hasScopedChoices) {
    return (
      <Button type="button" variant={variant} size={size} onClick={() => queueExport("FULL_VIEW")} disabled={disabled || loading}>
        <Download className="size-4" />
        {loading ? "Queuing..." : label}
      </Button>
    );
  }

  const scopeOptions = (["SELECTED", "CURRENT_PAGE", "FULL_VIEW"] as ExportScope[]).filter((option) => {
    if (option === "SELECTED") return selected.length > 0;
    if (option === "CURRENT_PAGE") return currentPage.length > 0;
    return true;
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant={variant} size={size} disabled={disabled || loading}>
          <Download className="size-4" />
          {loading ? "Queuing..." : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-3">
        <div className="mb-3">
          <h3 className="text-sm font-bold">Export scope</h3>
          <p className="text-xs text-muted-foreground">Choose exactly which records should go into the CSV.</p>
        </div>
        <RadioGroup value={scope} onValueChange={(value) => setScope(value as ExportScope)} className="gap-2">
          {scopeOptions.map((option) => {
            const count = scopeCount(option);
            const Icon = option === "SELECTED" ? ListChecks : option === "CURRENT_PAGE" ? Files : CheckCircle2;
            return (
              <Label
                key={option}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value={option} className="mt-1" />
                <Icon className="mt-0.5 size-4 text-primary" />
                <span className="grid flex-1 gap-1">
                  <span className="flex items-center justify-between gap-3 text-sm font-bold">
                    {SCOPE_LABELS[option]}
                    {count !== null ? <span className="text-xs text-muted-foreground">{count.toLocaleString()}</span> : null}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{SCOPE_DESCRIPTIONS[option]}</span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => queueExport(scope)} disabled={loading}>
            <Download className="size-4" />
            Queue export
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ExportHistoryLink() {
  return (
    <Button variant="ghost" asChild>
      <Link href="/dashboard/exports">Export Requests</Link>
    </Button>
  );
}

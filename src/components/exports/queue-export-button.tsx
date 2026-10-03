"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Files, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ExportTemplate = {
  id: string;
  name: string;
  moduleName: string;
  filters: Record<string, unknown>;
  columns: string[];
};

type QueueExportButtonProps = {
  moduleName: "LEADS" | "OPPORTUNITIES" | "ACTIVITIES" | "TASKS" | "PARTNERS" | "PAYOUTS" | "REPORTS" | "FORMS" | "AUDIT_LOGS";
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
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  // XLSX/PDF (gap checklist Module 17, item 19) only render for inbuilt-report exports -- see
  // fetchExportContent in exports.ts. Every other module keeps its existing CSV-only export.
  const supportsAlternateFormat = moduleName === "REPORTS" && filters.reportKind === "INBUILT";
  const [exportFormat, setExportFormat] = React.useState<"CSV" | "XLSX" | "PDF">("CSV");
  const selected = React.useMemo(() => cleanIds(selectedIds), [selectedIds]);
  const currentPage = React.useMemo(() => cleanIds(currentPageIds), [currentPageIds]);
  const hasScopedChoices = selected.length > 0 || currentPage.length > 0;
  const defaultScope: ExportScope = selected.length > 0 ? "SELECTED" : currentPage.length > 0 ? "CURRENT_PAGE" : "FULL_VIEW";
  const [scope, setScope] = React.useState<ExportScope>(defaultScope);
  const [templates, setTemplates] = React.useState<ExportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [templateOverride, setTemplateOverride] = React.useState<{ filters: Record<string, unknown>; columns: string[] } | null>(null);
  const [saveAsTemplateName, setSaveAsTemplateName] = React.useState("");

  React.useEffect(() => {
    if (!open || templates.length > 0) return;
    apiFetch<ExportTemplate[]>("/exports/templates")
      .then((data) => setTemplates((data || []).filter((template) => template.moduleName === moduleName)))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      const effectiveFilters = { ...filters, ...(templateOverride?.filters ?? {}) };
      const effectiveColumns = templateOverride?.columns?.length ? templateOverride.columns : columns;
      if (exportScope === "SELECTED") effectiveFilters.selectedIds = selected;
      if (exportScope === "CURRENT_PAGE") effectiveFilters.selectedIds = currentPage;

      if (saveAsTemplateName.trim()) {
        await apiFetch("/exports/templates", {
          method: "POST",
          body: JSON.stringify({ name: saveAsTemplateName.trim(), moduleName, filters, columns: effectiveColumns }),
        }).catch(() => toast.error("Export will proceed, but saving the template failed"));
      }

      const created = await apiFetch<{ status: string }>("/exports", {
        method: "POST",
        body: JSON.stringify({
          moduleName,
          filters: effectiveFilters,
          columns: effectiveColumns,
          exportType: supportsAlternateFormat ? exportFormat : undefined,
          metadata: {
            exportScope,
            requestedRecordCount: scopeCount(exportScope),
          },
        }),
      });
      setOpen(false);
      setSaveAsTemplateName("");
      setSelectedTemplateId("");
      setTemplateOverride(null);
      toast.success(created.status === "PENDING_APPROVAL" ? "Export queued -- awaiting approval (includes a flagged sensitive field)" : "Export queued", {
        description: `${SCOPE_LABELS[exportScope]} export is being prepared.`,
        action: {
          label: "Open",
          onClick: () => {
            router.push("/dashboard/exports");
          },
        },
      });
    } catch (error: any) {
      toast.error(error?.message || "Could not queue export");
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    setTemplateOverride(template ? { filters: template.filters, columns: template.columns } : null);
  };

  if (!hasScopedChoices) {
    return (
      <div className="flex items-center gap-2">
        {supportsAlternateFormat ? (
          <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as "CSV" | "XLSX" | "PDF")}>
            <SelectTrigger className="h-9 w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CSV">CSV</SelectItem>
              <SelectItem value="XLSX">XLSX</SelectItem>
              <SelectItem value="PDF">PDF</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <Button type="button" variant={variant} size={size} onClick={() => queueExport("FULL_VIEW")} disabled={disabled || loading}>
          <Download className="size-4" />
          {loading ? "Queuing..." : label}
        </Button>
      </div>
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
        {templates.length > 0 && (
          <div className="mb-3 space-y-1.5">
            <Label className="text-xs">Load saved template</Label>
            <Select value={selectedTemplateId || "__none"} onValueChange={(value) => applyTemplate(value === "__none" ? "" : value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
        <div className="mt-3 flex items-center gap-2">
          <Checkbox
            checked={!!saveAsTemplateName}
            onCheckedChange={(checked) => setSaveAsTemplateName(checked ? "My export" : "")}
          />
          <Label className="text-xs font-normal">Save as a reusable template</Label>
        </div>
        {saveAsTemplateName && (
          <Input
            className="mt-1.5"
            value={saveAsTemplateName}
            onChange={(event) => setSaveAsTemplateName(event.target.value)}
            placeholder="Template name"
          />
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          {/* Exports left the main navigation (UI/UX plan decision 27); past exports are here. */}
          <Link href="/dashboard/exports" className="mr-auto rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Your exports
          </Link>
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

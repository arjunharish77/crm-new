"use client";

import { ErrorState } from "@/components/common/error-state";

// Priority Module 12's "product catalog" item 4, "admin catalog management UI." One generic,
// reusable list+create/edit/delete component, parameterized by a field config, shared across
// all 10 named catalog entities (universities, campuses, programs, courses, intakes, fee plans,
// scholarship rules, eligibility rules, application stages, application checklists) rather than
// 10 near-duplicated bespoke components -- every entity's own fields differ, but the actual
// list/dialog/save/delete shape is identical.
import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import type { CatalogEntityKey } from "@/lib/repositories/catalog-postgres";

export type CatalogFieldType = "text" | "textarea" | "number" | "boolean" | "date" | "select";

export type CatalogFieldConfig = {
  key: string;
  label: string;
  type: CatalogFieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string | number | boolean;
};

interface CatalogEntityManagerProps {
  entityKey: CatalogEntityKey;
  // The parent record's id (e.g. a University id, for a "campuses" manager) -- omit entirely
  // for "universities", whose parent (a per-tenant default catalog) is auto-managed server-side.
  parentId?: string | null;
  requiresParent?: boolean;
  fields: CatalogFieldConfig[];
  title: string;
  emptyDescription: string;
  // Optional drill-down affordance: clicking a row (not its Edit/Delete buttons) selects it as
  // the parent context for a nested manager below (e.g. selecting a University shows its own
  // Campuses/Programs; selecting a Program shows its own Courses/Intakes/etc).
  onSelectItem?: (item: any) => void;
  selectedId?: string | null;
}

function singular(label: string) {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

export function CatalogEntityManager({
  entityKey,
  parentId,
  requiresParent = true,
  fields,
  title,
  emptyDescription,
  onSelectItem,
  selectedId,
}: CatalogEntityManagerProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const canLoad = !requiresParent || !!parentId;

  const load = () => {
    if (!canLoad) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (parentId) params.set("parentId", parentId);
    const query = params.toString();
    apiFetch<any[]>(`/catalog/${entityKey}${query ? `?${query}` : ""}`)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(`Could not load ${title.toLowerCase()}.`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey, parentId]);

  const defaultFormData = (): Record<string, unknown> => {
    const defaults: Record<string, unknown> = {};
    for (const field of fields) {
      defaults[field.key] = field.defaultValue ?? (field.type === "boolean" ? false : "");
    }
    return defaults;
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormData(defaultFormData());
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      values[field.key] = item[field.key] ?? (field.type === "boolean" ? false : "");
    }
    setFormData(values);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!String(formData.name ?? "").trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        await apiFetch(`/catalog/${entityKey}/${editingItem.id}`, { method: "PATCH", body: JSON.stringify(formData) });
        toast.success(`${singular(title)} updated`);
      } else {
        await apiFetch(`/catalog/${entityKey}`, { method: "POST", body: JSON.stringify({ ...formData, parentId }) });
        toast.success(`${singular(title)} created`);
      }
      setDialogOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/catalog/${entityKey}/${item.id}`, { method: "DELETE" });
      toast.success(`${singular(title)} deleted`);
      load();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  };

  if (!canLoad) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Select a parent record above to manage {title.toLowerCase()}.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Add {singular(title)}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : loadError ? <ErrorState description={loadError} onRetry={load} /> : items.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} yet`} description={emptyDescription} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const selected = selectedId === item.id;
            const selectable = !!onSelectItem;
            return (
              <div
                key={item.id}
                role={selectable ? "button" : undefined}
                tabIndex={selectable ? 0 : undefined}
                onClick={selectable ? () => onSelectItem!(item) : undefined}
                onKeyDown={selectable ? (event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSelectItem!(item);
                  }
                } : undefined}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3",
                  selectable && "cursor-pointer transition-colors hover:bg-accent",
                  selected && "border-primary bg-primary/5",
                )}
              >
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  {item.description ? <p className="truncate text-xs text-muted-foreground">{item.description}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={(event) => { event.stopPropagation(); openEdit(item); }} aria-label={`Edit ${item.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={(event) => { event.stopPropagation(); handleDelete(item); }} aria-label={`Delete ${item.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StandardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingItem ? `Edit ${singular(title)}` : `Add ${singular(title)}`}
        maxWidth="sm"
        actions={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Saving..." : editingItem ? "Update" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {fields.map((field) => {
            if (field.type === "boolean") {
              return (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!formData[field.key]}
                    onCheckedChange={(checked) => setFormData({ ...formData, [field.key]: !!checked })}
                  />
                  {field.label}
                </label>
              );
            }
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`catalog-field-${field.key}`}>{field.label}</Label>
                {field.type === "textarea" ? (
                  <Textarea
                    id={`catalog-field-${field.key}`}
                    rows={3}
                    value={String(formData[field.key] ?? "")}
                    onChange={(event) => setFormData({ ...formData, [field.key]: event.target.value })}
                  />
                ) : field.type === "select" ? (
                  <Select
                    value={String(formData[field.key] ?? "")}
                    onValueChange={(value) => setFormData({ ...formData, [field.key]: value })}
                  >
                    <SelectTrigger id={`catalog-field-${field.key}`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`catalog-field-${field.key}`}
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    value={String(formData[field.key] ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => setFormData({ ...formData, [field.key]: event.target.value })}
                  />
                )}
              </div>
            );
          })}
        </div>
      </StandardDialog>
    </div>
  );
}

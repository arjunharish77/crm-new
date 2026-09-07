"use client";

// Gap checklist Module 10's "saved workspace layouts" item -- per-module default view mode
// (table/kanban/calendar/etc) and per-module split-vs-full layout, backed by the SAME
// `User.preferences` JSONB column the rest of this app's workspace personalization already
// uses (`viewModes`/`layoutModes` keys, see `user-preferences-postgres.ts`), read through the
// same synchronous localStorage cache `DataTable`'s density default already reads
// (`getCachedPersonalization`) so a module page's initial render never has to wait on a network
// round-trip, and written straight through to `/api/settings/personalization` (a merge-patch,
// so setting one module's mode never touches another's).
import { apiFetch } from "@/lib/api";
import { getCachedPersonalization, savePersonalizationCache } from "@/lib/personalization-cache";

export function getSavedViewMode(moduleName: string): string | null {
  const cached = getCachedPersonalization();
  const viewModes = cached?.viewModes as Record<string, string> | undefined;
  return viewModes?.[moduleName] ?? null;
}

export function getSavedLayoutMode(moduleName: string): "split" | "full" | null {
  const cached = getCachedPersonalization();
  const layoutModes = cached?.layoutModes as Record<string, "split" | "full"> | undefined;
  return layoutModes?.[moduleName] ?? null;
}

export async function saveViewMode(moduleName: string, mode: string) {
  try {
    const updated = await apiFetch<Record<string, unknown>>("/settings/personalization", {
      method: "PATCH",
      body: JSON.stringify({ viewModes: { [moduleName]: mode } }),
    });
    savePersonalizationCache(updated);
  } catch {
    // Best-effort -- a failed save just means this toggle doesn't persist across reloads this
    // time; the page itself already reflects the user's choice for the current session.
  }
}

export async function saveLayoutMode(moduleName: string, mode: "split" | "full") {
  try {
    const updated = await apiFetch<Record<string, unknown>>("/settings/personalization", {
      method: "PATCH",
      body: JSON.stringify({ layoutModes: { [moduleName]: mode } }),
    });
    savePersonalizationCache(updated);
  } catch {
    // See saveViewMode above.
  }
}

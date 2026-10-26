"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useShortlist } from "@/lib/use-shortlist";

// Save toggle in the design's bookmark style (UI redesign Q4). 44px hit area; `size` is kept for
// existing callers and only sets the outer box.
export function SaveButton({ courseId, size = 44, label, variant = "tile", withText = false }: { courseId: string; size?: number; label?: string; variant?: "tile" | "outline"; withText?: boolean }) {
  const { isSaved, toggle } = useShortlist();
  const saved = isSaved(courseId);
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      className={`uv-save uv-save-${variant}`}
      data-saved={saved || undefined}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle(courseId); }}
      aria-label={`${saved ? "Remove from saved courses" : "Save course"}${label ? `: ${label}` : ""}`}
      aria-pressed={saved}
      style={withText ? { minHeight: Math.max(size, 44) } : { width: Math.max(size, 44), height: Math.max(size, 44) }}
    >
      <Icon size={22} strokeWidth={2} aria-hidden="true" />
      {withText ? <span aria-hidden="true">{saved ? "Saved" : "Save"}</span> : null}
    </button>
  );
}

"use client";

import { useState } from "react";
import { COMPARE_LIMIT, useCompareList } from "@/lib/use-compare-list";

// "+ Compare" / "✓ In compare" (design UVCard row 5). A full list is announced, never overwritten.
export function CompareToggle({ courseId, label, className = "" }: { courseId: string; label: string; className?: string }) {
  const { has, toggle } = useCompareList();
  const [notice, setNotice] = useState("");
  const selected = has(courseId);
  return <>
    <button
      type="button"
      className={`btn uv-compare-toggle ${className}`}
      data-selected={selected || undefined}
      aria-pressed={selected}
      aria-label={`${selected ? "Remove from compare" : "Add to compare"}: ${label}`}
      onClick={(event) => {
        event.preventDefault();
        const result = toggle(courseId);
        setNotice(result === "full" ? `Compare holds ${COMPARE_LIMIT} programs. Remove one to add this.` : "");
      }}
    >
      <span aria-hidden="true">{selected ? "✓ In compare" : "+ Compare"}</span>
    </button>
    <span role="status" className={notice ? "uv-compare-notice" : "sr-only"}>{notice}</span>
  </>;
}

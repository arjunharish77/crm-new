"use client";

import { useEffect, useState } from "react";

// Gap checklist Module 10's "performance UX polish" item, "debounced search" -- a generic,
// reusable debounce for ANY changing value (a search query, a draft filter, a form field), not
// tied to the one-off `setTimeout`-in-a-useEffect pattern this app had already hand-rolled in
// a couple of places (the global command palette's search box, the advanced filter drawer's
// live preview count -- the latter now uses this hook instead, see advanced-filter-drawer.tsx).
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

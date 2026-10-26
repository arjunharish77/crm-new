"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

// Filters on the explorers, the compare picker and the hubs keep their state in the URL. Since
// Next.js 16.4, `useSearchParams` reflects a `history.pushState` change a frame later, so a pill
// or Reset button briefly showed the old state. `writeUrl` records the new query as pending; the
// hook shows it until Next's own value catches up. Next's value stays the source of truth for
// first render, Link navigations and back/forward (which clears anything pending).
// `seen` holds the query before the first unacknowledged write plus every query written since, so
// fast typing (one write per keystroke) never shows an intermediate value while Next catches up.
type Pending = { search: string; seen: string[] } | null;
let pending: Pending = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

function clearPending() { if (pending) { pending = null; emit(); } }
// Effects run after commit; by then a newer write may have replaced the entry they looked at.
function clearIfStill(entry: Pending) { if (entry && pending === entry) { pending = null; emit(); } }

export function writeUrl(url: URL | string, replace = false) {
  const target = new URL(typeof url === "string" ? url : url.toString(), window.location.href);
  const before = window.location.search.replace(/^\?/, "");
  if (replace) window.history.replaceState(null, "", target); else window.history.pushState(null, "", target);
  const search = target.search.replace(/^\?/, "");
  pending = { search, seen: pending ? [...pending.seen, search] : [before, search] };
  emit();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("popstate", clearPending);
  return () => { listeners.delete(onChange); window.removeEventListener("popstate", clearPending); };
}

export function useLiveSearchParams() {
  const nextSearch = useSearchParams().toString();
  const current = useSyncExternalStore(subscribe, () => pending, () => null);
  // While Next reports a query from before or during the latest writes, show the latest write.
  // Once Next reaches it, or navigates somewhere else, its own value applies again.
  const behind = Boolean(current && current.search !== nextSearch && current.seen.includes(nextSearch));
  const search = behind && current ? current.search : nextSearch;
  useEffect(() => { if (current && !behind) clearIfStill(current); }, [current, behind]);
  return useMemo(() => new URLSearchParams(search), [search]);
}

// A search box bound to a URL parameter. It keeps its own text while the learner types (so a
// re-render with a slightly older URL value can never drop keystrokes), writes every change to the
// URL, and takes the URL's value only when it changes from outside: Reset, back/forward or a link.
export function useUrlSearchText(urlValue: string, write: (value: string) => void) {
  const [text, setText] = useState(urlValue);
  // Every value typed since the URL last matched the box; a late echo of one of them is ignored.
  const written = useRef<{ last: string; values: Set<string> }>({ last: urlValue, values: new Set() });
  useEffect(() => {
    const state = written.current;
    if (urlValue === state.last) { state.values.clear(); return; }
    if (state.values.has(urlValue)) return;
    state.last = urlValue; state.values.clear(); setText(urlValue);
  }, [urlValue]);
  const onChange = (value: string) => { written.current.last = value; written.current.values.add(value); setText(value); write(value); };
  return [text, onChange] as const;
}

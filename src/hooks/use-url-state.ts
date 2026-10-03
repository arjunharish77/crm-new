"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// One query-string value as React state (UI/UX plan Phase 1, useUrlState): tabs, filters and
// views survive reload, can be bookmarked and shared, and Back goes to the previous value.
// Reads window.location instead of useSearchParams, matching the app's pages, which aren't
// wrapped in Suspense. `fallback` is used when the parameter is missing or not allowed.
// Next's router changes the URL through history.pushState/replaceState, which fires no event, so a
// link that changes only the query (Settings › Phone system → ?section=phone-system on the page
// already open) wasn't noticed. Patched once to announce every change as "app:locationchange".
const LOCATION_EVENT = "app:locationchange";
function watchHistory() {
    if (typeof window === "undefined" || (window as any).__appHistoryWatched) return;
    (window as any).__appHistoryWatched = true;
    for (const method of ["pushState", "replaceState"] as const) {
        const original = window.history[method];
        window.history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
            const result = original.apply(this, args);
            queueMicrotask(() => window.dispatchEvent(new Event(LOCATION_EVENT)));
            return result;
        };
    }
}

export function useUrlState<T extends string>(key: string, fallback: T, options: { allowed?: readonly T[]; push?: boolean } = {}) {
    const router = useRouter();
    const pathname = usePathname();
    const read = useCallback((): T => {
        if (typeof window === "undefined") return fallback;
        const raw = new URLSearchParams(window.location.search).get(key);
        if (raw === null) return fallback;
        return options.allowed && !options.allowed.includes(raw as T) ? fallback : (raw as T);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, fallback, (options.allowed ?? []).join("|")]);

    const [value, setValue] = useState<T>(fallback);

    useEffect(() => {
        watchHistory();
        setValue(read());
        const onChange = () => setValue(read());
        window.addEventListener("popstate", onChange);
        window.addEventListener(LOCATION_EVENT, onChange);
        return () => {
            window.removeEventListener("popstate", onChange);
            window.removeEventListener(LOCATION_EVENT, onChange);
        };
    }, [read, pathname]);

    const update = useCallback((next: T) => {
        setValue(next);
        const params = new URLSearchParams(window.location.search);
        if (next === fallback) params.delete(key);
        else params.set(key, next);
        const qs = params.toString();
        const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
        if (options.push) router.push(url, { scroll: false });
        else router.replace(url, { scroll: false });
    }, [fallback, key, options.push, router]);

    return [value, update] as const;
}

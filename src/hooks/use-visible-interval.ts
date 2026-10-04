"use client";

import { useEffect, useRef } from "react";

// Round-2 plan P9: polling stops while the browser tab is hidden and catches up once when it
// is shown again (if a tick was missed), instead of hitting the server from tabs nobody is
// looking at. `callback` may change between renders; the latest one is used.
export function useVisibleInterval(callback: () => void, intervalMs: number | null, enabled = true) {
    const latest = useRef(callback);
    useEffect(() => { latest.current = callback; });

    useEffect(() => {
        if (!enabled || !intervalMs || intervalMs <= 0) return;
        let timer: ReturnType<typeof setInterval> | null = null;
        let lastRun = Date.now();
        const tick = () => { lastRun = Date.now(); latest.current(); };
        const start = () => { if (!timer) timer = setInterval(tick, intervalMs); };
        const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
        const onVisibility = () => {
            if (document.hidden) { stop(); return; }
            if (Date.now() - lastRun >= intervalMs) tick();
            start();
        };
        if (!document.hidden) start();
        document.addEventListener("visibilitychange", onVisibility);
        return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
    }, [intervalMs, enabled]);
}

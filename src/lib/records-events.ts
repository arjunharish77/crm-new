"use client";

import { useEffect, useRef } from "react";

// "Something was created or changed" without a full page reload (UI/UX plan §11.6 M: the
// header's Create menu used to reload the whole app after every create). Open lists and record
// pages listen and refetch.
export type RecordKind = "lead" | "opportunity" | "activity" | "task";

const EVENT = "unnatify:records-changed";

export function emitRecordsChanged(kind: RecordKind) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind } }));
}

export function useRecordsChanged(kinds: RecordKind[], onChange: () => void) {
    const callback = useRef(onChange);
    useEffect(() => {
        callback.current = onChange;
    }, [onChange]);
    const key = kinds.join("|");
    useEffect(() => {
        const wanted = new Set(key.split("|"));
        const listener = (event: Event) => {
            const kind = (event as CustomEvent<{ kind: RecordKind }>).detail?.kind;
            if (kind && wanted.has(kind)) callback.current();
        };
        window.addEventListener(EVENT, listener);
        return () => window.removeEventListener(EVENT, listener);
    }, [key]);
}

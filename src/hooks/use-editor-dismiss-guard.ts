"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react";

export const EditorDismissContext = createContext<((guard: () => boolean) => () => void) | null>(null);

/** Opt-in guard for dialog dismissal and document unload; does not intercept SPA routing. */
export function useEditorDismissGuard(dirty: boolean, pending: boolean, onDiscard?: () => void) {
    const register = useContext(EditorDismissContext);
    const state = useRef({ dirty, pending, onDiscard });
    useLayoutEffect(() => { state.current = { dirty, pending, onDiscard }; }, [dirty, pending, onDiscard]);
    const canDismiss = useCallback(() => {
        if (state.current.pending) return false;
        if (!state.current.dirty) return true;
        if (!window.confirm("Discard your unsaved changes?")) return false;
        state.current.onDiscard?.();
        return true;
    }, []);
    useEffect(() => register?.(canDismiss), [register, canDismiss]);
    useEffect(() => {
        if (!dirty && !pending) return;
        const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", unload);
        return () => window.removeEventListener("beforeunload", unload);
    }, [dirty, pending]);
    return canDismiss;
}

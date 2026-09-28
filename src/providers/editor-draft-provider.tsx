"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";

type EditorDraft = { values: Record<string, any> | null; dirty: boolean; pending: boolean; error: string; savedValues: Record<string, any> | null };
const EMPTY: EditorDraft = { values: null, dirty: false, pending: false, error: "", savedValues: null };
function createStore() {
    const drafts = new Map<string, EditorDraft>();
    const listeners = new Set<() => void>();
    return {
        get: (key: string) => drafts.get(key) ?? EMPTY,
        hasUnsent: () => [...drafts.values()].some(draft => draft.dirty || draft.pending),
        update: (key: string, patch: Partial<EditorDraft>) => {
            drafts.set(key, { ...(drafts.get(key) ?? EMPTY), ...patch });
            listeners.forEach(listener => listener());
        },
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
}
const Context = createContext<ReturnType<typeof createStore> | null>(null);
export function EditorDraftProvider({ children }: { children: React.ReactNode }) {
    const [store] = useState(createStore);
    const dirty = useSyncExternalStore(store.subscribe, store.hasUnsent, () => false);
    useEffect(() => {
        if (!dirty) return;
        const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", unload);
        return () => window.removeEventListener("beforeunload", unload);
    }, [dirty]);
    return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useRetainedEditorDraft(key: string) {
    const store = useContext(Context);
    if (!store) throw new Error("Editor drafts require their provider");
    const draft = useSyncExternalStore(store.subscribe, () => store.get(key), () => EMPTY);
    const update = useCallback((patch: Partial<EditorDraft>) => store.update(key, patch), [store, key]);
    const current = useCallback(() => store.get(key), [store, key]);
    return { draft, update, current };
}

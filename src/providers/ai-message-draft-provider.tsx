"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

export type MessageDraft = {
    channel: "EMAIL" | "SMS" | "WHATSAPP";
    composing: { recipient: string; subject: string; body: string } | null;
    sending: boolean;
    error: string;
};
const EMPTY: MessageDraft = { channel: "EMAIL", composing: null, sending: false, error: "" };

// Memory only. The auth provider remounts this store when the signed-in scope changes.
function createStore() {
    const drafts = new Map<string, MessageDraft>();
    const listeners = new Set<() => void>();
    return {
        hasUnsent: () => [...drafts.values()].some(draft => draft.composing || draft.sending),
        get: (key: string) => drafts.get(key) ?? EMPTY,
        update: (key: string, patch: Partial<MessageDraft>) => {
            drafts.set(key, { ...(drafts.get(key) ?? EMPTY), ...patch });
            listeners.forEach(listener => listener());
        },
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
}
const DraftContext = createContext<ReturnType<typeof createStore> | null>(null);

export function AiMessageDraftProvider({ children }: { children: React.ReactNode }) {
    const [store] = useState(createStore);
    const hasUnsent = useSyncExternalStore(store.subscribe, store.hasUnsent, () => false);
    useEffect(() => {
        if (!hasUnsent) return;
        const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", unload);
        return () => window.removeEventListener("beforeunload", unload);
    }, [hasUnsent]);
    return <DraftContext.Provider value={store}>{children}</DraftContext.Provider>;
}

export function useAiMessageDraft(key: string) {
    const store = useContext(DraftContext);
    if (!store) throw new Error("AI message drafts require their provider");
    const draft = useSyncExternalStore(store.subscribe, () => store.get(key), () => EMPTY);
    return { draft, update: (patch: Partial<MessageDraft>) => store.update(key, patch), current: () => store.get(key) };
}

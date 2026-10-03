"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { humanizeEnum, type StatusDisplay, type StatusTone } from "@/lib/display/status";

// The tenant's lead statuses (UI/UX plan decision 6), loaded once per page session and shared by
// every status picker, badge and filter. `refresh()` after editing them in Settings.
export type LeadStatus = {
    id: string;
    key: string;
    label: string;
    tone: StatusTone;
    category: "OPEN" | "CONVERTED" | "LOST";
    order: number;
    isActive: boolean;
};

const FALLBACK: LeadStatus[] = [
    { id: "NEW", key: "NEW", label: "New", tone: "info", category: "OPEN", order: 10, isActive: true },
    { id: "CONTACTED", key: "CONTACTED", label: "Contacted", tone: "info", category: "OPEN", order: 20, isActive: true },
    { id: "QUALIFIED", key: "QUALIFIED", label: "Qualified", tone: "accent", category: "OPEN", order: 30, isActive: true },
    { id: "CONVERTED", key: "CONVERTED", label: "Converted", tone: "success", category: "CONVERTED", order: 40, isActive: true },
    { id: "LOST", key: "LOST", label: "Lost", tone: "danger", category: "LOST", order: 50, isActive: true },
];

let snapshot: { statuses: LeadStatus[]; loaded: boolean } = { statuses: FALLBACK, loaded: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function load(force = false) {
    if (inflight && !force) return inflight;
    inflight = apiFetch<LeadStatus[]>("/lead-statuses")
        .then((rows) => {
            snapshot = { statuses: Array.isArray(rows) && rows.length ? rows : FALLBACK, loaded: true };
        })
        .catch(() => {
            snapshot = { ...snapshot, loaded: true };
        })
        .finally(() => emit());
    return inflight;
}

export function leadStatusKey(value: unknown) {
    return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

export function useLeadStatuses() {
    const state = useSyncExternalStore(
        (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        () => snapshot,
        () => snapshot,
    );
    useEffect(() => { if (!state.loaded) load(); }, [state.loaded]);

    const display = useCallback((value: unknown): StatusDisplay & { category: LeadStatus["category"] } => {
        const key = leadStatusKey(value);
        const match = state.statuses.find((status) => status.key === key);
        if (match) return { label: match.label, tone: match.tone, category: match.category };
        return { label: humanizeEnum(value) || "—", tone: "neutral", category: "OPEN" };
    }, [state.statuses]);

    return {
        statuses: state.statuses,
        active: state.statuses.filter((status) => status.isActive),
        loaded: state.loaded,
        display,
        refresh: () => load(true),
    };
}

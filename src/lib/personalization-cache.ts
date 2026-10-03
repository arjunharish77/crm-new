"use client";
import { useMemo, useSyncExternalStore } from "react";
import { storageGet, storageSet } from "@/lib/storage";

// Gap checklist Module 10's "user workspace personalization" item -- a tiny localStorage cache
// of this user's own /settings/personalization payload, written once by GeneralSettingsProvider
// (which already fetches it for the timezone/currency override) so components that need a
// single field from it (e.g. DataTable's density default) can read it synchronously instead of
// each firing their own redundant network request on every table's mount.
const CACHE_KEY = "unnatify.personalization";
const CHANGE_EVENT = "unnatify:personalization-change";
// Kept in memory as well, so subscribers still update where browser storage is blocked.
let latest: string | null = null;

export function savePersonalizationCache(data: Record<string, unknown> | null | undefined) {
    if (typeof window === "undefined" || !data) return;
    try {
        latest = JSON.stringify(data);
        storageSet(CACHE_KEY, latest);
        window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
        // Private browsing / storage disabled -- callers just fall back to their own default.
    }
}

function parse(raw: string | null): Record<string, unknown> | null {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function readRaw() {
    return latest ?? storageGet(CACHE_KEY);
}

export function getCachedPersonalization(): Record<string, unknown> | null {
    if (typeof window === "undefined") return null;
    return parse(readRaw());
}

function subscribe(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
    };
}

// The cached payload, updated whenever it is saved again (the provider's fetch at sign-in, or a
// change in My account › Preferences) -- so the navigation drawer reads it rather than fetching
// it a second time (Section 8 #18).
export function useCachedPersonalization(): Record<string, unknown> | null {
    const raw = useSyncExternalStore(subscribe, readRaw, () => null);
    return useMemo(() => parse(raw), [raw]);
}

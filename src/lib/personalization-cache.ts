"use client";

// Gap checklist Module 10's "user workspace personalization" item -- a tiny localStorage cache
// of this user's own /settings/personalization payload, written once by GeneralSettingsProvider
// (which already fetches it for the timezone/currency override) so components that need a
// single field from it (e.g. DataTable's density default) can read it synchronously instead of
// each firing their own redundant network request on every table's mount.
const CACHE_KEY = "unnatify.personalization";

export function savePersonalizationCache(data: Record<string, unknown> | null | undefined) {
    if (typeof window === "undefined" || !data) return;
    try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
        // Private browsing / storage disabled -- callers just fall back to their own default.
    }
}

export function getCachedPersonalization(): Record<string, unknown> | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

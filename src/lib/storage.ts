// Browser storage that never throws (UI/UX plan Phase 1 storage helper). localStorage can be
// missing on the server, blocked by the browser, full, or throw in private windows; every read
// then returns null and every write is skipped, so a preference simply isn't remembered
// instead of breaking the page.

function store(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        return null;
    }
}

export function storageGet(key: string): string | null {
    try {
        return store()?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

export function storageSet(key: string, value: string): boolean {
    try {
        const target = store();
        if (!target) return false;
        target.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function storageRemove(key: string): void {
    try {
        store()?.removeItem(key);
    } catch {
        // Nothing to do: storage is unavailable.
    }
}

// Round-2 plan N3: things that name records or hold someone's work (recent items, favourites,
// saved filter presets, form drafts) are kept per person and workspace, so a shared computer
// never shows one person's leads to the next. AuthProvider sets the scope from the signed-in
// user; with nobody signed in, scoped keys point at a throwaway slot.
let userScope = "signed-out";

export function setStorageUserScope(tenantId: string | null | undefined, userId: string | null | undefined) {
    userScope = userId ? `${tenantId || "platform"}:${userId}` : "signed-out";
}

export function userScopedKey(key: string) {
    return `${key}@${userScope}`;
}

// Recent items and unsent form drafts are removed when this person signs out; favourites and
// filter presets stay (they're only readable by the same person signing in again).
const CLEARED_ON_SIGN_OUT = ["crm.recentRecords@", "crm-context-form-draft:"];
const LEGACY_SHARED_KEYS = ["crm.recentRecords", "crm.favoriteRecords"];

export function clearUserScopedStorageOnSignOut() {
    try {
        const target = store();
        if (!target) return;
        const suffix = `@${userScope}`;
        const doomed: string[] = [];
        for (let index = 0; index < target.length; index += 1) {
            const key = target.key(index);
            if (key && key.endsWith(suffix) && CLEARED_ON_SIGN_OUT.some((prefix) => key.startsWith(prefix))) doomed.push(key);
        }
        doomed.forEach((key) => target.removeItem(key));
    } catch {
        // Nothing to do: storage is unavailable.
    }
}

// The shared (unscoped) lists from before N3 can't be attributed to anyone, so they're dropped.
export function removeLegacySharedStorage() {
    LEGACY_SHARED_KEYS.forEach(storageRemove);
    try {
        const target = store();
        if (!target) return;
        const doomed: string[] = [];
        for (let index = 0; index < target.length; index += 1) {
            const key = target.key(index);
            if (key && (key.startsWith("crm-context-form-draft:") || key.startsWith("advanced-filters.")) && !key.includes("@")) doomed.push(key);
        }
        doomed.forEach((key) => target.removeItem(key));
    } catch {
        // Nothing to do: storage is unavailable.
    }
}

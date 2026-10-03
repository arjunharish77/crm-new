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

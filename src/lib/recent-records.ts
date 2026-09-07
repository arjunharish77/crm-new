"use client";

// Gap checklist Module 10's "recent/favorite records" item -- extends the earlier, deliberately
// narrower "jump to recent records" the global command palette pass built (Lead/Opportunity
// only, no pin/favorite concept, stated explicitly at the time as this item's own job to
// complete). Still client-side only (localStorage, per-browser, not synced across devices or
// tenants server-side) -- a real, working per-user convenience, same tier as this app's other
// localStorage-backed preferences (DataTable density, keyboard-shortcut enablement), not a
// second backend feature.

export type RecordType = "lead" | "opportunity" | "task" | "view" | "report" | "campaign";

export type RecentRecord = {
  type: RecordType;
  id: string;
  label: string;
  viewedAt: string;
};

export type FavoriteRecord = {
  type: RecordType;
  id: string;
  label: string;
  pinnedAt: string;
};

const RECENT_STORAGE_KEY = "crm.recentRecords";
const FAVORITES_STORAGE_KEY = "crm.favoriteRecords";
const MAX_RECENT = 8;

function safeParse<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded contexts -- a missed write
    // is a minor UX gap, not worth failing the page render over.
  }
}

export function getRecentRecords(): RecentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse<RecentRecord>(window.localStorage.getItem(RECENT_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function recordRecentView(type: RecordType, id: string, label: string) {
  if (typeof window === "undefined" || !id || !label) return;
  try {
    const existing = safeParse<RecentRecord>(window.localStorage.getItem(RECENT_STORAGE_KEY));
    const deduped = existing.filter((entry) => !(entry.type === type && entry.id === id));
    const next = [{ type, id, label, viewedAt: new Date().toISOString() }, ...deduped].slice(0, MAX_RECENT);
    safeWrite(RECENT_STORAGE_KEY, next);
  } catch {
    // See safeWrite above.
  }
}

// "Pin/favorite support" -- a deliberately uncapped, user-curated list (unlike recent's own
// fixed 8-item rolling window), toggled explicitly rather than tracked automatically.
export function getFavoriteRecords(): FavoriteRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse<FavoriteRecord>(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function isFavoriteRecord(type: RecordType, id: string): boolean {
  return getFavoriteRecords().some((entry) => entry.type === type && entry.id === id);
}

export function toggleFavoriteRecord(type: RecordType, id: string, label: string): FavoriteRecord[] {
  if (typeof window === "undefined" || !id || !label) return [];
  const existing = getFavoriteRecords();
  const alreadyFavorite = existing.some((entry) => entry.type === type && entry.id === id);
  const next = alreadyFavorite
    ? existing.filter((entry) => !(entry.type === type && entry.id === id))
    : [{ type, id, label, pinnedAt: new Date().toISOString() }, ...existing];
  safeWrite(FAVORITES_STORAGE_KEY, next);
  return next;
}

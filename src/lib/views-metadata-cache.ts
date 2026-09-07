// Shared in-memory cache for the reference/metadata lookups the Views page and its Smart
// View builder both fetch repeatedly (users, teams, sales groups, roles, activity/opportunity
// types, etc.) -- these change rarely, but were previously refetched from scratch every time
// the builder dialog opened (10 requests per open) even if nothing had changed since the last
// open. A short TTL keeps them fresh enough without a full data-fetching library.
const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();

export async function fetchCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data as T;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = loader()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
      inFlight.delete(key);
      return data;
    })
    .catch((error) => {
      inFlight.delete(key);
      throw error;
    });
  inFlight.set(key, promise);
  return promise;
}

export function invalidateViewsMetadataCache(key?: string) {
  if (key) {
    cache.delete(key);
    inFlight.delete(key);
  } else {
    cache.clear();
    inFlight.clear();
  }
}

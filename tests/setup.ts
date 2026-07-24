import { vi } from "vitest";

// Vitest already sets NODE_ENV to "test" by default; no need to assign it here
// (its type is declared read-only, and reassigning it isn't necessary).
process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-prod";
process.env.DATA_ACCESS_MODE = "postgres";

// getCurrentUser() falls back to next/headers's cookies() when no bearer token is
// present; that API is only valid inside a real Next.js request scope. Stub it so any
// test that accidentally exercises the cookie-fallback branch degrades to "no session"
// instead of crashing the whole file.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

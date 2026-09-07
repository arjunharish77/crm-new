import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { getUserPreferencesForTenant, updateUserPreferencesForTenant } from "@/lib/repositories/user-preferences-postgres";

const user = { id: "user-1", tenantId: "tenant-1" };

// Gap checklist Module 10's "user workspace personalization" item -- a single flexible JSONB
// column, merge-patched (not replaced) so updating one field never clobbers another.
describe("getUserPreferencesForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("returns the stored preferences", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ preferences: { density: "compact" } });
    const result = await getUserPreferencesForTenant(user);
    expect(result).toEqual({ density: "compact" });
  });

  it("returns an empty object when the user has no row (or no preferences yet)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    expect(await getUserPreferencesForTenant(user)).toEqual({});
  });
});

describe("updateUserPreferencesForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("merge-patches a top-level field without touching an existing sibling field", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ preferences: { pinnedModules: ["/dashboard/leads"], density: "comfortable" } })
      .mockResolvedValueOnce({ preferences: { pinnedModules: ["/dashboard/leads"], density: "compact" } });

    await updateUserPreferencesForTenant(user, { density: "compact" });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][0]).toEqual({ pinnedModules: ["/dashboard/leads"], density: "compact" });
  });

  it("merge-patches a nested object field without clobbering its own siblings", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ preferences: { notifications: { mutedCategories: ["TASKS"] } }, other: undefined })
      .mockResolvedValueOnce({ preferences: {} });

    await updateUserPreferencesForTenant(user, { timezoneOverride: "America/New_York" });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][0]).toEqual({ notifications: { mutedCategories: ["TASKS"] }, timezoneOverride: "America/New_York" });
  });

  it("throws USER_NOT_FOUND when the update matches no row", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ preferences: {} }).mockResolvedValueOnce(null);
    await expect(updateUserPreferencesForTenant(user, { density: "compact" })).rejects.toThrow("USER_NOT_FOUND");
  });

  // Gap checklist Module 10's "saved workspace layouts" item.
  it("merge-patches a per-module viewModes entry without touching another module's entry", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ preferences: { viewModes: { tasks: "calendar" } } })
      .mockResolvedValueOnce({ preferences: { viewModes: { tasks: "calendar", opportunities: "KANBAN" } } });

    await updateUserPreferencesForTenant(user, { viewModes: { opportunities: "KANBAN" } });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][0]).toEqual({ viewModes: { tasks: "calendar", opportunities: "KANBAN" } });
  });

  it("merge-patches a per-module layoutModes entry", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ preferences: {} })
      .mockResolvedValueOnce({ preferences: { layoutModes: { marketing: "full" } } });

    await updateUserPreferencesForTenant(user, { layoutModes: { marketing: "full" } });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][0]).toEqual({ layoutModes: { marketing: "full" } });
  });

  it("an explicit null patch fully clears a key rather than merging into it (reset-to-default)", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ preferences: { viewModes: { tasks: "calendar" }, density: "compact" } })
      .mockResolvedValueOnce({ preferences: { viewModes: null, density: null } });

    await updateUserPreferencesForTenant(user, { viewModes: null, density: null });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][0]).toEqual({ viewModes: null, density: null });
  });
});

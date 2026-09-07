import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
}

const apiMocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: apiMocks.apiFetch }));

// Gap checklist Module 10's "saved workspace layouts" item.
describe("workspace-layout (no window)", () => {
  it("getSavedViewMode and getSavedLayoutMode return null when window is undefined", async () => {
    vi.resetModules();
    const { getSavedViewMode, getSavedLayoutMode } = await import("@/lib/workspace-layout");
    expect(getSavedViewMode("tasks")).toBeNull();
    expect(getSavedLayoutMode("marketing")).toBeNull();
  });

  it("saveViewMode and saveLayoutMode are safe no-ops when window is undefined", async () => {
    vi.resetModules();
    const { saveViewMode, saveLayoutMode } = await import("@/lib/workspace-layout");
    await expect(saveViewMode("tasks", "calendar")).resolves.toBeUndefined();
    await expect(saveLayoutMode("marketing", "full")).resolves.toBeUndefined();
  });
});

describe("workspace-layout (with a window.localStorage stub)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: makeLocalStorage() });
    apiMocks.apiFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getSavedViewMode reads a module's view mode from the personalization cache", async () => {
    vi.resetModules();
    (window as any).localStorage.setItem("unnatify.personalization", JSON.stringify({ viewModes: { tasks: "calendar", opportunities: "KANBAN" } }));
    const { getSavedViewMode } = await import("@/lib/workspace-layout");
    expect(getSavedViewMode("tasks")).toBe("calendar");
    expect(getSavedViewMode("opportunities")).toBe("KANBAN");
  });

  it("getSavedViewMode returns null for a module with no saved preference", async () => {
    vi.resetModules();
    (window as any).localStorage.setItem("unnatify.personalization", JSON.stringify({ viewModes: { tasks: "calendar" } }));
    const { getSavedViewMode } = await import("@/lib/workspace-layout");
    expect(getSavedViewMode("leads")).toBeNull();
  });

  it("getSavedLayoutMode reads a module's layout mode from the personalization cache", async () => {
    vi.resetModules();
    (window as any).localStorage.setItem("unnatify.personalization", JSON.stringify({ layoutModes: { marketing: "full" } }));
    const { getSavedLayoutMode } = await import("@/lib/workspace-layout");
    expect(getSavedLayoutMode("marketing")).toBe("full");
  });

  it("getSavedViewMode/getSavedLayoutMode return null when nothing is cached yet", async () => {
    vi.resetModules();
    const { getSavedViewMode, getSavedLayoutMode } = await import("@/lib/workspace-layout");
    expect(getSavedViewMode("tasks")).toBeNull();
    expect(getSavedLayoutMode("marketing")).toBeNull();
  });

  it("saveViewMode PATCHes the module's view mode and refreshes the cache from the response", async () => {
    vi.resetModules();
    apiMocks.apiFetch.mockResolvedValueOnce({ viewModes: { tasks: "calendar" } });
    const { saveViewMode, getSavedViewMode } = await import("@/lib/workspace-layout");

    await saveViewMode("tasks", "calendar");

    expect(apiMocks.apiFetch).toHaveBeenCalledWith("/settings/personalization", {
      method: "PATCH",
      body: JSON.stringify({ viewModes: { tasks: "calendar" } }),
    });
    expect(getSavedViewMode("tasks")).toBe("calendar");
  });

  it("saveLayoutMode PATCHes the module's layout mode and refreshes the cache from the response", async () => {
    vi.resetModules();
    apiMocks.apiFetch.mockResolvedValueOnce({ layoutModes: { marketing: "full" } });
    const { saveLayoutMode, getSavedLayoutMode } = await import("@/lib/workspace-layout");

    await saveLayoutMode("marketing", "full");

    expect(apiMocks.apiFetch).toHaveBeenCalledWith("/settings/personalization", {
      method: "PATCH",
      body: JSON.stringify({ layoutModes: { marketing: "full" } }),
    });
    expect(getSavedLayoutMode("marketing")).toBe("full");
  });

  it("saveViewMode does not throw and leaves the cache untouched when the PATCH fails", async () => {
    vi.resetModules();
    (window as any).localStorage.setItem("unnatify.personalization", JSON.stringify({ viewModes: { tasks: "list" } }));
    apiMocks.apiFetch.mockRejectedValueOnce(new Error("network error"));
    const { saveViewMode, getSavedViewMode } = await import("@/lib/workspace-layout");

    await expect(saveViewMode("tasks", "calendar")).resolves.toBeUndefined();
    expect(getSavedViewMode("tasks")).toBe("list");
  });
});

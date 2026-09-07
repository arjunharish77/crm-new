import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
}

describe("recent-records (SSR-safe, no window)", () => {
  it("getRecentRecords returns [] when window is undefined", async () => {
    vi.resetModules();
    const { getRecentRecords } = await import("@/lib/recent-records");
    expect(getRecentRecords()).toEqual([]);
  });

  it("recordRecentView is a safe no-op when window is undefined", async () => {
    vi.resetModules();
    const { recordRecentView, getRecentRecords } = await import("@/lib/recent-records");
    expect(() => recordRecentView("lead", "lead-1", "Test Lead")).not.toThrow();
    expect(getRecentRecords()).toEqual([]);
  });

  it("getFavoriteRecords returns [] and isFavoriteRecord returns false when window is undefined", async () => {
    vi.resetModules();
    const { getFavoriteRecords, isFavoriteRecord } = await import("@/lib/recent-records");
    expect(getFavoriteRecords()).toEqual([]);
    expect(isFavoriteRecord("lead", "lead-1")).toBe(false);
  });

  it("toggleFavoriteRecord is a safe no-op when window is undefined", async () => {
    vi.resetModules();
    const { toggleFavoriteRecord } = await import("@/lib/recent-records");
    expect(() => toggleFavoriteRecord("lead", "lead-1", "Test Lead")).not.toThrow();
    expect(toggleFavoriteRecord("lead", "lead-1", "Test Lead")).toEqual([]);
  });
});

describe("recent-records (with a window.localStorage stub)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: makeLocalStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a recorded view", async () => {
    vi.resetModules();
    const { recordRecentView, getRecentRecords } = await import("@/lib/recent-records");
    recordRecentView("lead", "lead-1", "Acme Corp");
    const records = getRecentRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: "lead", id: "lead-1", label: "Acme Corp" });
  });

  it("dedupes and moves a re-viewed record to the front", async () => {
    vi.resetModules();
    const { recordRecentView, getRecentRecords } = await import("@/lib/recent-records");
    recordRecentView("lead", "lead-1", "Acme Corp");
    recordRecentView("opportunity", "opp-1", "Big Deal");
    recordRecentView("lead", "lead-1", "Acme Corp (renamed)");

    const records = getRecentRecords();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ type: "lead", id: "lead-1", label: "Acme Corp (renamed)" });
    expect(records[1]).toMatchObject({ type: "opportunity", id: "opp-1" });
  });

  it("caps the list at 8 most-recent entries", async () => {
    vi.resetModules();
    const { recordRecentView, getRecentRecords } = await import("@/lib/recent-records");
    for (let i = 0; i < 10; i++) {
      recordRecentView("lead", `lead-${i}`, `Lead ${i}`);
    }
    const records = getRecentRecords();
    expect(records).toHaveLength(8);
    expect(records[0].id).toBe("lead-9"); // most recent first
    expect(records[7].id).toBe("lead-2"); // oldest 2 (lead-0, lead-1) evicted
  });

  it("ignores calls with a missing id or label", async () => {
    vi.resetModules();
    const { recordRecentView, getRecentRecords } = await import("@/lib/recent-records");
    recordRecentView("lead", "", "Has no id");
    recordRecentView("lead", "lead-1", "");
    expect(getRecentRecords()).toEqual([]);
  });

  it("recovers from malformed JSON already in storage rather than throwing", async () => {
    vi.resetModules();
    (window as any).localStorage.setItem("crm.recentRecords", "{not valid json");
    const { getRecentRecords, recordRecentView } = await import("@/lib/recent-records");
    expect(getRecentRecords()).toEqual([]);
    expect(() => recordRecentView("lead", "lead-1", "Acme Corp")).not.toThrow();
  });

  it("supports recent tracking for all six record types", async () => {
    vi.resetModules();
    const { recordRecentView, getRecentRecords } = await import("@/lib/recent-records");
    recordRecentView("task", "task-1", "Follow up");
    recordRecentView("view", "view-1", "My View");
    recordRecentView("report", "report-1", "Pipeline Report");
    recordRecentView("campaign", "campaign-1", "Spring Promo");
    const records = getRecentRecords();
    expect(records.map((r) => r.type)).toEqual(["campaign", "report", "view", "task"]);
  });

  it("toggleFavoriteRecord adds a favorite and isFavoriteRecord reflects it", async () => {
    vi.resetModules();
    const { toggleFavoriteRecord, isFavoriteRecord, getFavoriteRecords } = await import("@/lib/recent-records");
    expect(isFavoriteRecord("lead", "lead-1")).toBe(false);
    const afterAdd = toggleFavoriteRecord("lead", "lead-1", "Acme Corp");
    expect(afterAdd).toHaveLength(1);
    expect(afterAdd[0]).toMatchObject({ type: "lead", id: "lead-1", label: "Acme Corp" });
    expect(isFavoriteRecord("lead", "lead-1")).toBe(true);
    expect(getFavoriteRecords()).toHaveLength(1);
  });

  it("toggleFavoriteRecord removes an existing favorite", async () => {
    vi.resetModules();
    const { toggleFavoriteRecord, isFavoriteRecord } = await import("@/lib/recent-records");
    toggleFavoriteRecord("lead", "lead-1", "Acme Corp");
    const afterRemove = toggleFavoriteRecord("lead", "lead-1", "Acme Corp");
    expect(afterRemove).toEqual([]);
    expect(isFavoriteRecord("lead", "lead-1")).toBe(false);
  });

  it("favorites are not capped at 8, unlike recent records", async () => {
    vi.resetModules();
    const { toggleFavoriteRecord, getFavoriteRecords } = await import("@/lib/recent-records");
    for (let i = 0; i < 10; i++) {
      toggleFavoriteRecord("lead", `lead-${i}`, `Lead ${i}`);
    }
    expect(getFavoriteRecords()).toHaveLength(10);
  });

  it("toggleFavoriteRecord ignores calls with a missing id or label", async () => {
    vi.resetModules();
    const { toggleFavoriteRecord, getFavoriteRecords } = await import("@/lib/recent-records");
    toggleFavoriteRecord("lead", "", "Has no id");
    toggleFavoriteRecord("lead", "lead-1", "");
    expect(getFavoriteRecords()).toEqual([]);
  });

  it("favorites and recents are tracked independently per type+id", async () => {
    vi.resetModules();
    const { recordRecentView, toggleFavoriteRecord, getRecentRecords, getFavoriteRecords } = await import("@/lib/recent-records");
    recordRecentView("lead", "lead-1", "Acme Corp");
    toggleFavoriteRecord("opportunity", "opp-1", "Big Deal");
    expect(getRecentRecords()).toHaveLength(1);
    expect(getFavoriteRecords()).toHaveLength(1);
    expect(getRecentRecords()[0].type).toBe("lead");
    expect(getFavoriteRecords()[0].type).toBe("opportunity");
  });
});

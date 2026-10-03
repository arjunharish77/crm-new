import { describe, expect, it } from "vitest";
import { visibleCommandIds } from "@/components/search/global-search";

const BASE = {
  hasCreateLead: false,
  hasCreateOpportunity: false,
  hasCreateActivity: false,
  canAccessModule: () => true,
  automationEnabled: false,
  isAdmin: false,
};

// Gap checklist Module 10's tests bullet -- "command permissions" (the global command palette).
describe("visibleCommandIds", () => {
  it("always includes the always-on navigate and My account commands", () => {
    const ids = visibleCommandIds(BASE);
    expect(ids).toEqual(expect.arrayContaining(["nav-views", "nav-reports", "nav-exports", "account-pages"]));
  });

  it("hides create-lead when the caller has no onCreateLead handler, even with module access", () => {
    const ids = visibleCommandIds({ ...BASE, hasCreateLead: false, canAccessModule: () => true });
    expect(ids).not.toContain("create-lead");
  });

  it("hides create-lead when the leads module is disabled, even with a handler present", () => {
    const ids = visibleCommandIds({ ...BASE, hasCreateLead: true, canAccessModule: (key) => key !== "leads" });
    expect(ids).not.toContain("create-lead");
  });

  it("shows create-lead only when both a handler exists AND the module is accessible", () => {
    const ids = visibleCommandIds({ ...BASE, hasCreateLead: true, canAccessModule: () => true });
    expect(ids).toContain("create-lead");
  });

  it("gates create-opportunity and create-activity the same way (handler AND module access)", () => {
    const idsWithBoth = visibleCommandIds({
      ...BASE,
      hasCreateOpportunity: true,
      hasCreateActivity: true,
      canAccessModule: () => true,
    });
    expect(idsWithBoth).toEqual(expect.arrayContaining(["create-opportunity", "create-activity"]));

    const idsModuleDisabled = visibleCommandIds({
      ...BASE,
      hasCreateOpportunity: true,
      hasCreateActivity: true,
      canAccessModule: () => false,
    });
    expect(idsModuleDisabled).not.toEqual(expect.arrayContaining(["create-opportunity", "create-activity"]));
  });

  it("create-task depends only on module access, not a handler prop (tasks has no onCreateTask callback)", () => {
    expect(visibleCommandIds({ ...BASE, canAccessModule: () => true })).toContain("create-task");
    expect(visibleCommandIds({ ...BASE, canAccessModule: () => false })).not.toContain("create-task");
  });

  it("shows nav-automations only when automationEnabled is true", () => {
    expect(visibleCommandIds({ ...BASE, automationEnabled: false })).not.toContain("nav-automations");
    expect(visibleCommandIds({ ...BASE, automationEnabled: true })).toContain("nav-automations");
  });

  it("hides Settings and its pages from a non-admin, who gets My account instead", () => {
    const ids = visibleCommandIds({ ...BASE, isAdmin: false });
    expect(ids).not.toContain("settings-home");
    expect(ids).not.toContain("settings-pages");
    expect(ids).toContain("account-pages");
  });

  it("shows Settings and its pages to an admin", () => {
    const ids = visibleCommandIds({ ...BASE, isAdmin: true });
    expect(ids).toEqual(expect.arrayContaining(["settings-home", "settings-pages", "account-pages"]));
  });

  it("never shows Settings commands to a non-admin regardless of module access", () => {
    const ids = visibleCommandIds({ ...BASE, isAdmin: false, canAccessModule: () => true });
    expect(ids).not.toContain("settings-pages");
  });
});

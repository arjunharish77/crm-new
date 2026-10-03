import { describe, expect, it } from "vitest";
import { canUseModule, effectiveModuleLevels, moduleRequirementForRequest } from "@/lib/module-access";

const rep = (modules: Record<string, unknown>, templates: Array<Record<string, unknown>> = []) => ({
  role: { permissions: { modules } },
  permissionTemplates: templates.map((templateModules) => ({ permissions: { modules: templateModules } })),
});

describe("role module permissions (decided 2026-10-03)", () => {
  it("none blocks, read reads, write creates and edits, full also deletes", () => {
    const user = rep({ leads: "none", reports: "read", tasks: "write", activities: "full" });
    expect(canUseModule(user, "leads", "read")).toBe(false);
    expect(canUseModule(user, "reports", "read")).toBe(true);
    expect(canUseModule(user, "reports", "write")).toBe(false);
    expect(canUseModule(user, "tasks", "write")).toBe(true);
    expect(canUseModule(user, "tasks", "full")).toBe(false);
    expect(canUseModule(user, "activities", "full")).toBe(true);
  });

  it("a module the role doesn't set isn't limited", () => {
    expect(canUseModule(rep({ leads: "read" }), "forms", "full")).toBe(true);
    expect(canUseModule({ role: { permissions: {} } }, "leads", "full")).toBe(true);
  });

  it("admins are never limited", () => {
    expect(canUseModule({ ...rep({ leads: "none" }), isTenantAdmin: true }, "leads", "full")).toBe(true);
    expect(canUseModule({ ...rep({ leads: "none" }), isPlatformAdmin: true }, "leads", "full")).toBe(true);
  });

  it("templates override the role module by module, the later one winning", () => {
    const user = rep({ leads: "write", reports: "read" }, [{ leads: "read" }, { reports: "write" }, { leads: "none" }]);
    expect(effectiveModuleLevels(user)).toEqual({ leads: "none", reports: "write" });
  });

  it("legacy false means none; unknown values are ignored", () => {
    expect(effectiveModuleLevels(rep({ leads: false, tasks: "everything" }))).toEqual({ leads: "none" });
  });

  it("maps requests to a module and a level", () => {
    expect(moduleRequirementForRequest("GET", "/api/leads")).toMatchObject({ module: { key: "leads" }, need: "read" });
    expect(moduleRequirementForRequest("POST", "/api/lead-lists/abc/members")).toMatchObject({ module: { key: "leads" }, need: "write" });
    expect(moduleRequirementForRequest("PATCH", "/api/tasks/1")).toMatchObject({ module: { key: "tasks" }, need: "write" });
    expect(moduleRequirementForRequest("DELETE", "/api/opportunities/1")).toMatchObject({ module: { key: "opportunities" }, need: "full" });
    // The bulk delete is a DELETE too, so it needs full access.
    expect(moduleRequirementForRequest("DELETE", "/api/opportunities/bulk")).toMatchObject({ module: { key: "opportunities" }, need: "full" });
    expect(moduleRequirementForRequest("POST", "/api/reports/query")).toMatchObject({ module: { key: "reports" }, need: "read" });
    expect(moduleRequirementForRequest("POST", "/api/saved-views/1/open")).toMatchObject({ module: { key: "views" }, need: "read" });
  });

  it("leaves unrelated paths and the documented exceptions alone", () => {
    expect(moduleRequirementForRequest("GET", "/api/leadsx")).toBeNull();
    expect(moduleRequirementForRequest("GET", "/api/forms/available")).toBeNull();
    expect(moduleRequirementForRequest("GET", "/api/partners/me/payouts")).toBeNull();
    expect(moduleRequirementForRequest("GET", "/api/users")).toBeNull();
    expect(moduleRequirementForRequest("GET", "/api/forms/1")).toMatchObject({ module: { key: "forms" } });
  });
});

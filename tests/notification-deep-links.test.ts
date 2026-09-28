import { describe, expect, it } from "vitest";
import { resolveNotificationLink } from "@/components/layout/notification-bell";

// Gap checklist Module 10's tests bullet -- "notification deep links."
describe("resolveNotificationLink", () => {
  it("links application reminders with encoded record IDs", () => { expect(resolveNotificationLink({entityType:"APPLICATION",entityId:"a/b"})).toBe("/dashboard/applications/a%2Fb"); });
  it("returns null for null/undefined/non-object data", () => {
    expect(resolveNotificationLink(null)).toBeNull();
    expect(resolveNotificationLink(undefined)).toBeNull();
    expect(resolveNotificationLink("a string")).toBeNull();
  });

  it("returns null when no recognized field is present", () => {
    expect(resolveNotificationLink({})).toBeNull();
    expect(resolveNotificationLink({ somethingElse: "x" })).toBeNull();
  });

  it("prioritizes viewId above everything else", () => {
    expect(resolveNotificationLink({ viewId: "view-1", entityType: "LEAD", entityId: "lead-1" })).toBe("/dashboard/views?viewId=view-1");
  });

  it("resolves entityType OPPORTUNITY + entityId to the opportunity detail page", () => {
    expect(resolveNotificationLink({ entityType: "OPPORTUNITY", entityId: "opp-1" })).toBe("/dashboard/opportunities/opp-1");
  });

  it("resolves entityType LEAD + entityId to the lead detail page", () => {
    expect(resolveNotificationLink({ entityType: "LEAD", entityId: "lead-1" })).toBe("/dashboard/leads/lead-1");
  });

  it("does not resolve an unrecognized entityType via the entityType+entityId branch, falling through to null when nothing else matches", () => {
    expect(resolveNotificationLink({ entityType: "TASK", entityId: "task-1" })).toBeNull();
  });

  it("falls back to the legacy opportunityId field when entityType/entityId aren't set", () => {
    expect(resolveNotificationLink({ opportunityId: "opp-2" })).toBe("/dashboard/opportunities/opp-2");
  });

  it("falls back to the legacy leadId field when entityType/entityId aren't set", () => {
    expect(resolveNotificationLink({ leadId: "lead-2" })).toBe("/dashboard/leads/lead-2");
  });

  it("falls back to the tasks list page (no per-record detail route) for taskId", () => {
    expect(resolveNotificationLink({ taskId: "task-1" })).toBe("/dashboard/tasks");
  });

  it("prefers entityType/entityId over the legacy leadId/opportunityId fallback fields when both are present", () => {
    expect(resolveNotificationLink({ entityType: "LEAD", entityId: "lead-real", leadId: "lead-legacy" })).toBe("/dashboard/leads/lead-real");
  });
});

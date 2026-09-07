import { describe, expect, it } from "vitest";
import { contextualRecordDefaults } from "@/lib/contextual-defaults";

// Gap checklist Module 10's global create menu, "contextual defaults from the current page/
// view" sub-item -- shared by the header's Create menu and the command palette.
describe("contextualRecordDefaults", () => {
  it("returns leadId when on a Lead detail page", () => {
    expect(contextualRecordDefaults("/dashboard/leads/lead-123")).toEqual({ leadId: "lead-123" });
  });

  it("returns opportunityId when on an Opportunity detail page", () => {
    expect(contextualRecordDefaults("/dashboard/opportunities/opp-456")).toEqual({ opportunityId: "opp-456" });
  });

  it("returns nothing for a list page (no record id in the path)", () => {
    expect(contextualRecordDefaults("/dashboard/leads")).toEqual({});
  });

  it("returns nothing for an unrelated page", () => {
    expect(contextualRecordDefaults("/dashboard/tasks")).toEqual({});
  });

  it("returns nothing for a nested sub-path under a record id", () => {
    expect(contextualRecordDefaults("/dashboard/leads/lead-123/history")).toEqual({});
  });

  it("returns nothing for null/undefined pathnames", () => {
    expect(contextualRecordDefaults(null)).toEqual({});
    expect(contextualRecordDefaults(undefined)).toEqual({});
  });
});

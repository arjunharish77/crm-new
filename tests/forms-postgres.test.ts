import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_user, callback) => callback(undefined)),
}));

describe("direct Postgres forms repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists forms with tenant scope and submission counts", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "form-1",
          name: "Application Form",
          description: null,
          fields: [],
          config: {},
          isActive: true,
          submitButtonText: "Apply",
          successMessage: "Thanks",
          redirectUrl: null,
          spamProtection: true,
          rateLimit: 10,
          duplicateAction: "CREATE",
          theme: "default",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ formId: "form-1", count: 7 }]);

    const { listFormsForTenant } = await import("@/lib/repositories/forms-postgres");
    const result = await listFormsForTenant({ id: "user-1", tenantId: "tenant-1" });

    expect(result[0]._count.submissions).toBe(7);
    expect(result[0].config.sourceModules).toEqual(["lead"]);
    expect(queryMock.mock.calls[0][0]).toContain('from "Form" where "tenantId" = $1');
    expect(queryMock.mock.calls[1][1]).toEqual(["tenant-1", ["form-1"]]);
  });

  it("filters available placement forms by team visibility", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "form-1",
          name: "Activity Note",
          description: null,
          fields: [],
          config: { placements: ["ACTIVITY_DETAIL"], visibilityMode: "TEAMS", visibleTeamIds: ["team-1"] },
          isActive: true,
          submitButtonText: "Submit",
          successMessage: "Thanks",
          redirectUrl: null,
          spamProtection: true,
          rateLimit: 10,
          duplicateAction: "CREATE",
          theme: "default",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ formId: "form-1", count: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ teamId: "team-1" }]);
    queryOneMock.mockResolvedValueOnce({ id: "user-1", roleId: "role-1" });

    const { listAvailableFormsForPlacement } = await import("@/lib/repositories/forms-postgres");
    const result = await listAvailableFormsForPlacement({ id: "user-1", tenantId: "tenant-1" }, "ACTIVITY_DETAIL");

    expect(result.map((form: any) => form.id)).toEqual(["form-1"]);
  });

  it("submits a public form and creates related lead, opportunity, activity, and submission rows", async () => {
    queryOneMock
      .mockResolvedValueOnce({
        id: "form-1",
        tenantId: "tenant-1",
        name: "Website Application",
        description: null,
        fields: [
          { id: "email", label: "Email", mapping: "lead.email" },
          { id: "course", label: "Course", mapping: "opportunity.title", sourceModule: "opportunity" },
          { id: "notes", label: "Notes", mapping: "activity.notes", sourceModule: "activity" },
        ],
        config: { duplicateAction: "CREATE", fields: [] },
        isActive: true,
        submitButtonText: "Submit",
        successMessage: "Thanks",
        redirectUrl: null,
        spamProtection: true,
        rateLimit: 10,
        duplicateAction: "CREATE",
        theme: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "object-lead" })
      .mockResolvedValueOnce({ id: "lead-1" })
      .mockResolvedValueOnce({ id: "object-opportunity" })
      .mockResolvedValueOnce({ id: "opp-1" })
      .mockResolvedValueOnce({ id: "object-activity" })
      .mockResolvedValueOnce({ id: "activity-type-1" })
      .mockResolvedValueOnce({ id: "activity-1" })
      .mockResolvedValueOnce({ id: "submission-1" });
    queryMock.mockResolvedValueOnce([{ id: "type-1", stages: [{ id: "stage-1", name: "New" }] }]);

    const { submitPublicForm } = await import("@/lib/repositories/forms-postgres");
    const result = await submitPublicForm("form-1", {
      "lead.email": "student@example.com",
      "opportunity.title": "MBA Application",
      "activity.notes": "Requested counselling",
      utm_campaign: "summer-intake",
    });

    expect(result).toEqual({ success: true, leadId: "lead-1", opportunityId: "opp-1" });
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Lead"'))).toBe(true);
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Opportunity"'))).toBe(true);
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Activity"'))).toBe(true);
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "FormSubmission"'))).toBe(true);
  });
});

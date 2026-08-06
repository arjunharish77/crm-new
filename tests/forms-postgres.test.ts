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

  describe("submitPublicForm", () => {
    // Rather than a fixed positional sequence of mockResolvedValueOnce() calls (fragile --
    // any new query added to the implementation shifts every later assertion), route by a
    // distinctive substring of the SQL text. This survives internal call-order changes
    // (e.g. the new automation/audit/distribution calls added alongside the entity inserts).
    function setupMocks(options: {
      form: Record<string, any>;
      opportunityTypes?: Array<{ id: string; stages: Array<{ id: string; name: string }> }>;
      leadOwnerId?: string | null;
    }) {
      const { form, opportunityTypes = [], leadOwnerId = null } = options;

      queryOneMock.mockImplementation(async (sql: string, values: any[] = []) => {
        const text = String(sql);
        if (text.includes('from "Form" where id')) return form;
        if (text.includes('from "User" where') && text.includes("'ACTIVE'")) return { id: "fallback-user" };
        if (text.includes('from "Lead" where "tenantId" = $1 and email')) return null;
        if (text.includes('select "ownerId" from "Lead"')) return { ownerId: leadOwnerId };
        if (text.includes('from "ObjectDefinition"')) return { id: "object-def-1" };
        if (text.includes('from "ActivityType"')) return { id: "activity-type-1" };
        if (text.includes('insert into "Lead"')) {
          return { id: "lead-1", name: "Website Lead", email: "student@example.com", ownerId: null };
        }
        if (text.includes('insert into "Opportunity"')) {
          return { id: "opp-1", tenantId: form.tenantId, leadId: "lead-1", ownerId: null };
        }
        if (text.includes('insert into "Activity"')) {
          return { id: "activity-1", leadId: "lead-1", opportunityId: "opp-1" };
        }
        if (text.includes('insert into "Task"')) {
          return { id: "task-1", leadId: "lead-1", opportunityId: "opp-1" };
        }
        if (text.includes('insert into "FormSubmission"')) return { id: "submission-1" };
        return null;
      });

      queryMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "OpportunityType"')) return opportunityTypes;
        if (text.includes('from "AssignmentRule"')) return [];
        if (text.includes('from "AutomationV2"')) return [];
        return [];
      });

      executeMock.mockResolvedValue(1);
    }

    const BASE_FORM = {
      id: "form-1",
      tenantId: "tenant-1",
      name: "Website Application",
      description: null,
      fields: [] as any[],
      config: { duplicateAction: "CREATE", fields: [] as any[] },
      isActive: true,
      submitButtonText: "Submit",
      successMessage: "Thanks",
      redirectUrl: null,
      spamProtection: true,
      rateLimit: 10,
      duplicateAction: "CREATE",
      defaultOwnerId: "owner-1",
      theme: "default",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    it("submits a public form and creates related lead, opportunity, activity, and submission rows", async () => {
      setupMocks({
        form: {
          ...BASE_FORM,
          fields: [
            { id: "email", label: "Email", mapping: "lead.email" },
            { id: "course", label: "Course", mapping: "opportunity.title", sourceModule: "opportunity" },
            { id: "notes", label: "Notes", mapping: "activity.notes", sourceModule: "activity" },
            { id: "task", label: "Task", mapping: "task.title", sourceModule: "task" },
          ],
        },
        opportunityTypes: [{ id: "type-1", stages: [{ id: "stage-1", name: "New" }] }],
        leadOwnerId: "rep-1",
      });

      const { submitPublicForm } = await import("@/lib/repositories/forms-postgres");
      const result = await submitPublicForm("form-1", {
        "lead.email": "student@example.com",
        "opportunity.title": "MBA Application",
        "activity.notes": "Requested counselling",
        "task.title": "Call student",
        utm_campaign: "summer-intake",
      });

      expect(result).toEqual({ success: true, leadId: "lead-1", opportunityId: "opp-1", warnings: [] });
      expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Lead"'))).toBe(true);
      expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Opportunity"'))).toBe(true);
      expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Activity"'))).toBe(true);
      expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Task"'))).toBe(true);

      // The new opportunityId column (migration 0022) is set on FormSubmission, not just
      // buried in the data jsonb blob.
      const submissionCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "FormSubmission"'));
      expect(submissionCall).toBeTruthy();
      expect(String(submissionCall![0])).toContain('"opportunityId"');
      const submissionColumns = String(submissionCall![0]).match(/insert into "FormSubmission" \(([^)]+)\)/)?.[1] ?? "";
      const opportunityIdIndex = submissionColumns.split(",").map((c) => c.trim().replace(/"/g, "")).indexOf("opportunityId");
      expect(submissionCall![1][opportunityIdIndex]).toBe("opp-1");
    });

    it("resolves the Opportunity Type from the real selector field's submitted value, not whichever authoring-time tag was processed last (the bug being fixed)", async () => {
      setupMocks({
        form: {
          ...BASE_FORM,
          fields: [
            { id: "email", label: "Email", mapping: "lead.email" },
            // The real, end-user-facing selector -- never tagged with an opportunityTypeId itself.
            { id: "selector", label: "Opportunity Type", mapping: "opportunity.opportunityTypeId", sourceModule: "opportunity" },
            // Two fields sharing the same mapping, each authored under a DIFFERENT builder-context
            // type tag. Before the fix, whichever of these was processed last in form.config.fields
            // silently overwrote the runtime opportunityTypeId -- independent of what the field
            // below (the real selector) actually submitted.
            { id: "amountTypeA", label: "Amount", mapping: "opportunity.amount", sourceModule: "opportunity", opportunityTypeId: "type-a" },
            { id: "amountTypeB", label: "Amount", mapping: "opportunity.amount", sourceModule: "opportunity", opportunityTypeId: "type-b" },
          ],
        },
        opportunityTypes: [
          { id: "type-a", stages: [{ id: "stage-a", name: "New" }] },
          { id: "type-b", stages: [{ id: "stage-b", name: "New" }] },
        ],
        leadOwnerId: "rep-1",
      });

      const { submitPublicForm } = await import("@/lib/repositories/forms-postgres");
      await submitPublicForm("form-1", {
        "lead.email": "student@example.com",
        "opportunity.opportunityTypeId": "type-b",
        "opportunity.amount": "5000",
      });

      const opportunityInsertCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "Opportunity"'));
      expect(opportunityInsertCall).toBeTruthy();
      const columns = String(opportunityInsertCall![0]).match(/insert into "Opportunity" \(([^)]+)\)/)?.[1] ?? "";
      const columnNames = columns.split(",").map((c) => c.trim().replace(/"/g, ""));
      const typeIdIndex = columnNames.indexOf("opportunityTypeId");
      expect(typeIdIndex).toBeGreaterThanOrEqual(0);
      // Must match what the end user actually picked ("type-b"), not "type-a" (which would win
      // under the old bug purely because it happens to appear earlier in form.config.fields).
      expect(opportunityInsertCall![1][typeIdIndex]).toBe("type-b");
    });

    it("skips creating an Opportunity and returns a warning when the tenant has no active Opportunity Type", async () => {
      setupMocks({
        form: {
          ...BASE_FORM,
          fields: [
            { id: "email", label: "Email", mapping: "lead.email" },
            { id: "course", label: "Course", mapping: "opportunity.title", sourceModule: "opportunity" },
          ],
        },
        opportunityTypes: [],
        leadOwnerId: "rep-1",
      });

      const { submitPublicForm } = await import("@/lib/repositories/forms-postgres");
      const result = await submitPublicForm("form-1", {
        "lead.email": "student@example.com",
        "opportunity.title": "MBA Application",
      });

      expect(result.success).toBe(true);
      expect(result.leadId).toBe("lead-1");
      expect(result.opportunityId).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(queryOneMock.mock.calls.some((call) => String(call[0]).includes('insert into "Opportunity"'))).toBe(false);
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/repositories/opportunities-postgres", () => ({
  listOpportunityTypesForTenant: vi.fn(async () => []),
}));

describe("direct Postgres activities repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists activities with tenant scope and whitelisted filters", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "activity-1", typeId: "type-1", createdBy: "user-1" }])
      .mockResolvedValueOnce([{ id: "type-1", name: "Call" }])
      .mockResolvedValueOnce([{ id: "user-1", name: "User One" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listActivitiesForTenant } = await import("@/lib/repositories/activities-postgres");
    const result = await listActivitiesForTenant(
      { id: "user-1", tenantId: "tenant-1" },
      50,
      [
        {
          conditions: [
            { field: "notes", operator: "contains", value: "call" },
            { field: "notes; drop table Activity", operator: "equals", value: "bad" },
          ],
        },
      ],
    );

    expect(result.meta.total).toBe(1);
    expect(queryOneMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryOneMock.mock.calls[0][0]).toContain('"notes" ilike $2');
    expect(queryOneMock.mock.calls[0][0]).not.toContain("drop table");
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-1", "%call%"]);
  });
});

// F03 fix (WP04, slice 3): same field-permission enforcement as Leads/Opportunities, applied to
// Activities -- including the embedded lead/opportunity summaries hydrateActivities attaches,
// which come from their own direct raw fetch and would otherwise bypass those two repositories'
// masking entirely.
describe("F03 fix: Activity field-permission enforcement (hidden/readonly)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  const userWithHiddenNotes = {
    id: "user-1", tenantId: "tenant-1",
    role: { permissions: { fieldPermissions: { activities: { notes: "hidden" } } } },
  };

  it("masks a hidden activity field on list read", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "activity-1", typeId: "type-1", createdBy: "user-1", notes: "sensitive call notes" }])
      .mockResolvedValueOnce([{ id: "type-1", name: "Call" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listActivitiesForTenant } = await import("@/lib/repositories/activities-postgres");
    const result = await listActivitiesForTenant(userWithHiddenNotes, 50, null);

    expect((result.data[0] as any).notes).toBeNull();
    expect((result.data[0] as any).notesHidden).toBe(true);
  });

  it("masks a hidden field on the embedded lead summary too", async () => {
    const userWithHiddenLeadPhone = {
      id: "user-1", tenantId: "tenant-1",
      role: { permissions: { fieldPermissions: { leads: { phone: "hidden" } } } },
    };
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "activity-1", typeId: "type-1", createdBy: "user-1", leadId: "lead-1" }])
      .mockResolvedValueOnce([{ id: "type-1", name: "Call" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", phone: "555-1234", email: "a@x.com" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listActivitiesForTenant } = await import("@/lib/repositories/activities-postgres");
    const result = await listActivitiesForTenant(userWithHiddenLeadPhone, 50, null);

    expect((result.data[0] as any).lead.phone).toBeNull();
    expect((result.data[0] as any).lead.phoneHidden).toBe(true);
    expect((result.data[0] as any).lead.email).toBe("a@x.com"); // unrelated field unaffected
  });

  it("silently drops a readonly activity field from the update payload", async () => {
    const userWithReadonlyNotes = {
      id: "user-1", tenantId: "tenant-1",
      role: { permissions: { fieldPermissions: { activities: { notes: "readonly" } } } },
    };
    const existingRow = { id: "activity-1", tenantId: "tenant-1", typeId: "type-1", notes: "original notes", outcome: null };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "Activity"')) return { ...existingRow, outcome: "SUCCESS" };
      if (text.includes('from "Activity"')) return existingRow;
      return null;
    });
    queryMock.mockResolvedValue([]);

    const { updateActivityForTenant } = await import("@/lib/repositories/activities-postgres");
    await updateActivityForTenant(userWithReadonlyNotes, "activity-1", { notes: "attacker notes", outcome: "SUCCESS" });

    const updateCall = queryOneMock.mock.calls.find((call) => String(call[0]).startsWith('update "Activity"'));
    expect(updateCall).toBeDefined();
    const sql = String(updateCall![0]);
    const values = updateCall![1];
    // "notes" must not appear in the SET assignments at all -- the readonly write was dropped
    // entirely rather than applied.
    expect(sql.split(" where ")[0]).not.toContain('"notes" = ');
    expect(values).not.toContain("attacker notes");
  });
});

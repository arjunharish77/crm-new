import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

// WP08 (F13): updateLeadForTenant's/createLeadForTenant's atomic core now runs inside
// withTransaction, which normally acquires a REAL PoolClient from getPool(). Every test in this
// file mocks query()/queryOne()/execute() directly (asserting on call order/args), so
// withTransaction is mocked here to just invoke its callback with a stand-in client -- the
// mocked query/queryOne/execute functions ignore that extra `client` argument entirely, so
// existing assertions on call order and SQL/params keep working unchanged.
vi.mock("@/lib/db/transaction", () => ({
  withTransaction: (_user: unknown, fn: (client: unknown) => unknown) => fn({}),
}));

describe("direct Postgres leads repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists leads with tenant scope, owner scope, and whitelisted filters", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await listLeadsForTenant(
      {
        id: "user-1",
        tenantId: "tenant-1",
        role: { permissions: { recordAccess: "OWN" } },
      },
      1,
      25,
      [
        { field: "name", operator: "contains", value: "Alpha" },
        { field: "name; drop table Lead", operator: "equals", value: "bad" },
      ],
    );

    expect(result.meta.total).toBe(1);
    expect(queryOneMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryOneMock.mock.calls[0][0]).toContain('"ownerId" = $2');
    expect(queryOneMock.mock.calls[0][0]).toContain('"name" ilike $3');
    expect(queryOneMock.mock.calls[0][0]).not.toContain("drop table");
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-1", "user-1", "%Alpha%"]);
  });

  // F03 fix (WP04): "TEAM Records" has been selectable in the Roles UI for a while but was
  // never actually enforced -- it silently behaved like "ALL". Confirms the fix end to end
  // through the real listLeadsForTenant -> buildLeadWhere -> record-scope.ts path.
  it("scopes to team-membership, not tenant-wide, for a TEAM-access role", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock.mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-2" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    await listLeadsForTenant(
      { id: "user-1", tenantId: "tenant-1", teamId: "team-1", role: { permissions: { recordAccess: "TEAM" } } },
      1,
      25,
    );

    const sql = queryOneMock.mock.calls[0][0];
    expect(sql).toContain('"ownerId" in (select id from "User" where "tenantId" = $1 and "teamId"::text = $3)');
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-1", "user-1", "team-1"]);
  });

  // WP09 (F12): predictive-score fields now compile as an inline `id in (select ...)` subquery
  // as part of the real WHERE clause (see query-filters.ts's `subquery` descriptor), rather than
  // being resolved into a record-id list by a separate query and short-circuited before ever
  // touching "Lead" -- so this now genuinely runs the real count/list queries (mocked to return
  // zero rows, exactly like a real unmatched subquery would) instead of skipping them.
  it("returns an empty page when predictive score filters match no records, via a real subquery-shaped WHERE clause", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    queryMock.mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await listLeadsForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      1,
      10,
      [{ field: "predictiveScoreBand", operator: "equals", value: "HOT" }],
    );

    expect(result).toEqual({ data: [], meta: { total: 0, page: 1, last_page: 1, limit: 10, isComplete: true } });
    const countSql = queryOneMock.mock.calls[0][0];
    expect(countSql).toContain('id in (select "recordId" from "RecordScore" where "recordType" = $');
    expect(countSql).toContain('"scoreBand" = $');
  });

  // WP09 (F12): the audit's own worked example -- an OR group mixing a normal record field and a
  // predictive-score field must stay an OR at the SQL level, not silently become an AND once the
  // score condition is resolved separately (the bug this fix closes).
  it("keeps an OR group's own logic when it mixes a record field with a predictive-score field", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 3 });
    queryMock.mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    await listLeadsForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      1,
      10,
      [{ logic: "OR", conditions: [{ field: "source", operator: "equals", value: "web" }, { field: "predictiveScoreBand", operator: "equals", value: "HOT" }] }],
    );

    const countSql = queryOneMock.mock.calls[0][0];
    // A single parenthesized OR group, not two independent AND-ed clauses.
    expect(countSql).toMatch(/\("source" = \$\d+ OR id in \(select "recordId" from "RecordScore" where "recordType" = \$\d+ and "tenantId" = \$\d+ and "scoreBand" = \$\d+\)\)/);
  });

  it("enriches listed leads with a bulk pending-next-best-action count", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ recordId: "lead-1", count: 3 }]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await listLeadsForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      1,
      25,
    );

    expect(result.data[0].pendingNbaCount).toBe(3);
    const nbaCall = queryMock.mock.calls.find((call) => String(call[0]).includes('from "NextBestActionRecommendation"'));
    expect(nbaCall![0]).toContain("'PENDING'");
    expect(nbaCall![0]).toContain("group by");
  });

  describe("getLeadStatusCountsForTenant (gap checklist Module 17, item 25 -- view-level count chips)", () => {
    it("groups by status, scoped to the tenant and merged-away leads excluded", async () => {
      queryMock.mockResolvedValueOnce([
        { status: "NEW", count: 5 },
        { status: "QUALIFIED", count: 2 },
      ]);

      const { getLeadStatusCountsForTenant } = await import("@/lib/repositories/leads-postgres");
      const result = await getLeadStatusCountsForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(result).toEqual([
        { status: "NEW", count: 5 },
        { status: "QUALIFIED", count: 2 },
      ]);
      expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
      expect(queryMock.mock.calls[0][0]).toContain('"mergedIntoId" is null');
      // Grouped by the normalised status key (tenant-configurable statuses, UI/UX plan decision 6).
      expect(queryMock.mock.calls[0][0]).toContain("crm_lead_status_key(status) as status");
      expect(queryMock.mock.calls[0][0]).toContain("group by 1");
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1"]);
    });

    it("scopes to the viewer's own leads for an OWN-record-access user, same as listLeadsForTenant", async () => {
      queryMock.mockResolvedValueOnce([{ status: "NEW", count: 1 }]);

      const { getLeadStatusCountsForTenant } = await import("@/lib/repositories/leads-postgres");
      await getLeadStatusCountsForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } });

      expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = $2');
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "user-1"]);
    });
  });

  // WP09 (F11): real SQL aggregation for getPeriodComparisonReportForTenant (inbuilt-reports.ts)
  // -- replaces fetching up to 1000 leads tenant-wide and filtering by date range in JS (which
  // silently under-counted a period whose real leads fell outside that top-1000-by-createdAt
  // slice) with one `count(*) filter (where ...)` query per range against the FULL matching set.
  describe("getLeadPeriodCountsForTenant (WP09/F11: real SQL aggregation, no row cap)", () => {
    it("issues a single count(*) filter query scoped by the same tenant/scope where-clause as listLeadsForTenant, with both date ranges as filter bounds", async () => {
      queryOneMock.mockResolvedValueOnce({ current: 12, previous: 30 });

      const { getLeadPeriodCountsForTenant } = await import("@/lib/repositories/leads-postgres");
      const currentRange = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };
      const previousRange = { start: new Date("2026-07-01T00:00:00.000Z"), end: new Date("2026-08-01T00:00:00.000Z") };
      const result = await getLeadPeriodCountsForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        currentRange,
        previousRange,
      );

      expect(result).toEqual({ current: 12, previous: 30 });
      // Not a plain `select ... from "Lead"` fetch -- a real aggregate query.
      expect(queryOneMock.mock.calls[0][0]).toContain("count(*) filter");
      expect(queryOneMock.mock.calls[0][0]).toContain('from "Lead"');
      // Same tenant/soft-merge scoping buildLeadWhere applies everywhere else.
      expect(queryOneMock.mock.calls[0][0]).toContain('"tenantId" = $1');
      expect(queryOneMock.mock.calls[0][0]).toContain('"mergedIntoId" is null');
      expect(queryOneMock.mock.calls[0][1]).toEqual([
        "tenant-1",
        currentRange.start.toISOString(),
        currentRange.end.toISOString(),
        previousRange.start.toISOString(),
        previousRange.end.toISOString(),
      ]);
    });

    it("scopes to the viewer's own leads for an OWN-record-access user, same as listLeadsForTenant", async () => {
      queryOneMock.mockResolvedValueOnce({ current: 0, previous: 0 });
      const { getLeadPeriodCountsForTenant } = await import("@/lib/repositories/leads-postgres");
      const range = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };

      await getLeadPeriodCountsForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } },
        range,
        range,
      );

      expect(queryOneMock.mock.calls[0][0]).toContain('"ownerId" = $2');
      expect(queryOneMock.mock.calls[0][1][0]).toBe("tenant-1");
      expect(queryOneMock.mock.calls[0][1][1]).toBe("user-1");
    });

    it("defaults to 0/0 when no row comes back", async () => {
      queryOneMock.mockResolvedValueOnce(null);
      const { getLeadPeriodCountsForTenant } = await import("@/lib/repositories/leads-postgres");
      const range = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };

      const result = await getLeadPeriodCountsForTenant({ id: "user-1", tenantId: "tenant-1" }, range, range);
      expect(result).toEqual({ current: 0, previous: 0 });
    });
  });
});

// Gap checklist Module 10's tests bullet -- "inline edit audit logs" (Leads' inline status-cell
// edit calls this same updateLeadForTenant path).
describe("updateLeadForTenant audit logging", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    queryMock.mockResolvedValue([]);
    executeMock.mockResolvedValue(undefined);
  });

  it("writes an AuditLog UPDATE entry with a diff reflecting the changed status field", async () => {
    const existingRow = {
      id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: null,
      company: null, source: null, status: "NEW", ownerId: null,
    };
    const updatedRow = { ...existingRow, status: "QUALIFIED" };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "Lead"')) return updatedRow;
      if (text.includes('from "Lead"')) return existingRow;
      return null;
    });

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await updateLeadForTenant({ id: "user-1", tenantId: "tenant-1" }, "lead-1", { status: "QUALIFIED" });

    const auditCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "AuditLog"'));
    expect(auditCall).toBeDefined();
    const values = auditCall![1];
    expect(values[3]).toBe("UPDATE");
    expect(values[4]).toBe("LEAD");
    expect(values[5]).toBe("lead-1");
    expect(values[8]).toMatchObject({ status: { before: "NEW", after: "QUALIFIED" } });
  });

  it("does not write an AuditLog entry when the update is a no-op (nothing actually changed)", async () => {
    const existingRow = {
      id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: null,
      company: null, source: null, status: "NEW", ownerId: null,
    };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "Lead"')) return existingRow;
      if (text.includes('from "Lead"')) return existingRow;
      return null;
    });

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await updateLeadForTenant({ id: "user-1", tenantId: "tenant-1" }, "lead-1", {});

    const auditCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "AuditLog"'));
    expect(auditCall).toBeDefined();
    const values = auditCall![1];
    expect(values[8]).toBeNull(); // diff is null when nothing changed
  });

  it("returns null and writes no audit entry when the lead doesn't exist for this tenant", async () => {
    queryOneMock.mockResolvedValue(null);

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await updateLeadForTenant({ id: "user-1", tenantId: "tenant-1" }, "missing-lead", { status: "QUALIFIED" });

    expect(result).toBeNull();
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AuditLog"'))).toBe(false);
  });
});

// F03 fix (WP04): the field-permission model (Role/PermissionTemplate.permissions.fieldPermissions,
// "editable"/"readonly"/"hidden") previously only applied to the report-builder path -- these
// tests cover its new enforcement in the core Lead read/write repository.
describe("F03 fix: field-permission enforcement (hidden/readonly)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    queryMock.mockResolvedValue([]);
    executeMock.mockResolvedValue(undefined);
  });

  const userWithHiddenPhone = {
    id: "user-1",
    tenantId: "tenant-1",
    role: { permissions: { fieldPermissions: { leads: { phone: "hidden" } } } },
  };
  const userWithReadonlyEmail = {
    id: "user-1",
    tenantId: "tenant-1",
    role: { permissions: { fieldPermissions: { leads: { email: "readonly" } } } },
  };

  it("masks a hidden field to null (with a *Hidden flag) on a normal read", async () => {
    const row = { id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: "555-1234", company: null, source: null, status: "NEW", ownerId: null };
    queryOneMock.mockResolvedValueOnce(row);

    const { getLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const result: any = await getLeadForTenant(userWithHiddenPhone, "lead-1");

    expect(result.phone).toBeNull();
    expect(result.phoneHidden).toBe(true);
    expect(result.email).toBe("a@x.com"); // unrelated field unaffected
  });

  it("does NOT overwrite a hidden field's real stored value when an update omits it (regression guard)", async () => {
    const existingRow = { id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: "555-1234", company: null, source: null, status: "NEW", ownerId: null };
    const updatedRow = { ...existingRow, status: "QUALIFIED" };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "Lead"')) return updatedRow;
      if (text.includes('from "Lead"')) return existingRow;
      return null;
    });

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    // This user cannot see "phone" (masked to null on read) -- updating an unrelated field
    // (status) must not turn that masked null into the ACTUAL stored value.
    await updateLeadForTenant(userWithHiddenPhone, "lead-1", { status: "QUALIFIED" });

    const updateCall = queryOneMock.mock.calls.find((call) => String(call[0]).startsWith('update "Lead"'));
    expect(updateCall).toBeDefined();
    const [, values] = updateCall!;
    // phone is bound value index 2 (name, email, phone, ...) -- must be the real "555-1234",
    // never null, even though this user's own read of "existing" would show it masked.
    expect(values[2]).toBe("555-1234");
  });

  it("silently drops a readonly field from the update payload instead of applying it", async () => {
    const existingRow = { id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: null, company: null, source: null, status: "NEW", ownerId: null };
    const updatedRow = { ...existingRow };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "Lead"')) return updatedRow;
      if (text.includes('from "Lead"')) return existingRow;
      return null;
    });

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await updateLeadForTenant(userWithReadonlyEmail, "lead-1", { email: "attacker-supplied@x.com" });

    const updateCall = queryOneMock.mock.calls.find((call) => String(call[0]).startsWith('update "Lead"'));
    const [, values] = updateCall!;
    expect(values[1]).toBe("a@x.com"); // unchanged -- the readonly field write was dropped, not applied
  });

  it("behaves exactly as before when no fieldPermissions are configured (backward compatible default)", async () => {
    const row = { id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: "555-1234", company: null, source: null, status: "NEW", ownerId: null };
    queryOneMock.mockResolvedValueOnce(row);

    const { getLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const result: any = await getLeadForTenant({ id: "user-1", tenantId: "tenant-1" }, "lead-1");

    expect(result.phone).toBe("555-1234");
    expect(result.phoneHidden).toBeUndefined();
  });
});

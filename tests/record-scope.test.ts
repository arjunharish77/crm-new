import { describe, expect, it } from "vitest";
import { applyRecordScopeClause, recordAccessLevel } from "@/lib/server/record-scope";

// F03 fix (WP04): Role.permissions.recordAccess has offered OWN/TEAM/ALL in the Roles settings
// UI for a while, but only OWN was ever actually enforced -- "TEAM" silently behaved like "ALL".
describe("recordAccessLevel", () => {
  it("treats a partner role as OWN regardless of its recordAccess value", () => {
    expect(recordAccessLevel({ id: "u1", tenantId: "t1", role: { permissions: { isPartnerRole: true, recordAccess: "ALL" } } })).toBe("OWN");
  });

  it("reads OWN/TEAM/ALL from recordAccess", () => {
    expect(recordAccessLevel({ id: "u1", tenantId: "t1", role: { permissions: { recordAccess: "OWN" } } })).toBe("OWN");
    expect(recordAccessLevel({ id: "u1", tenantId: "t1", role: { permissions: { recordAccess: "TEAM" } } })).toBe("TEAM");
    expect(recordAccessLevel({ id: "u1", tenantId: "t1", role: { permissions: { recordAccess: "ALL" } } })).toBe("ALL");
  });

  it("defaults to ALL (unchanged existing behavior) when recordAccess is unset", () => {
    expect(recordAccessLevel({ id: "u1", tenantId: "t1", role: { permissions: {} } })).toBe("ALL");
    expect(recordAccessLevel({ id: "u1", tenantId: "t1" })).toBe("ALL");
  });
});

describe("applyRecordScopeClause", () => {
  it("adds no clause at all for ALL scope", () => {
    const clauses: string[] = [];
    const values: unknown[] = ["tenant-1"];
    applyRecordScopeClause(clauses, values, { id: "u1", tenantId: "t1", role: { permissions: { recordAccess: "ALL" } } }, "LEAD", 1);
    expect(clauses).toEqual([]);
    expect(values).toEqual(["tenant-1"]); // untouched
  });

  it("scopes to ownerId + RecordShare for OWN", () => {
    const clauses: string[] = [];
    const values: unknown[] = ["tenant-1"];
    applyRecordScopeClause(clauses, values, { id: "u1", tenantId: "t1", role: { permissions: { recordAccess: "OWN" } } }, "LEAD", 1);
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toContain('"ownerId" = $2');
    expect(clauses[0]).toContain('"recordType" = \'LEAD\'');
    expect(values).toEqual(["tenant-1", "u1"]);
  });

  it("scopes to team-membership + RecordShare for TEAM with a team assigned", () => {
    const clauses: string[] = [];
    const values: unknown[] = ["tenant-1"];
    applyRecordScopeClause(clauses, values, { id: "u1", tenantId: "t1", teamId: "team-1", role: { permissions: { recordAccess: "TEAM" } } }, "OPPORTUNITY", 1);
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toContain('"ownerId" in (select id from "User" where "tenantId" = $1 and "teamId"::text = $3)');
    expect(clauses[0]).toContain('"recordType" = \'OPPORTUNITY\'');
    expect(values).toEqual(["tenant-1", "u1", "team-1"]);
  });

  it("falls back to OWN-only behavior for TEAM scope when the user has no team assigned", () => {
    const clauses: string[] = [];
    const values: unknown[] = ["tenant-1"];
    applyRecordScopeClause(clauses, values, { id: "u1", tenantId: "t1", teamId: null, role: { permissions: { recordAccess: "TEAM" } } }, "LEAD", 1);
    expect(clauses[0]).toContain('"ownerId" = $2');
    expect(clauses[0]).not.toContain('"ownerId" in (select id from "User"'); // no team-membership subquery
    expect(values).toEqual(["tenant-1", "u1"]); // no team param pushed
  });

  it("still scopes correctly with no tenant column context (tenantIdParam null)", () => {
    const clauses: string[] = [];
    const values: unknown[] = [];
    applyRecordScopeClause(clauses, values, { id: "u1", tenantId: null, role: { permissions: { recordAccess: "OWN" } } }, "LEAD", null);
    expect(clauses).toEqual(['("ownerId" = $1)']);
    expect(values).toEqual(["u1"]);
  });

  // The alias parameter is what exports.ts's fetchExportRows uses (its Lead/Opportunity export
  // queries join User/RecordScore, so an unqualified "ownerId"/"tenantId"/"id" reference would
  // either be ambiguous or resolve to the wrong table).
  // WP04 fix: a marketplace app's `id` is its MarketplaceApp id (kept as-is for audit/createdBy
  // attribution) -- when a tenant admin configures OWN/TEAM scope for an app install, the actual
  // ownerId/team-membership check must run against a designated real internal user instead, via
  // `recordScopeActorId`, without changing what `id` means anywhere else.
  describe("recordScopeActorId (marketplace-app OWN/TEAM scope)", () => {
    it("uses recordScopeActorId instead of id for the OWN ownerId match when set", () => {
      const clauses: string[] = [];
      const values: unknown[] = ["tenant-1"];
      applyRecordScopeClause(
        clauses,
        values,
        { id: "app-1", tenantId: "t1", recordScopeActorId: "user-42", role: { permissions: { recordAccess: "OWN" } } },
        "LEAD",
        1,
      );
      expect(clauses[0]).toContain('"ownerId" = $2');
      expect(values).toEqual(["tenant-1", "user-42"]); // the app's own id ("app-1") never appears
    });

    it("uses recordScopeActorId for the TEAM membership subquery's sharedUserIds check too", () => {
      const clauses: string[] = [];
      const values: unknown[] = ["tenant-1"];
      applyRecordScopeClause(
        clauses,
        values,
        { id: "app-1", tenantId: "t1", teamId: "team-1", recordScopeActorId: "user-42", role: { permissions: { recordAccess: "TEAM" } } },
        "OPPORTUNITY",
        1,
      );
      expect(values).toEqual(["tenant-1", "user-42", "team-1"]);
      expect(clauses[0]).not.toContain("app-1");
    });

    it("falls back to id when recordScopeActorId is not set (real internal users, unchanged)", () => {
      const clauses: string[] = [];
      const values: unknown[] = ["tenant-1"];
      applyRecordScopeClause(clauses, values, { id: "u1", tenantId: "t1", role: { permissions: { recordAccess: "OWN" } } }, "LEAD", 1);
      expect(values).toEqual(["tenant-1", "u1"]);
    });
  });

  describe("with a table alias (multi-join export queries)", () => {
    it("qualifies ownerId/id with the alias for OWN scope", () => {
      const clauses: string[] = [];
      const values: unknown[] = ["tenant-1"];
      applyRecordScopeClause(clauses, values, { id: "u1", tenantId: "t1", role: { permissions: { recordAccess: "OWN" } } }, "LEAD", 1, "l");
      expect(clauses[0]).toContain('l."ownerId" = $2');
      expect(clauses[0]).toContain('l."id" = any(select rs."recordId"');
      expect(clauses[0]).not.toMatch(/(?<!l\.)"ownerId"/); // never unqualified
    });

    it("qualifies ownerId with the alias for TEAM scope's membership subquery", () => {
      const clauses: string[] = [];
      const values: unknown[] = ["tenant-1"];
      applyRecordScopeClause(clauses, values, { id: "u1", tenantId: "t1", teamId: "team-1", role: { permissions: { recordAccess: "TEAM" } } }, "OPPORTUNITY", 1, "o");
      expect(clauses[0]).toContain('o."ownerId" in (select id from "User" where "tenantId" = $1 and "teamId"::text = $3)');
      expect(values).toEqual(["tenant-1", "u1", "team-1"]);
    });
  });
});

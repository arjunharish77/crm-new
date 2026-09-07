import { beforeEach, describe, expect, it } from "vitest";
import { applyFilterCondition, buildGroupedFilterClause, resolveRelativeDateRange } from "@/lib/query-filters";

const TZ = "Asia/Kolkata"; // UTC+5:30, no DST -- deterministic for exact-instant assertions.

// Gap checklist Module 10's universal advanced filter drawer -- this shared module replaces
// three near-identical, independently-duplicated (and identically incomplete) operator-mapping
// functions previously living in leads-postgres.ts/opportunities-postgres.ts/
// activities-postgres.ts, none of which actually implemented before/after/between/is_empty/
// is_not_empty/starts_with/ends_with/includes* despite the frontend already offering them.
describe("resolveRelativeDateRange", () => {
  const now = new Date("2026-03-15T10:00:00Z"); // 2026-03-15 15:30 IST

  it("resolves @today to the IST calendar day containing `now`", () => {
    expect(resolveRelativeDateRange("@today", TZ, now)).toEqual({
      start: "2026-03-14T18:30:00.000Z",
      end: "2026-03-15T18:30:00.000Z",
    });
  });

  it("resolves @yesterday to the day before", () => {
    expect(resolveRelativeDateRange("@yesterday", TZ, now)).toEqual({
      start: "2026-03-13T18:30:00.000Z",
      end: "2026-03-14T18:30:00.000Z",
    });
  });

  it("resolves @last_7_days to a 7-day window ending after today", () => {
    expect(resolveRelativeDateRange("@last_7_days", TZ, now)).toEqual({
      start: "2026-03-07T18:30:00.000Z",
      end: "2026-03-15T18:30:00.000Z",
    });
  });

  it("resolves @this_month to the full IST calendar month", () => {
    expect(resolveRelativeDateRange("@this_month", TZ, now)).toEqual({
      start: "2026-02-28T18:30:00.000Z",
      end: "2026-03-31T18:30:00.000Z",
    });
  });

  it("resolves @last_month to the previous full IST calendar month", () => {
    expect(resolveRelativeDateRange("@last_month", TZ, now)).toEqual({
      start: "2026-01-31T18:30:00.000Z",
      end: "2026-02-28T18:30:00.000Z",
    });
  });

  it("resolves @this_year to the full IST calendar year", () => {
    expect(resolveRelativeDateRange("@this_year", TZ, now)).toEqual({
      start: "2025-12-31T18:30:00.000Z",
      end: "2026-12-31T18:30:00.000Z",
    });
  });

  it("crosses a year boundary correctly for @last_month in January", () => {
    const january = new Date("2026-01-15T10:00:00Z");
    expect(resolveRelativeDateRange("@last_month", TZ, january)).toEqual({
      start: "2025-11-30T18:30:00.000Z",
      end: "2025-12-31T18:30:00.000Z",
    });
  });

  it("returns null for an unrecognized token", () => {
    expect(resolveRelativeDateRange("@not_a_real_token", TZ, now)).toBeNull();
  });
});

describe("applyFilterCondition", () => {
  let clauses: string[];
  let values: unknown[];

  beforeEach(() => {
    clauses = [];
    values = [];
  });

  it("equals: binds a scalar value", () => {
    applyFilterCondition(clauses, values, "status", "equals", "NEW", "select");
    expect(clauses).toEqual(['"status" = $1']);
    expect(values).toEqual(["NEW"]);
  });

  it("equals: an array value becomes an any() text match", () => {
    applyFilterCondition(clauses, values, "status", "equals", ["NEW", "QUALIFIED"], "select");
    expect(clauses[0]).toContain("any($1::text[])");
    expect(values).toEqual([["NEW", "QUALIFIED"]]);
  });

  it("is_empty: real for the first time -- previously produced no clause at all", () => {
    applyFilterCondition(clauses, values, "company", "is_empty", null, "text");
    expect(clauses).toEqual([`("company" is null or "company"::text = '')`]);
    expect(values).toEqual([]);
  });

  it("is_not_empty: the tags variant checks array_length", () => {
    applyFilterCondition(clauses, values, "tags", "is_not_empty", null, "tags");
    expect(clauses).toEqual([`("tags" is not null and array_length("tags", 1) > 0)`]);
  });

  it("starts_with / ends_with: real for the first time", () => {
    applyFilterCondition(clauses, values, "name", "starts_with", "Jo", "text");
    applyFilterCondition(clauses, values, "name", "ends_with", "son", "text");
    expect(clauses).toEqual([`"name" ilike $1`, `"name" ilike $2`]);
    expect(values).toEqual(["Jo%", "%son"]);
  });

  it("includes_all vs includes_any on a tags column", () => {
    applyFilterCondition(clauses, values, "tags", "includes_all", ["hot", "vip"], "tags");
    applyFilterCondition(clauses, values, "tags", "includes_any", ["hot", "vip"], "tags");
    expect(clauses[0]).toContain("@>");
    expect(clauses[1]).toContain("&&");
  });

  it("before/after: real for the first time -- resolves a literal date to a whole-day boundary", () => {
    applyFilterCondition(clauses, values, "createdAt", "before", "2026-03-15", "date", TZ);
    expect(clauses).toEqual([`"createdAt" < $1`]);
    expect(values).toEqual(["2026-03-14T18:30:00.000Z"]);
  });

  it("date equals: expands a literal date into the whole calendar day, not an exact-instant match", () => {
    applyFilterCondition(clauses, values, "createdAt", "equals", "2026-03-15", "date", TZ);
    expect(clauses[0]).toBe(`"createdAt" >= $1 and "createdAt" < $2`);
    expect(values).toEqual(["2026-03-14T18:30:00.000Z", "2026-03-15T18:30:00.000Z"]);
  });

  it("date between: two literal dates resolve to a start..end range", () => {
    applyFilterCondition(clauses, values, "createdAt", "between", ["2026-03-01", "2026-03-15"], "date", TZ);
    expect(clauses[0]).toBe(`"createdAt" >= $1 and "createdAt" < $2`);
    expect(values).toEqual(["2026-02-28T18:30:00.000Z", "2026-03-15T18:30:00.000Z"]);
  });

  it("returns no clause for an unrecognized date value (neither a token nor a parseable date)", () => {
    applyFilterCondition(clauses, values, "createdAt", "equals", "not-a-date", "date");
    expect(clauses).toEqual([]);
    expect(values).toEqual([]);
  });

  it("greater_than_or_equal / less_than_or_equal (and their legacy gte/lte aliases)", () => {
    applyFilterCondition(clauses, values, "score", "greater_than_or_equal", 10, "number");
    applyFilterCondition(clauses, values, "score", "gte", 10, "number");
    applyFilterCondition(clauses, values, "score", "less_than_or_equal", 90, "number");
    applyFilterCondition(clauses, values, "score", "lte", 90, "number");
    expect(clauses).toEqual([`"score" >= $1`, `"score" >= $2`, `"score" <= $3`, `"score" <= $4`]);
  });
});

const LEAD_COLUMNS = new Map<string, { column: string; kind: import("@/lib/query-filters").FilterValueKind }>([
  ["status", { column: "status", kind: "select" }],
  ["source", { column: "source", kind: "text" }],
  ["score", { column: "score", kind: "number" }],
]);

// Real bug found and fixed while unifying the three modules' filter builders: every module's own
// buildWhere-style function flattened every group's conditions and ANDed them ALL together
// unconditionally, completely ignoring each group's own `logic` -- a user picking "Match ANY
// (OR)" for a group got that group's conditions silently ANDed together instead, with no error.
describe("buildGroupedFilterClause", () => {
  let clauses: string[];
  let values: unknown[];

  beforeEach(() => {
    clauses = ['"tenantId" = $1'];
    values = ["tenant-1"];
  });

  it("honors a single group's OR logic -- previously always produced AND regardless", () => {
    buildGroupedFilterClause(clauses, values, [
      { logic: "OR", conditions: [{ field: "status", operator: "equals", value: "NEW" }, { field: "source", operator: "equals", value: "WEB" }] },
    ], LEAD_COLUMNS);
    expect(clauses).toEqual(['"tenantId" = $1', '("status" = $2 OR "source" = $3)']);
    expect(values).toEqual(["tenant-1", "NEW", "WEB"]);
  });

  it("ANDs multiple groups together, each still honoring its own logic", () => {
    buildGroupedFilterClause(clauses, values, [
      { logic: "OR", conditions: [{ field: "status", operator: "equals", value: "NEW" }, { field: "status", operator: "equals", value: "QUALIFIED" }] },
      { logic: "AND", conditions: [{ field: "source", operator: "equals", value: "WEB" }] },
    ], LEAD_COLUMNS);
    expect(clauses).toEqual([
      '"tenantId" = $1',
      '("status" = $2 OR "status" = $3)',
      '"source" = $4',
    ]);
  });

  it("treats a bare condition (no conditions array) as its own single-condition group", () => {
    buildGroupedFilterClause(clauses, values, [{ field: "score", operator: "greater_than", value: 50 }], LEAD_COLUMNS);
    expect(clauses).toEqual(['"tenantId" = $1', '"score" > $2']);
  });

  it("skips a group that resolves to zero real conditions (unknown field, or none set)", () => {
    buildGroupedFilterClause(clauses, values, [{ logic: "AND", conditions: [{ field: "", operator: "equals", value: "x" }] }], LEAD_COLUMNS);
    expect(clauses).toEqual(['"tenantId" = $1']);
  });

  it("continues placeholder numbering from whatever the caller already pushed", () => {
    buildGroupedFilterClause(clauses, values, [{ field: "status", operator: "equals", value: "NEW" }], LEAD_COLUMNS);
    expect(clauses[1]).toBe('"status" = $2');
    expect(values[1]).toBe("NEW");
  });
});

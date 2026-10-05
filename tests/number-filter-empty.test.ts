import { describe, expect, it } from "vitest";
import { applyFilterCondition, assertFilterGroupsSupported, UnsupportedFilterError, type FilterColumnEntry } from "@/lib/query-filters";

describe("number filters with a value that isn't a number", () => {
  it("add no condition for an empty or non-numeric value (Sentry: invalid input syntax for type integer)", () => {
    for (const value of ["", "  ", "abc", null, undefined]) {
      const clauses: string[] = [];
      const values: unknown[] = [];
      applyFilterCondition(clauses, values, "score", "equals", value, "number");
      expect(clauses).toEqual([]);
      expect(values).toEqual([]);
    }
  });

  it("compare numbers, including numbers sent as text", () => {
    const clauses: string[] = [];
    const values: unknown[] = [];
    applyFilterCondition(clauses, values, "score", "greater_than", "40", "number");
    expect(clauses).toEqual(['"score" > $1']);
    expect(values).toEqual([40]);
  });

  it("make a strict (Smart View) filter say which condition can't be applied", () => {
    const columns = new Map<string, FilterColumnEntry>([["score", { column: "score", kind: "number" }]]);
    expect(() => assertFilterGroupsSupported([{ logic: "AND", conditions: [{ field: "score", operator: "equals", value: "" }] }], columns)).toThrow(UnsupportedFilterError);
  });
});

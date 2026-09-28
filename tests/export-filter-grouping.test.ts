import { describe, expect, it } from "vitest";
import { applyMappedConditions, filterGroups } from "@/lib/server/exports";

// WP09 (F12): the export path's filter compiler previously flattened every group's conditions
// into one flat array (filterConditions) and ANDed them all together unconditionally -- silently
// discarding any group the user configured as "Match ANY (OR)" in the advanced filter drawer.
// filterGroups/applyMappedConditions now preserve each group's own AND/OR logic, matching
// buildGroupedFilterClause's already-correct behavior on the list/view surface (query-filters.ts)
// -- so "exporting a view exports the actual view" holds for group logic, not just field/value
// selection.
describe("exports.ts filter grouping", () => {
  it("filterGroups preserves each group's own logic instead of flattening", () => {
    const groups = filterGroups([
      { logic: "OR", conditions: [{ field: "source", operator: "equals", value: "web" }, { field: "status", operator: "equals", value: "NEW" }] },
      { logic: "AND", conditions: [{ field: "score", operator: "greater_than", value: 50 }] },
    ]);
    expect(groups).toEqual([
      { logic: "OR", conditions: [{ field: "source", operator: "equals", value: "web" }, { field: "status", operator: "equals", value: "NEW" }] },
      { logic: "AND", conditions: [{ field: "score", operator: "greater_than", value: 50 }] },
    ]);
  });

  it("defaults a bare (non-grouped) conditions array to a single AND group, unchanged from before", () => {
    const groups = filterGroups({ conditions: [{ field: "status", operator: "equals", value: "NEW" }] });
    expect(groups).toEqual([{ logic: "AND", conditions: [{ field: "status", operator: "equals", value: "NEW" }] }]);
  });

  it("drops empty groups (no conditions) rather than emitting a stray always-true clause", () => {
    const groups = filterGroups([{ logic: "OR", conditions: [] }, { logic: "AND", conditions: [{ field: "status", operator: "equals", value: "NEW" }] }]);
    expect(groups).toHaveLength(1);
  });

  it("applyMappedConditions wraps an OR group's conditions in parens joined by OR, not AND", () => {
    const clauses: string[] = [];
    const values: unknown[] = [];
    applyMappedConditions(
      clauses,
      values,
      [{ logic: "OR", conditions: [{ field: "source", operator: "equals", value: "web" }, { field: "status", operator: "equals", value: "NEW" }] }],
      new Map([["source", "l.source"], ["status", "l.status"]]),
    );
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatch(/^\(l\.source = \$\d+ OR l\.status = \$\d+\)$/);
  });

  it("multiple groups are still ANDed together, each with its own internal logic intact", () => {
    const clauses: string[] = [];
    const values: unknown[] = [];
    applyMappedConditions(
      clauses,
      values,
      [
        { logic: "OR", conditions: [{ field: "source", operator: "equals", value: "web" }, { field: "source", operator: "equals", value: "referral" }] },
        { logic: "AND", conditions: [{ field: "status", operator: "equals", value: "NEW" }] },
      ],
      new Map([["source", "l.source"], ["status", "l.status"]]),
    );
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toMatch(/^\(l\.source = \$\d+ OR l\.source = \$\d+\)$/);
    expect(clauses[1]).toMatch(/^l\.status = \$\d+$/);
  });

  it("a single-condition group is not wrapped in redundant parens", () => {
    const clauses: string[] = [];
    const values: unknown[] = [];
    applyMappedConditions(clauses, values, [{ logic: "OR", conditions: [{ field: "status", operator: "equals", value: "NEW" }] }], new Map([["status", "l.status"]]));
    expect(clauses).toEqual(["l.status = $1"]);
  });
});

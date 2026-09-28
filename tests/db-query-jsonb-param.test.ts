import { describe, expect, it } from "vitest";
import { jsonbParam } from "@/lib/db/query";

// WP11 (bug found while verifying WP10/F18 against a real running worker): node-postgres
// serializes a plain JS OBJECT parameter into a jsonb column correctly (auto JSON.stringify),
// but a plain JS ARRAY parameter is instead converted to a Postgres ARRAY literal
// ("{...,...}") -- not valid JSON, and worse, silently WRONG for an empty array (`[]` becomes
// the Postgres empty-array literal `{}`, which is valid JSON for an empty OBJECT). Confirmed
// directly against real Postgres (see 25_AUDIT_REMEDIATION_PLAN.md WP11) before this fix.
describe("jsonbParam", () => {
  it("serializes an array to its exact JSON string form", () => {
    expect(jsonbParam(["a", "b"])).toBe('["a","b"]');
  });

  it("serializes an EMPTY array as '[]', not the Postgres empty-array literal that silently becomes {}", () => {
    expect(jsonbParam([])).toBe("[]");
  });

  it("serializes an array of objects correctly", () => {
    expect(jsonbParam([{ type: "a" }, { type: "b" }])).toBe('[{"type":"a"},{"type":"b"}]');
  });

  it("serializes a plain object the same way node-postgres's own default serializer would", () => {
    expect(jsonbParam({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });

  it("serializes null/undefined as the literal JSON null, not the string \"undefined\"", () => {
    expect(jsonbParam(null)).toBe("null");
    expect(jsonbParam(undefined)).toBe("null");
  });

  it("round-trips cleanly through JSON.parse", () => {
    const value = [{ id: "1", nested: { x: [1, 2, 3] } }];
    expect(JSON.parse(jsonbParam(value))).toEqual(value);
  });
});

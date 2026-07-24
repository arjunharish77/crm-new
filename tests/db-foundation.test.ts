import { describe, expect, it } from "vitest";
import { parsePage } from "@/lib/db/pagination";
import { assertSafeIdentifier, columnIdentifier, orderDirection } from "@/lib/db/sql";

describe("direct Postgres DB foundation", () => {
  it("normalizes pagination with sane caps", () => {
    expect(parsePage({ limit: 5000, offset: -10, maxLimit: 100 })).toEqual({ limit: 100, offset: 0 });
    expect(parsePage({ limit: "25", offset: "50" })).toEqual({ limit: 25, offset: 50 });
  });

  it("allows only safe SQL identifiers", () => {
    expect(columnIdentifier("tenantId")).toBe('"tenantId"');
    expect(() => assertSafeIdentifier("tenantId; drop table Lead")).toThrow(/Unsafe SQL identifier/);
  });

  it("normalizes order direction", () => {
    expect(orderDirection("asc")).toBe("asc");
    expect(orderDirection("ASC")).toBe("asc");
    expect(orderDirection("anything-else")).toBe("desc");
  });
});

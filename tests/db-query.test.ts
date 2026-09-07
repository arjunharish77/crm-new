import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gap checklist Module 17, item 24 (analytics performance layer: "slow-query observability").
// db/query.ts's query/queryOne/execute is the single choke point every query in the app goes
// through (reports included) -- these tests exercise the REAL module (no mocking of
// @/lib/db/query itself), passing an explicit mock `client` to bypass the real Postgres pool.
describe("db/query.ts slow-query observability", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    delete process.env.SLOW_QUERY_THRESHOLD_MS;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete process.env.SLOW_QUERY_THRESHOLD_MS;
  });

  it("does not warn for a query well under the default threshold", async () => {
    const { query } = await import("@/lib/db/query");
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };

    const rows = await query("select 1", [], client as any);

    expect(rows).toEqual([{ id: 1 }]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns with duration, row count, and truncated SQL once a query exceeds the configured threshold", async () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = "10";
    const { query } = await import("@/lib/db/query");
    const client = {
      query: vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ rows: [{ id: 1 }, { id: 2 }] }), 30))),
    };

    const rows = await query('select * from "Lead" where 1=1', [], client as any);

    expect(rows).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain("SLOW_QUERY");
    expect(message).toContain("2 rows");
    expect(message).toContain('from "Lead"');
  });

  it("never warns when SLOW_QUERY_THRESHOLD_MS is unset and the query is fast, regardless of row count", async () => {
    const { query } = await import("@/lib/db/query");
    const manyRows = Array.from({ length: 500 }, (_, index) => ({ id: index }));
    const client = { query: vi.fn().mockResolvedValue({ rows: manyRows }) };

    await query('select * from "Lead"', [], client as any);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("still returns the real rowCount and does not alter execute()'s behavior", async () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = "10";
    const { execute } = await import("@/lib/db/query");
    const client = { query: vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ rowCount: 3 }), 20))) };

    const result = await execute('update "Lead" set status = $1', ["NEW"], client as any);

    expect(result).toBe(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("3 rows");
  });

  it("does not swallow or alter a real query error", async () => {
    const { query } = await import("@/lib/db/query");
    const client = { query: vi.fn().mockRejectedValue({ message: "constraint violation", code: "23505" }) };

    await expect(query('insert into "Lead" (id) values ($1)', ["dup"], client as any)).rejects.toThrow("constraint violation");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

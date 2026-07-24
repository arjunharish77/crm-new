import { describe, expect, it } from "vitest";

const { PgQueryBuilder, quoteIdentifier } = require("../scripts/seed-client");

describe("direct Postgres seed client", () => {
  it("quotes only safe identifiers", () => {
    expect(quoteIdentifier("Lead")).toBe("\"Lead\"");
    expect(() => quoteIdentifier("Lead; drop table User")).toThrow(/Unsafe SQL identifier/);
  });

  it("builds parameterized select filters", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [{ id: "lead-1" }], rowCount: 1 };
      },
    };

    const result = await new PgQueryBuilder(client, "Lead")
      .select("id,name")
      .eq("tenantId", "tenant-1")
      .ilike("name", "A%")
      .is("deletedAt", null)
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: "lead-1" });
    expect(calls[0].sql).toBe(
      'select "id", "name" from "Lead" where "tenantId" = $1 and "name" ilike $2 and "deletedAt" is null order by "createdAt" desc limit $3',
    );
    expect(calls[0].values).toEqual(["tenant-1", "A%", 1]);
  });

  it("builds parameterized upserts", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [], rowCount: 1 };
      },
    };

    const result = await new PgQueryBuilder(client, "Role").upsert(
      [{ id: "role-1", tenantId: "tenant-1", name: "Admin" }],
      { onConflict: "tenantId,name" },
    );

    expect(result.error).toBeNull();
    expect(calls[0].sql).toContain("information_schema.columns");
    expect(calls[0].values).toEqual(["Role"]);
    expect(calls[1].sql).toBe(
      'insert into "Role" ("id", "tenantId", "name") values ($1, $2, $3) on conflict ("tenantId", "name") do update set "id" = excluded."id" returning *',
    );
    expect(calls[1].values).toEqual(["role-1", "tenant-1", "Admin"]);
  });
});

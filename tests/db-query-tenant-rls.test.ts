import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP07 (F04): query()/queryOne()/execute() opt-in transaction-local "app.tenant_id" wrapper.
// Mocks @/lib/db/pool and @/lib/db/tenant-context so this exercises the real branching/wrapping
// logic in query.ts without a live Postgres connection -- genuine cross-tenant/connection-reuse
// isolation is verified separately against a real "crm_app_tenant" role (see
// 25_AUDIT_REMEDIATION_PLAN.md WP07).
const poolMocks = vi.hoisted(() => ({
  scopedClient: {
    query: vi.fn(),
    release: vi.fn(),
  },
  legacyPool: { query: vi.fn() },
  runtimePool: { connect: vi.fn() },
}));

vi.mock("@/lib/db/pool", () => ({
  getPool: () => poolMocks.legacyPool,
  getRuntimePool: () => poolMocks.runtimePool,
}));

const contextMocks = vi.hoisted(() => ({ getTenantContext: vi.fn() }));
vi.mock("@/lib/db/tenant-context", () => ({ getTenantContext: contextMocks.getTenantContext }));

describe("query.ts ENFORCE_TENANT_RLS wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    poolMocks.scopedClient.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    poolMocks.scopedClient.release.mockReset();
    poolMocks.legacyPool.query.mockReset().mockResolvedValue({ rows: [{ ok: true }], rowCount: 1 });
    poolMocks.runtimePool.connect.mockReset().mockResolvedValue(poolMocks.scopedClient);
    contextMocks.getTenantContext.mockReset().mockReturnValue({ tenantId: "tenant-a", userId: "user-1", roleId: "role-1" });
    delete process.env.ENFORCE_TENANT_RLS;
  });

  afterEach(() => {
    delete process.env.ENFORCE_TENANT_RLS;
  });

  it("flag off (default): uses the legacy pool directly, never touches the runtime pool", async () => {
    const { query } = await import("@/lib/db/query");
    const rows = await query("select 1");
    expect(rows).toEqual([{ ok: true }]);
    expect(poolMocks.legacyPool.query).toHaveBeenCalledTimes(1);
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
  });

  it("flag on, no explicit client: wraps in begin/set_config x3/commit on the runtime pool, then releases", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    poolMocks.scopedClient.query.mockImplementation((sql: string) => {
      if (sql === "select 1") return Promise.resolve({ rows: [{ n: 1 }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const { query } = await import("@/lib/db/query");
    const rows = await query("select 1");

    expect(rows).toEqual([{ n: 1 }]);
    expect(poolMocks.runtimePool.connect).toHaveBeenCalledTimes(1);
    const calls = poolMocks.scopedClient.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe("begin");
    expect(calls.slice(1, 4)).toEqual(Array(3).fill("select set_config($1, $2, true)"));
    expect(calls[1 + 3]).toBe("select 1");
    expect(calls[calls.length - 1]).toBe("commit");
    expect(poolMocks.scopedClient.release).toHaveBeenCalledTimes(1);
    expect(poolMocks.legacyPool.query).not.toHaveBeenCalled();

    const configCalls = poolMocks.scopedClient.query.mock.calls.filter((c) => c[0] === "select set_config($1, $2, true)");
    expect(configCalls.map((c) => c[1])).toEqual([
      ["app.tenant_id", "tenant-a"],
      ["app.user_id", "user-1"],
      ["app.role_id", "role-1"],
    ]);
  });

  it("flag on, no ambient context (e.g. pre-auth path): still runs, but sets no config -- fails closed under RLS", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    contextMocks.getTenantContext.mockReturnValue(null);

    const { query } = await import("@/lib/db/query");
    await query("select 1");

    const calls = poolMocks.scopedClient.query.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["begin", "select 1", "commit"]);
  });

  it("flag on, no ambient context, only a partial context (platform admin, tenantId null): skips only the null key", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    contextMocks.getTenantContext.mockReturnValue({ tenantId: null, userId: "admin-1", roleId: null });

    const { query } = await import("@/lib/db/query");
    await query("select 1");

    const calls = poolMocks.scopedClient.query.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["begin", "select set_config($1, $2, true)", "select 1", "commit"]);
  });

  it("flag on, but an explicit client is passed (already inside withTransaction): bypasses the wrapper entirely", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    const explicitClient = { query: vi.fn().mockResolvedValue({ rows: [{ x: 1 }], rowCount: 1 }) };

    const { query } = await import("@/lib/db/query");
    const rows = await query("select 1", [], explicitClient as any);

    expect(rows).toEqual([{ x: 1 }]);
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
    expect(poolMocks.legacyPool.query).not.toHaveBeenCalled();
  });

  it("flag on: rolls back and releases the client if the query itself throws", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    poolMocks.scopedClient.query.mockImplementation((sql: string) => {
      if (sql === "select 1") return Promise.reject(new Error("boom"));
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const { query } = await import("@/lib/db/query");
    await expect(query("select 1")).rejects.toThrow("boom");

    const calls = poolMocks.scopedClient.query.mock.calls.map((c) => c[0]);
    expect(calls[calls.length - 1]).toBe("rollback");
    expect(poolMocks.scopedClient.release).toHaveBeenCalledTimes(1);
  });

  it("flag on: execute() goes through the same wrapper and returns rowCount", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    poolMocks.scopedClient.query.mockImplementation((sql: string) => {
      if (sql.startsWith("update")) return Promise.resolve({ rows: [], rowCount: 4 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const { execute } = await import("@/lib/db/query");
    const result = await execute('update "Lead" set status = $1', ["NEW"]);

    expect(result).toBe(4);
    expect(poolMocks.runtimePool.connect).toHaveBeenCalledTimes(1);
  });
});

// WP07 (F04) follow-up: queryAsSystem/queryOneAsSystem/executeAsSystem -- the explicit,
// always-getPool() escape hatch for pre-auth/cross-tenant-admin/background-job/delegated-API
// call sites (see 25_AUDIT_REMEDIATION_PLAN.md "## WP07 pre-auth/system path inventory"). These
// must NEVER touch the runtime pool or read ambient tenant context, regardless of
// ENFORCE_TENANT_RLS or whatever's on the AsyncLocalStorage stack -- that's the entire point of
// the escape hatch existing as a separate, named function rather than a flag/parameter on the
// ordinary query()/queryOne()/execute().
describe("query.ts *AsSystem escape hatch", () => {
  beforeEach(() => {
    vi.resetModules();
    poolMocks.scopedClient.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    poolMocks.scopedClient.release.mockReset();
    poolMocks.legacyPool.query.mockReset().mockResolvedValue({ rows: [{ ok: true }], rowCount: 1 });
    poolMocks.runtimePool.connect.mockReset().mockResolvedValue(poolMocks.scopedClient);
    contextMocks.getTenantContext.mockReset().mockReturnValue({ tenantId: "tenant-a", userId: "user-1", roleId: "role-1" });
    delete process.env.ENFORCE_TENANT_RLS;
  });

  afterEach(() => {
    delete process.env.ENFORCE_TENANT_RLS;
  });

  it("queryAsSystem: flag off -- uses the legacy pool directly, same as query()", async () => {
    const { queryAsSystem } = await import("@/lib/db/query");
    const rows = await queryAsSystem("select 1");
    expect(rows).toEqual([{ ok: true }]);
    expect(poolMocks.legacyPool.query).toHaveBeenCalledTimes(1);
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
  });

  it("queryAsSystem: flag ON and real ambient tenant context present -- STILL uses getPool(), never the runtime pool", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    const { queryAsSystem } = await import("@/lib/db/query");
    const rows = await queryAsSystem("select * from \"Tenant\"");

    expect(rows).toEqual([{ ok: true }]);
    expect(poolMocks.legacyPool.query).toHaveBeenCalledTimes(1);
    expect(poolMocks.legacyPool.query).toHaveBeenCalledWith('select * from "Tenant"', []);
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
    // Never reads the ambient context either -- this is a system-pool call, not a scoped one.
    expect(contextMocks.getTenantContext).not.toHaveBeenCalled();
  });

  it("queryAsSystem: flag ON with NO ambient context at all (genuine pre-auth call) -- still just getPool(), no begin/set_config/commit dance", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    contextMocks.getTenantContext.mockReturnValue(null);
    const { queryAsSystem } = await import("@/lib/db/query");
    await queryAsSystem("select 1 from \"User\" where lower(email) = lower($1)", ["a@b.com"]);

    expect(poolMocks.legacyPool.query).toHaveBeenCalledTimes(1);
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
  });

  it("queryOneAsSystem: flag on, returns the first row via getPool(), never the runtime pool", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    poolMocks.legacyPool.query.mockResolvedValue({ rows: [{ id: "row-1" }, { id: "row-2" }], rowCount: 2 });
    const { queryOneAsSystem } = await import("@/lib/db/query");
    const row = await queryOneAsSystem<{ id: string }>("select id from \"ApiKey\" where id = $1", ["key-1"]);

    expect(row).toEqual({ id: "row-1" });
    expect(poolMocks.legacyPool.query).toHaveBeenCalledTimes(1);
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
  });

  it("queryOneAsSystem: flag on, no matching row -- returns null, still via getPool()", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    poolMocks.legacyPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const { queryOneAsSystem } = await import("@/lib/db/query");
    const row = await queryOneAsSystem("select id from \"ApiKey\" where id = $1", ["missing"]);

    expect(row).toBeNull();
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
  });

  it("executeAsSystem: flag on, returns rowCount via getPool(), never the runtime pool", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    poolMocks.legacyPool.query.mockResolvedValue({ rows: [], rowCount: 3 });
    const { executeAsSystem } = await import("@/lib/db/query");
    const result = await executeAsSystem('update "PlatformAdmin" set "isActive" = true where id = any($1::text[])', [["a", "b", "c"]]);

    expect(result).toBe(3);
    expect(poolMocks.legacyPool.query).toHaveBeenCalledTimes(1);
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
  });

  it("*AsSystem: an explicit client is still honored (e.g. a caller already inside withTransaction) instead of always opening a fresh getPool() connection", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    const explicitClient = { query: vi.fn().mockResolvedValue({ rows: [{ x: 1 }], rowCount: 1 }) };
    const { queryAsSystem } = await import("@/lib/db/query");
    const rows = await queryAsSystem("select 1", [], explicitClient as any);

    expect(rows).toEqual([{ x: 1 }]);
    expect(poolMocks.legacyPool.query).not.toHaveBeenCalled();
    expect(poolMocks.runtimePool.connect).not.toHaveBeenCalled();
  });

  it("*AsSystem: a database error is still wrapped the same way ordinary query()/execute() wrap it", async () => {
    process.env.ENFORCE_TENANT_RLS = "true";
    poolMocks.legacyPool.query.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));
    const { queryAsSystem } = await import("@/lib/db/query");
    await expect(queryAsSystem("insert into \"ApiKey\" ...")).rejects.toMatchObject({ code: "23505" });
  });
});

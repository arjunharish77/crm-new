import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, queryOneMock, executeMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryOneMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("@/lib/db/query", () => ({
  // The real helper: lists for jsonb columns are sent as JSON text.
  jsonbParam: (value: unknown) => JSON.stringify(value ?? null),
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

import {
  assertMetricPermission,
  createMetricForTenant,
  deleteMetricForTenant,
  getMetricValueForTenant,
  listMetricsForTenant,
  setMetricGovernanceForTenant,
  updateMetricDefinitionForTenant,
} from "@/lib/server/metrics";

// Gap checklist Module 17, item 2 (semantic metric layer). Covers the two dual-gated
// permission concerns (assertMetricPermission's module gate, visibility's sharing gate) plus
// the metric-value computation delegating to reporting-query.ts's executeMetricQueryForTenant.
describe("assertMetricPermission (module-level authoring/certification gate)", () => {
  it("allows platform and tenant admins regardless of role permissions", () => {
    expect(() => assertMetricPermission({ id: "u1", tenantId: "t1", isPlatformAdmin: true }, "certify")).not.toThrow();
    expect(() => assertMetricPermission({ id: "u1", tenantId: "t1", isTenantAdmin: true }, "delete")).not.toThrow();
  });

  it("rejects a role with no metrics module permission configured at all", () => {
    expect(() => assertMetricPermission({ id: "u1", tenantId: "t1", role: { permissions: { modules: {} } } }, "view")).toThrow("FORBIDDEN");
  });

  it("read grants view but not create", () => {
    const user = { id: "u1", tenantId: "t1", role: { permissions: { modules: { metrics: { read: true } } } } };
    expect(() => assertMetricPermission(user, "view")).not.toThrow();
    expect(() => assertMetricPermission(user, "create")).toThrow("FORBIDDEN");
  });

  it("gates certify/deprecate behind 'manage' only -- create/update are not enough", () => {
    const author = { id: "u1", tenantId: "t1", role: { permissions: { modules: { metrics: { create: true, update: true } } } } };
    expect(() => assertMetricPermission(author, "certify")).toThrow("FORBIDDEN");
    expect(() => assertMetricPermission(author, "deprecate")).toThrow("FORBIDDEN");

    const steward = { id: "u1", tenantId: "t1", role: { permissions: { modules: { metrics: { manage: true } } } } };
    expect(() => assertMetricPermission(steward, "certify")).not.toThrow();
    expect(() => assertMetricPermission(steward, "deprecate")).not.toThrow();
  });

  it("treats the legacy 'full' shorthand as unconditional access to every action", () => {
    const user = { id: "u1", tenantId: "t1", role: { permissions: { modules: { metrics: "full" } } } };
    for (const action of ["view", "create", "edit", "delete", "certify", "deprecate"] as const) {
      expect(() => assertMetricPermission(user, action)).not.toThrow();
    }
  });
});

describe("Metric CRUD and value computation", () => {
  const managerUser = { id: "user-1", tenantId: "tenant-1", role: { permissions: { modules: { metrics: { manage: true } } } } };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("creates a metric after validating its definition against FIELD_CATALOG", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('insert into "Metric"')) {
        return {
          id: "metric-1", name: "Total Pipeline Value", description: null, root: "opportunity", aggregation: "SUM",
          aggregateObject: "opportunity", aggregateField: "amount", filters: [], groupByObject: null, groupByField: null,
          ownerId: "user-1", certificationStatus: "UNCERTIFIED", certifiedBy: null, certifiedAt: null,
          deprecationStatus: "ACTIVE", deprecatedReason: null, deprecatedAt: null,
          visibility: "PRIVATE", sharedWithTeamId: null, createdBy: "user-1", createdAt: "t", updatedAt: "t",
        };
      }
      return null;
    });

    const metric = await createMetricForTenant(managerUser, {
      name: "Total Pipeline Value",
      root: "opportunity",
      aggregation: "SUM",
      aggregateField: { object: "opportunity", field: "amount" },
    });

    expect(metric.id).toBe("metric-1");
    expect(metric.isOwner).toBe(true);
    expect(metric.certificationStatus).toBe("UNCERTIFIED");
    const insertCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "Metric"'));
    expect(insertCall).toBeTruthy();
    expect(insertCall![1]).toContain("SUM");
  });

  it("rejects creating a metric with a field not in FIELD_CATALOG", async () => {
    await expect(createMetricForTenant(managerUser, {
      name: "Bad Metric", root: "lead", aggregation: "SUM", aggregateField: { object: "lead", field: "notAField" },
    })).rejects.toThrow("Unsupported report field");
  });

  it("rejects creating a metric with a non-COUNT aggregation and no aggregateField", async () => {
    await expect(createMetricForTenant(managerUser, {
      name: "Bad Metric", root: "lead", aggregation: "AVG",
    })).rejects.toThrow("aggregateField is required");
  });

  it("lists a viewer's own metrics plus TENANT-shared ones, with isOwner set correctly", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "m1", name: "Mine", root: "lead", aggregation: "COUNT", filters: [], ownerId: "user-1", certificationStatus: "UNCERTIFIED", deprecationStatus: "ACTIVE", visibility: "PRIVATE", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" },
      { id: "m2", name: "Everyone", root: "lead", aggregation: "COUNT", filters: [], ownerId: "user-2", certificationStatus: "CERTIFIED", deprecationStatus: "ACTIVE", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" },
    ]);

    const result = await listMetricsForTenant(managerUser);

    expect(result).toHaveLength(2);
    expect(result.find((metric) => metric.id === "m1")).toMatchObject({ isOwner: true });
    expect(result.find((metric) => metric.id === "m2")).toMatchObject({ isOwner: false, visibility: "TENANT", certificationStatus: "CERTIFIED" });
    expect(queryMock.mock.calls[0][0]).toContain("visibility = 'TENANT'");
    expect(queryMock.mock.calls[0][0]).toContain("visibility = 'TEAM'");
  });

  it("rejects updating another user's metric definition -- edit stays owner-only, mirroring DashboardWidget", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('select') && text.includes('from "Metric"')) {
        return {
          id: "m1", name: "Shared", root: "lead", aggregation: "COUNT", filters: [], ownerId: "user-2",
          certificationStatus: "UNCERTIFIED", deprecationStatus: "ACTIVE", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t",
        };
      }
      if (text.includes('update "Metric"')) return null; // owner-scoped WHERE excludes user-1
      return null;
    });

    await expect(
      updateMetricDefinitionForTenant(managerUser, "m1", { aggregation: "SUM", aggregateField: { object: "lead", field: "score" } }),
    ).rejects.toThrow("METRIC_NOT_FOUND");
  });

  it("lets a non-owner with 'manage' certify a metric, but rejects a read-only user", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('update "Metric"')) {
        return {
          id: "m1", name: "Shared", root: "lead", aggregation: "COUNT", filters: [], ownerId: "user-2",
          certificationStatus: "CERTIFIED", certifiedBy: "user-1", certifiedAt: "2026-01-01T00:00:00.000Z",
          deprecationStatus: "ACTIVE", deprecatedReason: null, deprecatedAt: null,
          visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t",
        };
      }
      return null;
    });

    const metric = await setMetricGovernanceForTenant(managerUser, "m1", { certificationStatus: "CERTIFIED" });
    expect(metric.certificationStatus).toBe("CERTIFIED");
    expect(metric.certifiedBy).toBe("user-1");
    expect(metric.isOwner).toBe(false);

    const readOnlyUser = { id: "user-3", tenantId: "tenant-1", role: { permissions: { modules: { metrics: { read: true } } } } };
    await expect(setMetricGovernanceForTenant(readOnlyUser, "m1", { certificationStatus: "CERTIFIED" })).rejects.toThrow("FORBIDDEN");
  });

  it("computes a metric's value by loading its stored definition and running it through the query engine", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "Metric"')) {
        return {
          id: "m1", name: "Open Leads", root: "lead", aggregation: "COUNT",
          aggregateObject: null, aggregateField: null, filters: [], groupByObject: null, groupByField: null,
          ownerId: "user-1", certificationStatus: "UNCERTIFIED", deprecationStatus: "ACTIVE",
          visibility: "PRIVATE", sharedWithTeamId: null, createdAt: "t", updatedAt: "t",
        };
      }
      return null;
    });
    queryMock.mockResolvedValueOnce([{ id: "lead-1" }, { id: "lead-2" }]);

    const result = await getMetricValueForTenant(managerUser, "m1");
    expect(result).toEqual({ value: 2 });
  });

  it("deletes a metric only via the owner-scoped WHERE clause", async () => {
    await deleteMetricForTenant(managerUser, "m1");
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('delete from "Metric"'), ["m1", "user-1", "tenant-1"]);
  });
});

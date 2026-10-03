import { beforeEach, describe, expect, it, vi } from "vitest";

// Report logic under test; the Reports (advancedReporting) gate is covered by the module-gate audit.
vi.mock("@/lib/server/entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/entitlements")>()),
  assertFeatureEnabled: vi.fn(async () => undefined),
  isFeatureEnabledForTenant: vi.fn(async () => true),
}));


const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

const TENANT_USER = { id: "admin-1", tenantId: "tenant-1" };

describe("report annotations (gap checklist Module 17, item 21)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("creates an annotation and scopes the list query to the tenant and date range", async () => {
    queryOneMock.mockResolvedValueOnce({
      id: "ann-1",
      label: "Fall intake launch",
      description: null,
      category: "LAUNCH",
      occurredAt: "2026-08-01",
      createdBy: "admin-1",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const { createAnnotationForTenant, listAnnotationsForTenant } = await import("@/lib/server/report-annotations");

    const created = await createAnnotationForTenant(TENANT_USER, { label: "Fall intake launch", category: "LAUNCH", occurredAt: "2026-08-01" });
    expect(created.category).toBe("LAUNCH");

    queryMock.mockResolvedValueOnce([created]);
    const list = await listAnnotationsForTenant(TENANT_USER, "2026-07-01", "2026-09-01");
    expect(list).toEqual([created]);
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "2026-07-01", "2026-09-01"]);
  });

  it("rejects a blank label", async () => {
    const { createAnnotationForTenant } = await import("@/lib/server/report-annotations");
    await expect(createAnnotationForTenant(TENANT_USER, { label: "   ", category: "OTHER", occurredAt: "2026-08-01" })).rejects.toThrow(
      "ANNOTATION_LABEL_REQUIRED",
    );
  });

  it("deletes an annotation scoped to the tenant", async () => {
    executeMock.mockResolvedValueOnce(1);
    const { deleteAnnotationForTenant } = await import("@/lib/server/report-annotations");
    await deleteAnnotationForTenant(TENANT_USER, "ann-1");
    expect(executeMock.mock.calls[0][1]).toEqual(["tenant-1", "ann-1"]);
  });
});

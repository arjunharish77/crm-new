import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { listProgramsForTenant } from "@/lib/repositories/catalog-postgres";

// Priority Module 12's "product catalog" -- the first repository code against the new catalog
// schema (migrations 0100/0101).
describe("listProgramsForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
  });

  it("returns an empty array when the caller has no tenant context", async () => {
    const result = await listProgramsForTenant({ id: "user-1", tenantId: null });
    expect(result).toEqual([]);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it("scopes the query to the caller's own tenant and only active programs", async () => {
    dbMocks.query.mockResolvedValueOnce([
      { id: "program-1", name: "MBA", level: "POSTGRADUATE", universityId: "uni-1", universityName: "MIT" },
    ]);

    const result = await listProgramsForTenant({ id: "user-1", tenantId: "tenant-1" });

    expect(result).toEqual([
      { id: "program-1", name: "MBA", level: "POSTGRADUATE", universityId: "uni-1", universityName: "MIT" },
    ]);
    expect(dbMocks.query.mock.calls[0][0]).toContain('p."tenantId" = $1');
    expect(dbMocks.query.mock.calls[0][0]).toContain('p."isActive" = true');
    expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-1"]);
  });
});

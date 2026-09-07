import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import {
  createCatalogEntityForTenant,
  deleteCatalogEntityForTenant,
  isCatalogEntityKey,
  listCatalogEntitiesForTenant,
  updateCatalogEntityForTenant,
} from "@/lib/repositories/catalog-postgres";

const user = { id: "user-1", tenantId: "tenant-1" };

// Priority Module 12's "product catalog" item 4, "admin catalog management UI" -- the generic
// CRUD dispatcher shared across 9 of the 10 named catalog entities.
describe("isCatalogEntityKey", () => {
  it("accepts every known catalog entity key", () => {
    for (const key of [
      "universities", "campuses", "programs", "courses", "intakes",
      "fee-plans", "scholarship-rules", "eligibility-rules", "application-stages", "application-checklists",
    ]) {
      expect(isCatalogEntityKey(key)).toBe(true);
    }
  });

  it("rejects an unknown or arbitrary string", () => {
    expect(isCatalogEntityKey("specializations")).toBe(false);
    expect(isCatalogEntityKey("'; drop table University; --")).toBe(false);
    expect(isCatalogEntityKey("")).toBe(false);
  });
});

describe("listCatalogEntitiesForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.query.mockResolvedValue([]);
  });

  it("scopes to the parent when a parentId is given", async () => {
    await listCatalogEntitiesForTenant(user, "courses", "program-1");
    const [sql, values] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('"programId" = $2');
    expect(values).toEqual(["tenant-1", "program-1"]);
  });

  it("lists everything for the tenant when no parentId is given (e.g. universities)", async () => {
    await listCatalogEntitiesForTenant(user, "universities");
    const [sql, values] = dbMocks.query.mock.calls[0];
    expect(sql).not.toContain('"catalogId" = $2');
    expect(values).toEqual(["tenant-1"]);
  });
});

describe("createCatalogEntityForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
  });

  it("rejects a missing/blank name", async () => {
    await expect(createCatalogEntityForTenant(user, "courses", { parentId: "program-1" })).rejects.toThrow("NAME_REQUIRED");
    await expect(createCatalogEntityForTenant(user, "courses", { name: "   ", parentId: "program-1" })).rejects.toThrow("NAME_REQUIRED");
  });

  it("rejects a parent-scoped entity with no parentId at all", async () => {
    await expect(createCatalogEntityForTenant(user, "courses", { name: "CS" })).rejects.toThrow("PARENT_ID_REQUIRED");
  });

  it("rejects when the supplied parentId does not belong to this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null); // Program lookup fails
    await expect(
      createCatalogEntityForTenant(user, "courses", { name: "CS", parentId: "other-tenants-program" }),
    ).rejects.toThrow("CATALOG_PARENT_NOT_FOUND");
    expect(dbMocks.queryOne.mock.calls[0][0]).toContain('from "Program"');
  });

  it("creates a parent-scoped entity once the parent is verified", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "program-1" }) // parent check
      .mockResolvedValueOnce({ id: "course-1", name: "CS", programId: "program-1" }); // insert

    const result = await createCatalogEntityForTenant(user, "courses", { name: "CS", parentId: "program-1" });

    expect(result).toEqual({ id: "course-1", name: "CS", programId: "program-1" });
    const insertCall = dbMocks.queryOne.mock.calls[1];
    expect(insertCall[0]).toContain('insert into "Course"');
    expect(insertCall[0]).toContain('"programId"');
  });

  it("auto-creates a default ProductCatalog for a university with no parentId required", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(null) // no existing catalog
      .mockResolvedValueOnce({ id: "catalog-1" }) // catalog insert
      .mockResolvedValueOnce({ id: "uni-1", name: "MIT", catalogId: "catalog-1" }); // university insert

    const result = await createCatalogEntityForTenant(user, "universities", { name: "MIT" });

    expect(result.catalogId).toBe("catalog-1");
    expect(dbMocks.queryOne.mock.calls[0][0]).toContain('from "ProductCatalog"');
    expect(dbMocks.queryOne.mock.calls[1][0]).toContain('insert into "ProductCatalog"');
    expect(dbMocks.queryOne.mock.calls[2][0]).toContain('insert into "University"');
  });

  it("reuses an existing ProductCatalog rather than creating a second one", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "existing-catalog" })
      .mockResolvedValueOnce({ id: "uni-2", name: "Stanford", catalogId: "existing-catalog" });

    const result = await createCatalogEntityForTenant(user, "universities", { name: "Stanford" });

    expect(result.catalogId).toBe("existing-catalog");
    expect(dbMocks.queryOne).toHaveBeenCalledTimes(2); // no ProductCatalog insert call
  });

  it("only sends whitelisted fields to the insert, ignoring anything else in the payload", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "program-1" })
      .mockResolvedValueOnce({ id: "course-1" });

    await createCatalogEntityForTenant(user, "courses", {
      name: "CS",
      parentId: "program-1",
      tenantId: "attacker-controlled-tenant",
      id: "attacker-controlled-id",
    });

    const insertCall = dbMocks.queryOne.mock.calls[1];
    expect(insertCall[0]).not.toContain('"tenantId" = ');
    // tenantId/id in the row come from the function's own values, not the payload
    expect(insertCall[1]).not.toContain("attacker-controlled-tenant");
    expect(insertCall[1]).not.toContain("attacker-controlled-id");
  });
});

describe("updateCatalogEntityForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("rejects an explicit blank name on update", async () => {
    await expect(updateCatalogEntityForTenant(user, "courses", "course-1", { name: "" })).rejects.toThrow("NAME_REQUIRED");
  });

  it("updates only the whitelisted fields present in the payload", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "course-1", name: "Renamed" });
    const result = await updateCatalogEntityForTenant(user, "courses", "course-1", { name: "Renamed", notAField: "ignored" });
    expect(result.name).toBe("Renamed");
    const [sql, values] = dbMocks.queryOne.mock.calls[0];
    expect(sql).toContain('"name" = $1');
    expect(sql).not.toContain("notAField");
    expect(values).toContain("tenant-1");
    expect(values).toContain("course-1");
  });

  it("throws a *_NOT_FOUND error when no row matches this tenant/id", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(updateCatalogEntityForTenant(user, "courses", "missing-course", { name: "X" })).rejects.toThrow("COURSE_NOT_FOUND");
  });
});

describe("deleteCatalogEntityForTenant", () => {
  beforeEach(() => {
    dbMocks.execute.mockReset();
  });

  it("scopes the delete to the tenant and the entity's own table", async () => {
    await deleteCatalogEntityForTenant(user, "application-checklists", "checklist-1");
    const [sql, values] = dbMocks.execute.mock.calls[0];
    expect(sql).toContain('delete from "ApplicationChecklist"');
    expect(sql).toContain('"tenantId" = $1');
    expect(values).toEqual(["tenant-1", "checklist-1"]);
  });
});

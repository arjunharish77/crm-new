import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);
const { query: queryMock, queryOne: queryOneMock, execute: executeMock } = dbMocks;

import { createOpportunityTypeConfigForTenant, updateOpportunityTypeConfigForTenant } from "@/lib/server/admin-modules";

const user = { id: "user-1", tenantId: "tenant-1" };

// Priority Module 12's "product catalog" item 3 -- an OpportunityType can optionally link to a
// catalog Program; a cross-tenant program id must be rejected since Program.id alone has no
// composite (tenantId, id) FK constraint at the DB level.
describe("OpportunityType <-> Program linking", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("creates an opportunity type with no program link when programId is omitted", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "ObjectDefinition"')) return { id: "obj-1" };
      if (text.includes('order by "order" desc')) return null;
      if (text.startsWith('insert into "OpportunityType"')) return { id: "type-1", name: "University 1", programId: null };
      return null;
    });

    const result = await createOpportunityTypeConfigForTenant(user, { name: "University 1" });
    expect(result.programId).toBeNull();
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).startsWith('select id from "Program"'))).toBe(false);
  });

  it("rejects creating an opportunity type with a programId that doesn't belong to this tenant", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "ObjectDefinition"')) return { id: "obj-1" };
      if (text.includes('order by "order" desc')) return null;
      if (text.startsWith('select id from "Program"')) return null; // not found for this tenant
      return null;
    });

    await expect(
      createOpportunityTypeConfigForTenant(user, { name: "University 1", programId: "other-tenant-program" }),
    ).rejects.toThrow("PROGRAM_NOT_FOUND");
  });

  it("creates an opportunity type linked to a program that DOES belong to this tenant", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "ObjectDefinition"')) return { id: "obj-1" };
      if (text.includes('order by "order" desc')) return null;
      if (text.startsWith('select id from "Program"')) return { id: "program-1" };
      if (text.startsWith('insert into "OpportunityType"')) return { id: "type-1", name: "University 1", programId: "program-1" };
      return null;
    });

    const result = await createOpportunityTypeConfigForTenant(user, { name: "University 1", programId: "program-1" });
    expect(result.programId).toBe("program-1");
  });

  it("updates an opportunity type to link a program", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('select id from "Program"')) return { id: "program-2" };
      if (text.startsWith('update "OpportunityType"')) return { id: "type-1", programId: "program-2" };
      return null;
    });

    const result = await updateOpportunityTypeConfigForTenant(user, "type-1", { programId: "program-2" });
    expect(result.programId).toBe("program-2");
  });

  it("updates an opportunity type to clear its program link with an explicit null (no Program lookup needed)", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "OpportunityType"')) return { id: "type-1", programId: null };
      return null;
    });

    const result = await updateOpportunityTypeConfigForTenant(user, "type-1", { programId: null });
    expect(result.programId).toBeNull();
    expect(queryOneMock.mock.calls.some((call) => String(call[0]).startsWith('select id from "Program"'))).toBe(false);
  });

  it("rejects updating with a programId belonging to a different tenant", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      if (String(sql).startsWith('select id from "Program"')) return null;
      return null;
    });

    await expect(
      updateOpportunityTypeConfigForTenant(user, "type-1", { programId: "someone-elses-program" }),
    ).rejects.toThrow("PROGRAM_NOT_FOUND");
  });

  it("leaves the program link untouched when programId is not present in the update payload at all", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "OpportunityType"')) return { id: "type-1", name: "Renamed" };
      return null;
    });

    await updateOpportunityTypeConfigForTenant(user, "type-1", { name: "Renamed" });
    const updateCall = queryOneMock.mock.calls.find((call) => String(call[0]).startsWith('update "OpportunityType"'));
    // programId still appears in the RETURNING clause (always selected back), but must not be
    // part of the SET assignment list when the caller never mentioned it.
    expect(updateCall![0]).not.toContain('"programId" = $');
  });
});

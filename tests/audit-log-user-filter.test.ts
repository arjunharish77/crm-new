import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { listAuditLogsForTenant } from "@/lib/server/crm";

const user = { id: "admin-1", tenantId: "tenant-1" };

// Gap checklist Module 10's "user-level audit of productivity actions" item -- previously no
// filter anywhere in this stack could answer "what did user X do," only "what happened to
// record Y."
describe("listAuditLogsForTenant userId filter", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.query.mockResolvedValue([]);
  });

  it("adds a userId clause and parameter when userId is provided", async () => {
    await listAuditLogsForTenant(user, { userId: "target-user-1" });

    const [sql, values] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('"userId" = $');
    expect(values).toContain("target-user-1");
  });

  it("omits the userId clause entirely when not provided", async () => {
    await listAuditLogsForTenant(user, {});

    const [sql] = dbMocks.query.mock.calls[0];
    expect(sql).not.toContain('"userId" = $');
  });

  it("combines the userId filter with other filters (entityType) without conflict", async () => {
    await listAuditLogsForTenant(user, { userId: "target-user-1", entityType: "lead" });

    const [sql, values] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('"userId" = $');
    expect(sql).toContain('"entityType" = $');
    expect(values).toEqual(expect.arrayContaining(["tenant-1", "LEAD", "target-user-1"]));
  });
});

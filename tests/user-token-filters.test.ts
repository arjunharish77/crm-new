import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { resolveTeamUserIds, substituteUserTokens } from "@/lib/server/user-token-filters";

// Gap checklist Module 10's universal advanced filter drawer, "current user/team tokens" sub-
// item. Kept in a server-only module (imports the Postgres driver) separate from
// query-filters.ts, which the client-side AdvancedFilterDrawer also imports for its pure
// constants/types and must stay bundler-safe (no db/query import reachable from it).
describe("resolveTeamUserIds", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
  });

  it("queries every user sharing this user's own teamId, scoped to the tenant", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "user-2" }, { id: "user-3" }]);
    const result = await resolveTeamUserIds("tenant-1", "user-1");
    expect(result).toEqual(["user-2", "user-3"]);
    expect(dbMocks.query).toHaveBeenCalledWith(expect.stringContaining('"teamId" = (select "teamId" from "User" where id = $1)'), ["user-1", "tenant-1"]);
  });
});

describe("substituteUserTokens", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
  });

  it("replaces @me with the current user's id, no DB lookup needed", async () => {
    const result = await substituteUserTokens([{ field: "ownerId", operator: "equals", value: "@me" }], { id: "user-1", tenantId: "tenant-1" });
    expect(result).toEqual([{ field: "ownerId", operator: "equals", value: "user-1" }]);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it("replaces @myteam with the resolved team member id list, one DB lookup", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "user-2" }, { id: "user-3" }]);
    const result = await substituteUserTokens([{ field: "ownerId", operator: "in", value: "@myteam" }], { id: "user-1", tenantId: "tenant-1" });
    expect(result).toEqual([{ field: "ownerId", operator: "in", value: ["user-2", "user-3"] }]);
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
  });

  it("resolves @myteam inside an array value (e.g. an 'in' filter mixing tokens and literal ids)", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "user-2" }]);
    const result = await substituteUserTokens([{ field: "ownerId", operator: "in", value: ["user-9", "@myteam"] }], { id: "user-1", tenantId: "tenant-1" });
    expect(result).toEqual([{ field: "ownerId", operator: "in", value: ["user-9", "user-2"] }]);
  });

  it("resolves tokens inside nested {logic, conditions} groups", async () => {
    const result = await substituteUserTokens(
      [{ logic: "AND", conditions: [{ field: "ownerId", operator: "equals", value: "@me" }] }],
      { id: "user-1", tenantId: "tenant-1" },
    );
    expect(result).toEqual([{ logic: "AND", conditions: [{ field: "ownerId", operator: "equals", value: "user-1" }] }]);
  });

  it("does no DB lookup at all when no condition uses @myteam", async () => {
    await substituteUserTokens([{ field: "status", operator: "equals", value: "NEW" }], { id: "user-1", tenantId: "tenant-1" });
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it("passes through a null/non-array filters value unchanged", async () => {
    expect(await substituteUserTokens(null, { id: "user-1", tenantId: "tenant-1" })).toBeNull();
  });
});

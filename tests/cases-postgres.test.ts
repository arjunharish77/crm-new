import { beforeEach, describe, expect, it, vi } from "vitest";

function assignDynamicUpdate(sql: string, target: Record<string, any>, params: any[]) {
  const setClause = sql.match(/set\s+([\s\S]+?)\s+where/i)?.[1] ?? "";
  const columns = [...setClause.matchAll(/"?([A-Za-z][A-Za-z0-9]*)"?\s*=\s*\$\d+/g)].map((match) => match[1]);
  columns.forEach((column, index) => {
    target[column] = params[index];
  });
}

const state = vi.hoisted(() => ({
  caseTypes: [] as any[],
  caseStatuses: [] as any[],
  casePriorities: [] as any[],
  caseQueues: [] as any[],
  queueMemberships: [] as any[],
  slaPolicies: [] as any[],
  cases: [] as any[],
  comments: [] as any[],
  assignmentLogs: [] as any[],
  auditLogs: [] as any[],
  users: [] as any[],
  moduleEnabled: true,
}));

function resetState() {
  state.caseTypes = [];
  state.caseStatuses = [];
  state.casePriorities = [];
  state.caseQueues = [];
  state.queueMemberships = [];
  state.slaPolicies = [];
  state.cases = [];
  state.comments = [];
  state.assignmentLogs = [];
  state.auditLogs = [];
  state.users = [];
  state.moduleEnabled = true;
}
resetState();

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "CaseSlaPolicy"') && sql.includes('"isActive" = true')) {
      return state.slaPolicies.filter((p) => p.tenantId === params[0] && p.isActive);
    }
    if (sql.includes('"userId" from "CaseQueueMembership"')) {
      return state.queueMemberships.filter((m) => m.tenantId === params[0] && m.queueId === params[1]).map((m) => ({ userId: m.userId }));
    }
    if (sql.includes('from "CaseComment"')) {
      return state.comments.filter((c) => c.tenantId === params[0] && c.caseId === params[1]);
    }
    if (sql.includes('from "CaseAssignmentLog"')) {
      return state.assignmentLogs.filter((a) => a.tenantId === params[0] && a.caseId === params[1]);
    }
    if (sql.includes('from "Case"') && sql.includes('order by "createdAt" desc')) {
      return state.cases.filter((c) => c.tenantId === params[0]);
    }
    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('select id from "CaseType" where "tenantId" = $1 limit 1')) {
      return state.caseTypes.find((t) => t.tenantId === params[0]) ?? null;
    }
    if (sql.includes('from "CaseType"') && sql.includes('"isActive" = true')) {
      const rows = state.caseTypes.filter((t) => t.tenantId === params[0] && t.isActive).sort((a, b) => a.order - b.order);
      return rows[0] ?? null;
    }
    if (sql.includes('from "CaseStatus"') && sql.includes('"isDefault" = true')) {
      return state.caseStatuses.find((s) => s.tenantId === params[0] && s.isDefault) ?? null;
    }
    if (sql.includes('from "CaseStatus"') && sql.includes('order by "order" asc limit 1')) {
      const rows = state.caseStatuses.filter((s) => s.tenantId === params[0]).sort((a, b) => a.order - b.order);
      return rows[0] ?? null;
    }
    if (sql.includes('"isClosedStatus" from "CaseStatus"')) {
      const row = state.caseStatuses.find((s) => s.tenantId === params[0] && s.id === params[1]);
      return row ? { isClosedStatus: row.isClosedStatus } : null;
    }
    if (sql.includes('select * from "CaseStatus" where "tenantId" = $1 and id = $2')) {
      return state.caseStatuses.find((s) => s.tenantId === params[0] && s.id === params[1]) ?? null;
    }
    if (sql.includes('from "CasePriority"') && sql.includes('"isDefault" = true')) {
      return state.casePriorities.find((p) => p.tenantId === params[0] && p.isDefault) ?? null;
    }
    if (sql.includes('from "CasePriority"') && sql.includes('order by level asc limit 1')) {
      const rows = state.casePriorities.filter((p) => p.tenantId === params[0]).sort((a, b) => a.level - b.level);
      return rows[0] ?? null;
    }
    if (sql.includes('coalesce(max("caseNumber")')) {
      const existing = state.cases.filter((c) => c.tenantId === params[0]);
      const max = existing.reduce((m, c) => Math.max(m, c.caseNumber), 0);
      return { next: max + 1 };
    }
    if (sql.includes('"roundRobinCursor" from "CaseQueue"')) {
      const queue = state.caseQueues.find((q) => q.tenantId === params[0] && q.id === params[1]);
      return queue ? { roundRobinCursor: queue.roundRobinCursor } : null;
    }
    if (sql.includes('insert into "Case"')) {
      const row = {
        id: params[0], tenantId: params[1], caseNumber: params[2], subject: params[3], description: params[4],
        typeId: params[5], statusId: params[6], priorityId: params[7], queueId: params[8], ownerId: params[9],
        requesterName: params[10], requesterEmail: params[11], requesterPhone: params[12],
        relatedLeadId: params[13], relatedOpportunityId: params[14], relatedPartnerId: params[15],
        slaPolicyId: params[16], firstResponseDueAt: params[17], resolutionDueAt: params[18],
        firstRespondedAt: null, resolvedAt: null, closedAt: null, reopenedCount: 0, resolutionNotes: null,
        createdBy: params[19], createdAt: params[20], updatedAt: params[20],
      };
      state.cases.push(row);
      return row;
    }
    if (sql.includes('from "Case" where "tenantId" = $1 and id = $2 limit 1')) {
      return state.cases.find((c) => c.tenantId === params[0] && c.id === params[1]) ?? null;
    }
    if (sql.includes('update "Case" set "ownerId" = $1')) {
      const row = state.cases.find((c) => c.id === params[3]);
      if (row) Object.assign(row, { ownerId: params[0], updatedAt: params[1] });
      return row ?? null;
    }
    if (sql.includes('update "Case" set')) {
      const idIndex = params.length - 1;
      const row = state.cases.find((c) => c.id === params[idIndex]);
      if (!row) return null;
      assignDynamicUpdate(sql, row, params);
      return row;
    }
    if (sql.includes('insert into "CaseComment"')) {
      const row = { id: params[0], tenantId: params[1], caseId: params[2], authorId: params[3], body: params[4], isInternal: params[5], createdAt: params[6] };
      state.comments.push(row);
      return row;
    }
    if (sql.includes('select id, name, email from "User" where "tenantId" = $1 and id = $2 limit 1')) {
      return state.users.find((u) => u.tenantId === params[0] && u.id === params[1]) ?? null;
    }
    return null;
  }),
  execute: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('update "CaseQueue" set "roundRobinCursor"')) {
      const queue = state.caseQueues.find((q) => q.id === params[3]);
      if (queue) queue.roundRobinCursor = params[0];
    }
    if (sql.includes('insert into "CaseAssignmentLog"')) {
      state.assignmentLogs.push({ id: params[0], tenantId: params[1], caseId: params[2], assignedToId: params[3], assignedById: params[4], queueId: params[5], reason: params[6], assignedAt: params[7] });
    }
    if (sql.includes('insert into "AuditLog"')) {
      state.auditLogs.push({ userId: params[2], action: params[3], entityId: params[4] });
    }
    if (sql.includes('"firstRespondedAt" = $1')) {
      const row = state.cases.find((c) => c.tenantId === params[1] && c.id === params[2]);
      if (row) row.firstRespondedAt = params[0];
    }
    return 1;
  }),
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_user: any, fn: (client: any) => Promise<any>) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

vi.mock("@/lib/server/module-entitlements", () => ({
  assertModuleEnabled: vi.fn(async () => {
    if (!state.moduleEnabled) throw new Error("MODULE_DISABLED:SERVICE_DESK");
  }),
}));

const runAutomationsForEventMock = vi.fn(async () => []);
vi.mock("@/lib/repositories/automations-postgres", () => ({
  runAutomationsForEvent: runAutomationsForEventMock,
}));

const createUserNotificationMock = vi.fn(async () => undefined);
vi.mock("@/lib/server/notifications", () => ({
  createUserNotification: createUserNotificationMock,
}));

const TENANT_USER = { id: "agent-1", tenantId: "tenant-1" };

function seedBaseConfig() {
  state.caseTypes.push({ id: "type-1", tenantId: "tenant-1", isActive: true, order: 0 });
  state.caseStatuses.push(
    { id: "status-open", tenantId: "tenant-1", isDefault: true, order: 0, isClosedStatus: false },
    { id: "status-closed", tenantId: "tenant-1", isDefault: false, order: 1, isClosedStatus: true },
  );
  state.casePriorities.push({ id: "pri-medium", tenantId: "tenant-1", isDefault: true, level: 2 });
}

describe("cases-postgres", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  it("creates a case, resolves the most specific active SLA policy, and fires CASE_CREATED", async () => {
    seedBaseConfig();
    state.slaPolicies.push(
      { id: "sla-generic", tenantId: "tenant-1", isActive: true, caseTypeId: null, casePriorityId: null, firstResponseMinutes: 60, resolutionMinutes: 1440 },
      { id: "sla-specific", tenantId: "tenant-1", isActive: true, caseTypeId: "type-1", casePriorityId: "pri-medium", firstResponseMinutes: 15, resolutionMinutes: 120 },
    );

    const { createCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    const created = await createCaseForTenant(TENANT_USER, { subject: "Login broken" });

    expect(created.caseNumber).toBe(1);
    expect(created.slaPolicyId).toBe("sla-specific");
    expect(new Date(created.resolutionDueAt).getTime()).toBeGreaterThan(new Date(created.firstResponseDueAt).getTime());
    expect(state.auditLogs).toHaveLength(1);
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(TENANT_USER, "CASE_CREATED", "CASE", created.id, expect.anything());
  });

  it("auto-assigns via queue round robin and fires CASE_ASSIGNED, alternating across members", async () => {
    seedBaseConfig();
    state.caseQueues.push({ id: "queue-1", tenantId: "tenant-1", roundRobinCursor: -1 });
    state.queueMemberships.push(
      { tenantId: "tenant-1", queueId: "queue-1", userId: "user-a" },
      { tenantId: "tenant-1", queueId: "queue-1", userId: "user-b" },
    );

    const { createCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    const first = await createCaseForTenant(TENANT_USER, { subject: "First", queueId: "queue-1" });
    const second = await createCaseForTenant(TENANT_USER, { subject: "Second", queueId: "queue-1" });

    expect(first.ownerId).toBe("user-a");
    expect(second.ownerId).toBe("user-b");
    expect(state.assignmentLogs).toHaveLength(2);
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(TENANT_USER, "CASE_ASSIGNED", "CASE", first.id, expect.anything());
  });

  it("does not auto-assign or fire CASE_ASSIGNED when created without a queue", async () => {
    seedBaseConfig();

    const { createCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    const created = await createCaseForTenant(TENANT_USER, { subject: "No queue" });

    expect(created.ownerId).toBeNull();
    expect(runAutomationsForEventMock).not.toHaveBeenCalledWith(TENANT_USER, "CASE_ASSIGNED", "CASE", created.id, expect.anything());
  });

  it("rejects case creation when the Service Desk module is disabled", async () => {
    seedBaseConfig();
    state.moduleEnabled = false;

    const { createCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    await expect(createCaseForTenant(TENANT_USER, { subject: "Blocked" })).rejects.toThrow("MODULE_DISABLED");
  });

  it("stamps resolvedAt/closedAt and fires CASE_RESOLVED when moving to a closed status", async () => {
    seedBaseConfig();
    state.cases.push({ id: "case-1", tenantId: "tenant-1", statusId: "status-open", reopenedCount: 0, resolvedAt: null, closedAt: null });

    const { updateCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    const updated = await updateCaseForTenant(TENANT_USER, "case-1", { statusId: "status-closed" });

    expect(updated?.resolvedAt).toBeTruthy();
    expect(updated?.closedAt).toBeTruthy();
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(TENANT_USER, "CASE_RESOLVED", "CASE", "case-1", expect.anything());
  });

  it("increments reopenedCount, clears closedAt, and fires CASE_REOPENED when moving off a closed status", async () => {
    seedBaseConfig();
    state.cases.push({ id: "case-1", tenantId: "tenant-1", statusId: "status-closed", reopenedCount: 0, resolvedAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-01T00:00:00.000Z" });

    const { updateCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    const updated = await updateCaseForTenant(TENANT_USER, "case-1", { statusId: "status-open" });

    expect(updated?.reopenedCount).toBe(1);
    expect(updated?.closedAt).toBeNull();
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(TENANT_USER, "CASE_REOPENED", "CASE", "case-1", expect.anything());
  });

  it("fires CASE_UPDATED (not a status event) for a non-status field edit", async () => {
    seedBaseConfig();
    state.cases.push({ id: "case-1", tenantId: "tenant-1", statusId: "status-open", subject: "Old subject", reopenedCount: 0 });

    const { updateCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    const updated = await updateCaseForTenant(TENANT_USER, "case-1", { subject: "New subject" });

    expect(updated?.subject).toBe("New subject");
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(TENANT_USER, "CASE_UPDATED", "CASE", "case-1", expect.anything());
  });

  it("stamps firstRespondedAt on the first external reply only, never for internal notes", async () => {
    state.cases.push({ id: "case-1", tenantId: "tenant-1", firstRespondedAt: null });

    const { addCommentToCase } = await import("@/lib/repositories/cases-postgres");
    await addCommentToCase(TENANT_USER, "case-1", { body: "Internal note", isInternal: true });
    expect(state.cases[0].firstRespondedAt).toBeNull();

    await addCommentToCase(TENANT_USER, "case-1", { body: "We're looking into it", isInternal: false });
    const firstStamp = state.cases[0].firstRespondedAt;
    expect(firstStamp).toBeTruthy();

    await addCommentToCase(TENANT_USER, "case-1", { body: "Second reply", isInternal: false });
    expect(state.cases[0].firstRespondedAt).toBe(firstStamp);
  });

  it("assignCaseToUser requires a reason and a real target user, logs the actor, and notifies the previous owner", async () => {
    state.cases.push({ id: "case-1", tenantId: "tenant-1", caseNumber: 7, subject: "Billing issue", ownerId: "user-old", queueId: null });
    state.users.push({ id: "user-new", tenantId: "tenant-1", name: "New Agent", email: "new@example.com" });

    const { assignCaseToUser } = await import("@/lib/repositories/cases-postgres");

    await expect(assignCaseToUser(TENANT_USER, "case-1", { newOwnerId: "user-new", reason: "" })).rejects.toThrow("CASE_ASSIGNMENT_REASON_REQUIRED");

    const updated = await assignCaseToUser(TENANT_USER, "case-1", { newOwnerId: "user-new", reason: "Workload rebalance" });

    expect(updated?.ownerId).toBe("user-new");
    expect(state.assignmentLogs[0]).toMatchObject({ assignedToId: "user-new", assignedById: "agent-1" });
    expect(createUserNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-old" }));
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(TENANT_USER, "CASE_ASSIGNED", "CASE", "case-1", expect.anything());
  });

  it("assignCaseToUser does not notify when the previous owner is the same as the actor", async () => {
    state.cases.push({ id: "case-1", tenantId: "tenant-1", caseNumber: 8, subject: "My own case", ownerId: "agent-1", queueId: null });
    state.users.push({ id: "user-new", tenantId: "tenant-1", name: "New Agent" });

    const { assignCaseToUser } = await import("@/lib/repositories/cases-postgres");
    await assignCaseToUser(TENANT_USER, "case-1", { newOwnerId: "user-new", reason: "Handing this off" });

    expect(createUserNotificationMock).not.toHaveBeenCalled();
  });
});

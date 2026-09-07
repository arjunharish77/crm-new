import { beforeEach, describe, expect, it, vi } from "vitest";

// Gap checklist Module 16's app event bus -- extended to Task, Case, and Communication once
// each domain's own real automation-trigger-equivalent hook was confirmed to exist (checked
// directly via grep before building, not assumed): Task and Case gained theirs when Modules 1/11
// were completed after the event bus's original pass; Communication already had one. Partner,
// Payout, and Scoring still have no such hook anywhere in this codebase, so they stay unwired.

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const automationMocks = vi.hoisted(() => ({ runAutomationsForEvent: vi.fn().mockResolvedValue(undefined) }));
const notificationMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));
const slaPolicyMocks = vi.hoisted(() => ({ getActiveTaskSlaPolicyForPriority: vi.fn().mockResolvedValue(null) }));
const nbaMocks = vi.hoisted(() => ({ refreshNextBestActionsForRecord: vi.fn().mockResolvedValue(undefined) }));
const busMocks = vi.hoisted(() => ({ enqueueWebhookEvent: vi.fn().mockResolvedValue(undefined), enqueueAppEvent: vi.fn().mockResolvedValue(undefined) }));
const moduleMocks = vi.hoisted(() => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined), isModuleEnabledForTenant: vi.fn().mockResolvedValue(true) }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/db/transaction", () => ({ withTransaction: vi.fn(async (_ctx, fn) => fn({ query: vi.fn() })) }));
vi.mock("@/lib/repositories/automations-postgres", () => automationMocks);
vi.mock("@/lib/server/notifications", () => notificationMocks);
vi.mock("@/lib/repositories/task-sla-policies-postgres", () => slaPolicyMocks);
vi.mock("@/lib/server/next-best-action", () => nbaMocks);
vi.mock("@/lib/server/webhook-outbox", () => ({ enqueueWebhookEvent: busMocks.enqueueWebhookEvent, WEBHOOK_EVENT_TYPES: [], }));
vi.mock("@/lib/server/marketplace-events", () => ({ enqueueAppEvent: busMocks.enqueueAppEvent }));
vi.mock("@/lib/server/module-entitlements", () => moduleMocks);
vi.mock("@/lib/server/crm", () => crmMocks);

const user = { id: "user-1", tenantId: "tenant-a" };

beforeEach(() => {
  dbMocks.query.mockReset().mockResolvedValue([]);
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset().mockResolvedValue(1);
  automationMocks.runAutomationsForEvent.mockReset().mockResolvedValue(undefined);
  busMocks.enqueueWebhookEvent.mockReset().mockResolvedValue(undefined);
  busMocks.enqueueAppEvent.mockReset().mockResolvedValue(undefined);
});

describe("Task event domain", () => {
  it("fires TASK_CREATED on both buses when a task is created", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "task-1", tenantId: "tenant-a", leadId: "lead-1", opportunityId: null, activityId: null });
    const { createTaskForTenant } = await import("@/lib/repositories/tasks-postgres");
    await createTaskForTenant(user, { title: "Follow up" });

    expect(busMocks.enqueueWebhookEvent).toHaveBeenCalledWith("tenant-a", "TASK_CREATED", expect.objectContaining({ id: "task-1" }));
    expect(busMocks.enqueueAppEvent).toHaveBeenCalledWith("tenant-a", "TASK_CREATED", expect.objectContaining({ id: "task-1" }));
  });

  it("fires TASK_UPDATED (not TASK_COMPLETED) when a task is completed -- collapsed for the external bus", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "task-1", tenantId: "tenant-a", status: "OPEN", leadId: "lead-1", opportunityId: null })
      .mockResolvedValueOnce({ id: "task-1", tenantId: "tenant-a", status: "COMPLETED", leadId: "lead-1", opportunityId: null });
    const { updateTaskForTenant } = await import("@/lib/repositories/tasks-postgres");
    await updateTaskForTenant(user, "task-1", { status: "COMPLETED" } as any);

    expect(busMocks.enqueueWebhookEvent).toHaveBeenCalledWith("tenant-a", "TASK_UPDATED", expect.anything());
    expect(busMocks.enqueueWebhookEvent).not.toHaveBeenCalledWith(expect.anything(), "TASK_COMPLETED", expect.anything());
  });
});

describe("Case event domain", () => {
  it("fires CASE_CREATED, and CASE_ASSIGNED too when an owner is set", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "type-1" }) // ensureCaseDefaultsForTenant's own CaseType check -- truthy short-circuits it
      .mockResolvedValueOnce({ next: 1 }) // nextCaseNumber
      .mockResolvedValueOnce({ id: "case-1", tenantId: "tenant-a", caseNumber: 1, ownerId: "user-2" }); // the actual Case insert
    dbMocks.query.mockResolvedValue([]); // resolveSlaPolicyForCase -- no active policies

    const { createCaseForTenant } = await import("@/lib/repositories/cases-postgres");
    const created = await createCaseForTenant(user, {
      subject: "Help", typeId: "type-1", priorityId: "prio-1", statusId: "status-1", ownerId: "user-2",
    } as any);

    expect(created).toMatchObject({ id: "case-1" });
    const calledTypes = busMocks.enqueueWebhookEvent.mock.calls.map((call) => call[1]);
    expect(calledTypes).toEqual(["CASE_CREATED", "CASE_ASSIGNED"]);
    expect(busMocks.enqueueAppEvent.mock.calls.map((call) => call[1])).toEqual(["CASE_CREATED", "CASE_ASSIGNED"]);
  });

  it("fires CASE_SLA_BREACHED from the scheduled SLA sweep", async () => {
    const caseRow = { id: "case-1", tenantId: "tenant-a", statusId: "status-1" };
    dbMocks.query
      .mockResolvedValueOnce([]) // warningCandidates -- none
      .mockResolvedValueOnce([caseRow]); // breachCandidates
    const { processCaseSlaEscalations } = await import("@/lib/repositories/cases-postgres");
    await processCaseSlaEscalations(10);

    expect(busMocks.enqueueWebhookEvent).toHaveBeenCalledWith("tenant-a", "CASE_SLA_BREACHED", caseRow);
  });
});

describe("Communication event domain", () => {
  it("fires COMMUNICATION_SENT for a SENT delivery event, not for RETRY_SCHEDULED", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "event-1", tenantId: "tenant-a", entityType: "LEAD", entityId: "lead-1", eventType: "SENT",
    });
    const { recordProviderWebhookEvent } = await import("@/lib/server/communications");
    await recordProviderWebhookEvent({ tenantId: "tenant-a", channel: "EMAIL" as any, eventType: "SENT", payload: {} });

    expect(busMocks.enqueueWebhookEvent).toHaveBeenCalledWith("tenant-a", "COMMUNICATION_SENT", expect.anything());
  });

  it("does not fire a bus event for RETRY_SCHEDULED (only SENT/FAILED do)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "event-1", tenantId: "tenant-a", entityType: "LEAD", entityId: "lead-1", eventType: "RETRY_SCHEDULED",
    });
    const { recordProviderWebhookEvent } = await import("@/lib/server/communications");
    await recordProviderWebhookEvent({ tenantId: "tenant-a", channel: "EMAIL" as any, eventType: "RETRY_SCHEDULED", payload: {} });

    expect(busMocks.enqueueWebhookEvent).not.toHaveBeenCalled();
    expect(busMocks.enqueueAppEvent).not.toHaveBeenCalled();
  });

  it("fires COMMUNICATION_FAILED for a FAILED delivery event", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "event-1", tenantId: "tenant-a", entityType: "OPPORTUNITY", entityId: "opp-1", eventType: "FAILED",
    });
    const { recordProviderWebhookEvent } = await import("@/lib/server/communications");
    await recordProviderWebhookEvent({ tenantId: "tenant-a", channel: "EMAIL" as any, eventType: "FAILED", payload: {} });

    expect(busMocks.enqueueAppEvent).toHaveBeenCalledWith("tenant-a", "COMMUNICATION_FAILED", expect.anything());
  });
});

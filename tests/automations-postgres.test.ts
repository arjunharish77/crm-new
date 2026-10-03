import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();
const withAdvisoryLockMock = vi.fn(async (_client, _lockKey, callback) => callback());
const queueCommunicationForTenantMock = vi.fn(async (_user: any, _input: any, _client?: any) => ({ id: "outbox-1", status: "QUEUED" }));
const assignCaseToUserMock = vi.fn(async (_user: any, _caseId: string, _input: any) => ({ id: "case-1", ownerId: "user-1" }));
const addCommentToCaseMock = vi.fn(async (_user: any, _caseId: string, _input: any) => ({ id: "comment-1" }));
const addLeadsToLeadListForTenantMock = vi.fn(async (_user: any, _listId: string, _leadIds: string[]) => ({ id: "list-1", addedLeadIds: _leadIds }));
const removeLeadFromLeadListForTenantMock = vi.fn(async (_user: any, _listId: string, _leadId: string) => undefined);

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
  queryAsSystem: queryMock,
  queryOneAsSystem: queryOneMock,
  executeAsSystem: executeMock,
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_user, callback) => callback(undefined)),
  withAdvisoryLock: withAdvisoryLockMock,
}));

vi.mock("@/lib/server/communications", () => ({
  queueCommunicationForTenant: queueCommunicationForTenantMock,
}));

vi.mock("@/lib/repositories/cases-postgres", () => ({
  assignCaseToUser: assignCaseToUserMock,
  addCommentToCase: addCommentToCaseMock,
}));

vi.mock("@/lib/server/crm", () => ({
  addLeadsToLeadListForTenant: addLeadsToLeadListForTenantMock,
  removeLeadFromLeadListForTenant: removeLeadFromLeadListForTenantMock,
}));

describe("direct Postgres automations repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    withAdvisoryLockMock.mockClear();
    queueCommunicationForTenantMock.mockClear();
    queueCommunicationForTenantMock.mockResolvedValue({ id: "outbox-1", status: "QUEUED" });
    assignCaseToUserMock.mockClear();
    addCommentToCaseMock.mockClear();
    addLeadsToLeadListForTenantMock.mockClear();
    removeLeadFromLeadListForTenantMock.mockClear();
  });

  it("lists automations with execution counts", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "automation-1",
          name: "Admissions SLA",
          trigger: { type: "LEAD_CREATED" },
          workflow: { nodes: [], edges: [] },
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ automationId: "automation-1", count: 4 }]);

    const { listAutomationsForTenant } = await import("@/lib/repositories/automations-postgres");
    const result = await listAutomationsForTenant({ id: "user-1", tenantId: "tenant-1" });

    expect(result[0]._count.executions).toBe(4);
    expect(queryMock.mock.calls[0][0]).toContain('from "AutomationV2"');
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
  });

  it("runs matching automations and records execution logs", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Tag hot leads",
        trigger: { type: "LEAD_CREATED", conditions: [{ field: "source", operator: "equals", value: "FORM" }] },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "tag", data: { type: "tag_lead", value: "HOT" } },
          ],
          edges: [{ source: "trigger", target: "tag" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ tags: ["FORM"] });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "LEAD_CREATED",
      "LEAD",
      "lead-1",
      { id: "lead-1", source: "FORM" },
    );

    expect(result).toEqual([{ automationId: "automation-1", status: "COMPLETED" }]);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('update "Lead" set'))).toBe(true);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AutomationExecution"'))).toBe(true);
  });

  it("routes the send_email action node through the consent-aware queueCommunicationForTenant instead of a raw insert", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Welcome email",
        trigger: { type: "LEAD_CREATED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "email", data: { type: "send_email", channel: "EMAIL", subject: "Welcome", message: "Hi there" } },
          ],
          edges: [{ source: "trigger", target: "email" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "LEAD_CREATED",
      "LEAD",
      "lead-1",
      { id: "lead-1", email: "lead@example.com" },
    );

    expect(result).toEqual([{ automationId: "automation-1", status: "COMPLETED" }]);
    expect(queueCommunicationForTenantMock).toHaveBeenCalledTimes(1);
    const [callUser, input] = queueCommunicationForTenantMock.mock.calls[0];
    expect(callUser.tenantId).toBe("tenant-1");
    expect(input).toMatchObject({
      channel: "EMAIL",
      recipient: "lead@example.com",
      subject: "Welcome",
      body: "Hi there",
      sourceType: "AUTOMATION",
      entityType: "LEAD",
      entityId: "lead-1",
    });
    // The old behavior inserted directly into CommunicationOutbox, bypassing consent/
    // suppression checks entirely -- confirms that raw path is gone, not just that the
    // new path also happens to run.
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "CommunicationOutbox"'))).toBe(false);
  });

  it("passes fallback/throttle config through to queueCommunicationForTenant's new fields (gap checklist Module 8, item 8)", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Welcome email with fallback",
        trigger: { type: "LEAD_CREATED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            {
              id: "email",
              data: {
                type: "send_email",
                channel: "EMAIL",
                subject: "Welcome",
                message: "Hi there",
                fallbackChannel: "SMS",
                fallbackTo: "+919999999999",
                fallbackMessage: "Fallback SMS text",
                fallbackDelayMinutes: 15,
                fallbackCondition: "FAILED_ONLY",
                throttlePerMinute: 30,
              },
            },
          ],
          edges: [{ source: "trigger", target: "email" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "LEAD_CREATED",
      "LEAD",
      "lead-1",
      { id: "lead-1", email: "lead@example.com", phone: "+919999999999" },
    );

    const [, input] = queueCommunicationForTenantMock.mock.calls[0];
    expect(input.fallback).toMatchObject({
      channel: "SMS",
      recipient: "+919999999999",
      body: "Fallback SMS text",
      delayMinutes: 15,
      // FAILED_ONLY must suppress the immediate blocked-at-enqueue fallback branch --
      // it should only ever fire from the delayed FAILED-branch path.
      immediate: false,
    });
    expect(input.deliveryControls).toMatchObject({ throttlePerMinute: 30, throttleKey: "tenant-1:LEAD:send_email" });
  });

  it("omits fallback/deliveryControls entirely when the node has none configured", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Plain email",
        trigger: { type: "LEAD_CREATED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "email", data: { type: "send_email", channel: "EMAIL", subject: "Welcome", message: "Hi there" } },
          ],
          edges: [{ source: "trigger", target: "email" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    await runAutomationsForEvent({ id: "user-1", tenantId: "tenant-1" }, "LEAD_CREATED", "LEAD", "lead-1", { id: "lead-1", email: "lead@example.com" });

    const [, input] = queueCommunicationForTenantMock.mock.calls[0];
    expect(input.fallback).toBeNull();
    expect(input.deliveryControls).toBeNull();
  });

  it("routes the assign_case action node through assignCaseToUser, with a default reason when none is configured", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Auto-assign new cases",
        trigger: { type: "CASE_CREATED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "assign", data: { type: "assign_case", ownerId: "user-2" } },
          ],
          edges: [{ source: "trigger", target: "assign" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "CASE_CREATED",
      "CASE",
      "case-1",
      { id: "case-1" },
    );

    expect(result).toEqual([{ automationId: "automation-1", status: "COMPLETED" }]);
    expect(assignCaseToUserMock).toHaveBeenCalledTimes(1);
    const [callUser, caseId, input] = assignCaseToUserMock.mock.calls[0];
    expect(callUser.tenantId).toBe("tenant-1");
    expect(caseId).toBe("case-1");
    expect(input).toEqual({ newOwnerId: "user-2", reason: "Assigned by automation" });
  });

  it("routes the add_case_comment action node through addCommentToCase as an internal note by default", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Note on resolve",
        trigger: { type: "CASE_RESOLVED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "comment", data: { type: "add_case_comment", body: "Auto-closed after 7 days" } },
          ],
          edges: [{ source: "trigger", target: "comment" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "CASE_RESOLVED",
      "CASE",
      "case-1",
      { id: "case-1" },
    );

    expect(addCommentToCaseMock).toHaveBeenCalledTimes(1);
    const [, caseId, input] = addCommentToCaseMock.mock.calls[0];
    expect(caseId).toBe("case-1");
    expect(input).toEqual({ body: "Auto-closed after 7 days", isInternal: true });
  });

  it("routes the add_to_list action node through addLeadsToLeadListForTenant (previously a silent no-op)", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Add to nurture list",
        trigger: { type: "LEAD_CREATED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "add", data: { type: "add_to_list", listId: "list-1" } },
          ],
          edges: [{ source: "trigger", target: "add" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "LEAD_CREATED",
      "LEAD",
      "lead-1",
      { id: "lead-1" },
    );

    expect(addLeadsToLeadListForTenantMock).toHaveBeenCalledTimes(1);
    const [callUser, listId, leadIds] = addLeadsToLeadListForTenantMock.mock.calls[0];
    expect(callUser.tenantId).toBe("tenant-1");
    expect(listId).toBe("list-1");
    expect(leadIds).toEqual(["lead-1"]);
    expect(removeLeadFromLeadListForTenantMock).not.toHaveBeenCalled();
  });

  it("routes the remove_from_list action node through removeLeadFromLeadListForTenant, resolving the lead via record.leadId for an Opportunity-triggered workflow", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Remove from nurture list on close",
        trigger: { type: "STAGE_CHANGED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "remove", data: { type: "remove_from_list", listId: "list-1" } },
          ],
          edges: [{ source: "trigger", target: "remove" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "STAGE_CHANGED",
      "OPPORTUNITY",
      "opp-1",
      { id: "opp-1", leadId: "lead-1" },
    );

    expect(removeLeadFromLeadListForTenantMock).toHaveBeenCalledTimes(1);
    const [callUser, listId, leadId] = removeLeadFromLeadListForTenantMock.mock.calls[0];
    expect(callUser.tenantId).toBe("tenant-1");
    expect(listId).toBe("list-1");
    expect(leadId).toBe("lead-1");
    expect(addLeadsToLeadListForTenantMock).not.toHaveBeenCalled();
  });

  it("skips assign_case/add_case_comment nodes when the triggering entity isn't a Case", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Misconfigured",
        trigger: { type: "LEAD_CREATED" },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "assign", data: { type: "assign_case", ownerId: "user-2" } },
          ],
          edges: [{ source: "trigger", target: "assign" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "LEAD_CREATED",
      "LEAD",
      "lead-1",
      { id: "lead-1" },
    );

    expect(result).toEqual([{ automationId: "automation-1", status: "COMPLETED" }]);
    expect(assignCaseToUserMock).not.toHaveBeenCalled();
  });

  // Gap checklist Module 16's app event bus, "triggers" half -- built per explicit user
  // decision. fireAppAutomationTrigger (marketplace-inbound.ts) always calls this with
  // eventType/entityType "APP_EVENT"; these tests cover triggerMatches' own APP_EVENT branch.
  it("matches an APP_EVENT trigger scoped to one specific app and event name", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Order webhook automation",
        trigger: { type: "APP_EVENT", appId: "app-1", eventName: "order.completed" },
        workflow: { nodes: [{ id: "trigger", data: { type: "trigger" } }], edges: [] },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "app-1", tenantId: "tenant-1" },
      "APP_EVENT",
      "APP_EVENT",
      "evt-1",
      { appId: "app-1", eventName: "order.completed", payload: { orderId: "o-1" } },
    );

    expect(result).toEqual([{ automationId: "automation-1", status: "COMPLETED" }]);
  });

  it("does not match an APP_EVENT trigger scoped to a different app", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Order webhook automation",
        trigger: { type: "APP_EVENT", appId: "app-2", eventName: "order.completed" },
        workflow: { nodes: [{ id: "trigger", data: { type: "trigger" } }], edges: [] },
        isActive: true,
      },
    ]);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "app-1", tenantId: "tenant-1" },
      "APP_EVENT",
      "APP_EVENT",
      "evt-1",
      { appId: "app-1", eventName: "order.completed", payload: {} },
    );

    expect(result).toEqual([]);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AutomationExecution"'))).toBe(false);
  });

  it("matches every app-originated event when the trigger declares no appId/eventName filter", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Catch-all app event automation",
        trigger: { type: "APP_EVENT" },
        workflow: { nodes: [{ id: "trigger", data: { type: "trigger" } }], edges: [] },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ count: 0 });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "app-1", tenantId: "tenant-1" },
      "APP_EVENT",
      "APP_EVENT",
      "evt-1",
      { appId: "app-1", eventName: "anything.at.all", payload: {} },
    );

    expect(result).toEqual([{ automationId: "automation-1", status: "COMPLETED" }]);
  });

  it("processes due queue jobs under an advisory lock", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "queue-1",
        tenantId: "tenant-1",
        userId: "user-1",
        automationId: "automation-1",
        entityType: "LEAD",
        entityId: "lead-1",
        record: { id: "lead-1" },
        resumeNodeIds: ["notify"],
        attempts: 0,
      },
    ]);
    queryOneMock
      .mockResolvedValueOnce({ id: "user-1", tenantId: "tenant-1" })
      .mockResolvedValueOnce({
        id: "automation-1",
        tenantId: "tenant-1",
        isActive: true,
        trigger: { type: "LEAD_CREATED" },
        workflow: { nodes: [{ id: "notify", data: { type: "notify_user", title: "Follow up" } }], edges: [] },
      });
    executeMock.mockResolvedValue(undefined);

    const { processDueAutomationJobs } = await import("@/lib/repositories/automations-postgres");
    const result = await processDueAutomationJobs(10);

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(withAdvisoryLockMock).toHaveBeenCalled();
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "Notification"'))).toBe(true);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AutomationExecution"'))).toBe(true);
  });

  describe("entitlement gating", () => {
    it("rejects creating an automation when the Automations module is disabled for the tenant", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "TenantModuleEntitlement"')) return { status: "DISABLED" };
        return null;
      });

      const { createAutomationForTenant } = await import("@/lib/repositories/automations-postgres");
      await expect(
        createAutomationForTenant({ id: "user-1", tenantId: "tenant-1" }, { name: "New Automation" }),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("rejects enrolling records when the Automations module is disabled for the tenant", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "TenantModuleEntitlement"')) return { status: "DISABLED" };
        return null;
      });

      const { enrollRecordsInAutomation } = await import("@/lib/repositories/automations-postgres");
      await expect(
        enrollRecordsInAutomation({ id: "user-1", tenantId: "tenant-1" }, "automation-1", "LEAD", ["lead-1"]),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("silently skips (no-op) running event automations when the Automations module is disabled, without throwing", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "TenantModuleEntitlement"')) return { status: "DISABLED" };
        return null;
      });

      const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
      const result = await runAutomationsForEvent(
        { id: "user-1", tenantId: "tenant-1" },
        "LEAD_CREATED",
        "LEAD",
        "lead-1",
        { id: "lead-1" },
      );

      expect(result).toEqual([]);
      expect(queryMock.mock.calls.some((call) => String(call[0]).includes('from "AutomationV2"'))).toBe(false);
    });

    it("cancels a due queue job instead of executing it when the Automations module is disabled for the job's tenant", async () => {
      queryMock.mockResolvedValueOnce([
        {
          id: "queue-1",
          tenantId: "tenant-1",
          userId: "user-1",
          automationId: "automation-1",
          entityType: "LEAD",
          entityId: "lead-1",
          record: { id: "lead-1" },
          resumeNodeIds: [],
          attempts: 0,
        },
      ]);
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "User"')) return { id: "user-1", tenantId: "tenant-1" };
        if (text.includes('from "AutomationV2"')) return { id: "automation-1", tenantId: "tenant-1", isActive: true, trigger: {}, workflow: { nodes: [], edges: [] } };
        if (text.includes('from "TenantModuleEntitlement"')) return { status: "DISABLED" };
        return null;
      });
      executeMock.mockResolvedValue(undefined);

      const { processDueAutomationJobs } = await import("@/lib/repositories/automations-postgres");
      const result = await processDueAutomationJobs(10);

      expect(result).toEqual({ processed: 0, failed: 0 });
      expect(executeMock.mock.calls.some((call) => String(call[0]).includes('update "AutomationQueue" set status = $1') && call[1][0] === "CANCELLED")).toBe(true);
    });

    it("allows a platform admin to bypass the Automations gate", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "TenantModuleEntitlement"')) return { status: "DISABLED" };
        if (text.includes('insert into "AutomationV2"')) return { id: "automation-1", tenantId: "tenant-1", name: "New Automation" };
        return null;
      });

      const { createAutomationForTenant } = await import("@/lib/repositories/automations-postgres");
      await expect(
        createAutomationForTenant({ id: "admin-1", tenantId: "tenant-1", isPlatformAdmin: true }, { name: "New Automation" }),
      ).resolves.toBeDefined();
    });
  });
});

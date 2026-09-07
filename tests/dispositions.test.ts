import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const leadsRepoMocks = vi.hoisted(() => ({ getLeadForTenant: vi.fn() }));
const opportunitiesRepoMocks = vi.hoisted(() => ({ getOpportunityForTenant: vi.fn() }));
const tasksRepoMocks = vi.hoisted(() => ({ createTaskForTenant: vi.fn() }));
const automationsMocks = vi.hoisted(() => ({ runAutomationsForEvent: vi.fn().mockResolvedValue([]) }));
const callQueuesMocks = vi.hoisted(() => ({ removeCallFromQueue: vi.fn().mockResolvedValue(undefined) }));
const callCampaignsMocks = vi.hoisted(() => ({ recordCallCampaignAttemptOutcome: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);
vi.mock("@/lib/repositories/opportunities-postgres", () => opportunitiesRepoMocks);
vi.mock("@/lib/repositories/tasks-postgres", () => tasksRepoMocks);
vi.mock("@/lib/repositories/automations-postgres", () => automationsMocks);
vi.mock("@/lib/server/call-queues", () => callQueuesMocks);
vi.mock("@/lib/server/call-campaigns", () => callCampaignsMocks);

import {
  listDispositionGroupsForTenant,
  createDispositionGroupForTenant,
  createDispositionOutcomeForTenant,
  logCallDispositionForTenant,
} from "@/lib/server/dispositions";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("call disposition framework", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    leadsRepoMocks.getLeadForTenant.mockReset();
    opportunitiesRepoMocks.getOpportunityForTenant.mockReset();
    tasksRepoMocks.createTaskForTenant.mockReset();
    automationsMocks.runAutomationsForEvent.mockReset().mockResolvedValue([]);
    callQueuesMocks.removeCallFromQueue.mockReset().mockResolvedValue(undefined);
    callCampaignsMocks.recordCallCampaignAttemptOutcome.mockReset().mockResolvedValue(undefined);
  });

  describe("listDispositionGroupsForTenant", () => {
    it("nests outcomes under their group", async () => {
      dbMocks.query
        .mockResolvedValueOnce([{ id: "group-1", name: "Sales" }])
        .mockResolvedValueOnce([
          { id: "outcome-1", groupId: "group-1", name: "Interested" },
          { id: "outcome-2", groupId: "group-1", name: "Not Interested" },
        ]);

      const groups = await listDispositionGroupsForTenant(user);

      expect(groups).toHaveLength(1);
      expect(groups[0].outcomes).toHaveLength(2);
    });

    it("gives a group with no outcomes an empty array, not undefined", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "group-1", name: "Sales" }]).mockResolvedValueOnce([]);

      const groups = await listDispositionGroupsForTenant(user);

      expect(groups[0].outcomes).toEqual([]);
    });
  });

  describe("createDispositionGroupForTenant", () => {
    it("throws when name is blank", async () => {
      await expect(createDispositionGroupForTenant(user, { name: "   " })).rejects.toThrow("NAME_REQUIRED");
    });

    it("defaults order to one past the current max", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ order: 3 }).mockResolvedValueOnce({ id: "group-1", name: "Sales", order: 4 });

      await createDispositionGroupForTenant(user, { name: "Sales" });

      const insertCall = dbMocks.queryOne.mock.calls[1];
      expect(insertCall[1][3]).toBe(4);
    });
  });

  describe("createDispositionOutcomeForTenant", () => {
    it("throws when the group doesn't belong to this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(createDispositionOutcomeForTenant(user, "group-1", { name: "Interested" })).rejects.toThrow(
        "DISPOSITION_GROUP_NOT_FOUND",
      );
    });

    it("throws when parentOutcomeId doesn't belong to the same group", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "group-1" }) // group lookup
        .mockResolvedValueOnce(null); // parent lookup fails
      await expect(
        createDispositionOutcomeForTenant(user, "group-1", { name: "Sub", parentOutcomeId: "outcome-x" }),
      ).rejects.toThrow("PARENT_OUTCOME_NOT_FOUND");
    });

    it("drops unknown requiredFields entries and dedupes", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "group-1" }) // group lookup
        .mockResolvedValueOnce({ order: 0 }) // last order
        .mockResolvedValueOnce({ id: "outcome-1", requiredFields: ["reasonLost"] }); // insert returning

      await createDispositionOutcomeForTenant(user, "group-1", {
        name: "Lost",
        requiredFields: ["reasonLost", "reasonLost", "notARealField"],
      });

      const insertCall = dbMocks.queryOne.mock.calls[2];
      expect(JSON.parse(insertCall[1][7])).toEqual(["reasonLost"]);
    });
  });

  describe("logCallDispositionForTenant", () => {
    it("throws when no dispositionOutcomeId is supplied", async () => {
      await expect(logCallDispositionForTenant(user, { dispositionOutcomeId: "" } as any)).rejects.toThrow(
        "DISPOSITION_OUTCOME_REQUIRED",
      );
    });

    it("throws when the outcome doesn't exist for this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1" })).rejects.toThrow(
        "DISPOSITION_OUTCOME_NOT_FOUND",
      );
    });

    it("throws a field-specific error when a required field is missing", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Lost", requiredFields: ["reasonLost"] });
      await expect(logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1" })).rejects.toThrow(
        "DISPOSITION_FIELD_REQUIRED:reasonLost",
      );
    });

    it("throws LEAD_NOT_FOUND when the lead isn't accessible to this user", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce(null);
      await expect(
        logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1", leadId: "lead-1" }),
      ).rejects.toThrow("LEAD_NOT_FOUND");
    });

    it("creates a callback Task when callbackAt is supplied and links its id", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Callback", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1", taskId: "task-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });
      tasksRepoMocks.createTaskForTenant.mockResolvedValueOnce({ id: "task-1" });

      await logCallDispositionForTenant(user, {
        dispositionOutcomeId: "outcome-1",
        leadId: "lead-1",
        callbackAt: "2026-08-10T10:00:00.000Z",
        nextAction: "Send proposal",
      });

      expect(tasksRepoMocks.createTaskForTenant).toHaveBeenCalledTimes(1);
      const taskInput = tasksRepoMocks.createTaskForTenant.mock.calls[0][1];
      expect(taskInput.dueAt).toBe("2026-08-10T10:00:00.000Z");
      expect(taskInput.title).toContain("Send proposal");
      const insertCall = dbMocks.queryOne.mock.calls[1];
      expect(insertCall[1][12]).toBe("task-1"); // taskId column
    });

    it("does not create a Task when callbackAt is absent", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });

      await logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1", leadId: "lead-1" });

      expect(tasksRepoMocks.createTaskForTenant).not.toHaveBeenCalled();
    });

    it("fires DISPOSITION_SELECTED targeting LEAD when leadId is present", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });

      await logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1", leadId: "lead-1" });

      expect(automationsMocks.runAutomationsForEvent).toHaveBeenCalledWith(
        user,
        "DISPOSITION_SELECTED",
        "LEAD",
        "lead-1",
        expect.objectContaining({ dispositionOutcomeName: "Interested" }),
      );
    });

    it("fires DISPOSITION_SELECTED targeting OPPORTUNITY when only opportunityId is present", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      opportunitiesRepoMocks.getOpportunityForTenant.mockResolvedValueOnce({ id: "opp-1" });

      await logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1", opportunityId: "opp-1" });

      expect(automationsMocks.runAutomationsForEvent).toHaveBeenCalledWith(
        user,
        "DISPOSITION_SELECTED",
        "OPPORTUNITY",
        "opp-1",
        expect.objectContaining({ dispositionOutcomeName: "Interested" }),
      );
    });

    it("does not fire any automation when neither leadId nor opportunityId is present", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });

      await logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1" });

      expect(automationsMocks.runAutomationsForEvent).not.toHaveBeenCalled();
    });

    it("still logs the disposition even when the callback Task creation fails", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Callback", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });
      tasksRepoMocks.createTaskForTenant.mockRejectedValueOnce(new Error("db down"));

      const row = await logCallDispositionForTenant(user, {
        dispositionOutcomeId: "outcome-1",
        leadId: "lead-1",
        callbackAt: "2026-08-10T10:00:00.000Z",
      });

      expect(row.id).toBe("disposition-1");
    });

    it("removes the call from its queue when the disposition is linked to a callLogId", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });

      await logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1", leadId: "lead-1", callLogId: "call-1" });

      expect(callQueuesMocks.removeCallFromQueue).toHaveBeenCalledWith("tenant-a", "call-1");
    });

    it("does not touch the call queue when no callLogId is given", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });

      await logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1", leadId: "lead-1" });

      expect(callQueuesMocks.removeCallFromQueue).not.toHaveBeenCalled();
    });

    it("records the campaign attempt outcome when a campaignMemberId is given", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });
      tasksRepoMocks.createTaskForTenant.mockResolvedValueOnce({ id: "task-1" });

      await logCallDispositionForTenant(user, {
        dispositionOutcomeId: "outcome-1",
        leadId: "lead-1",
        campaignMemberId: "member-1",
        callbackAt: "2026-06-01T00:00:00.000Z",
      });

      expect(callCampaignsMocks.recordCallCampaignAttemptOutcome).toHaveBeenCalledWith(user, "member-1", {
        callbackAt: "2026-06-01T00:00:00.000Z",
        disposed: true,
      });
    });

    it("does not touch any campaign when no campaignMemberId is given", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "outcome-1", groupId: "group-1", name: "Interested", requiredFields: [] })
        .mockResolvedValueOnce({ id: "disposition-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane" });

      await logCallDispositionForTenant(user, { dispositionOutcomeId: "outcome-1", leadId: "lead-1" });

      expect(callCampaignsMocks.recordCallCampaignAttemptOutcome).not.toHaveBeenCalled();
    });
  });
});

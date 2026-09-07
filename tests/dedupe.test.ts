import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);

import {
  listDedupeMatchRulesForTenant,
  updateDedupeMatchRuleForTenant,
  runDedupeScanForTenant,
  listDedupeMatchesForTenant,
  dismissDedupeMatchForTenant,
  mergeRecordsForTenant,
  unmergeForTenant,
} from "@/lib/repositories/dedupe-postgres";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("dedupe match rules", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
  });

  it("auto-provisions default rules (3 for LEAD, 1 for OPPORTUNITY, 1 for CASE) when none exist yet", async () => {
    dbMocks.query
      .mockResolvedValueOnce([]) // existing LEAD rules
      .mockResolvedValueOnce([]) // existing OPPORTUNITY rules
      .mockResolvedValueOnce([]) // existing CASE rules
      .mockResolvedValueOnce([
        { id: "r1", entityType: "LEAD", ruleType: "EXACT_EMAIL", threshold: null, isActive: true },
        { id: "r2", entityType: "LEAD", ruleType: "EXACT_PHONE", threshold: null, isActive: true },
        { id: "r3", entityType: "LEAD", ruleType: "FUZZY_NAME", threshold: 0.85, isActive: false },
        { id: "r4", entityType: "OPPORTUNITY", ruleType: "FUZZY_NAME", threshold: 0.85, isActive: false },
        { id: "r5", entityType: "CASE", ruleType: "SAME_REQUESTER_EMAIL_OPEN", threshold: null, isActive: true },
      ]);

    const rules = await listDedupeMatchRulesForTenant(user);

    expect(rules).toHaveLength(5);
    // 3 inserts for LEAD (EXACT_EMAIL, EXACT_PHONE, FUZZY_NAME) + 1 for OPPORTUNITY (FUZZY_NAME only) + 1 for CASE (SAME_REQUESTER_EMAIL_OPEN)
    const insertCalls = dbMocks.execute.mock.calls.filter((c) => String(c[0]).includes('insert into "DedupeMatchRule"'));
    expect(insertCalls).toHaveLength(5);
    expect(insertCalls.some((c) => c[1].includes("EXACT_EMAIL") && c[1].includes("OPPORTUNITY"))).toBe(false);
    expect(insertCalls.some((c) => c[1].includes("SAME_REQUESTER_EMAIL_OPEN") && c[1].includes("CASE"))).toBe(true);
  });

  it("does not re-provision rules that already exist", async () => {
    dbMocks.query
      .mockResolvedValueOnce([{ ruleType: "EXACT_EMAIL" }, { ruleType: "EXACT_PHONE" }, { ruleType: "FUZZY_NAME" }])
      .mockResolvedValueOnce([{ ruleType: "FUZZY_NAME" }])
      .mockResolvedValueOnce([{ ruleType: "SAME_REQUESTER_EMAIL_OPEN" }])
      .mockResolvedValueOnce([]);

    await listDedupeMatchRulesForTenant(user);

    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  describe("updateDedupeMatchRuleForTenant", () => {
    it("throws INVALID_THRESHOLD outside (0,1]", async () => {
      await expect(updateDedupeMatchRuleForTenant(user, "r1", { threshold: 1.5 })).rejects.toThrow("INVALID_THRESHOLD");
      await expect(updateDedupeMatchRuleForTenant(user, "r1", { threshold: 0 })).rejects.toThrow("INVALID_THRESHOLD");
    });

    it("throws DEDUPE_MATCH_RULE_NOT_FOUND when the row doesn't exist", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(updateDedupeMatchRuleForTenant(user, "missing", { isActive: true })).rejects.toThrow("DEDUPE_MATCH_RULE_NOT_FOUND");
    });

    it("updates isActive and threshold", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "r1", isActive: true, threshold: 0.9 });
      const rule = await updateDedupeMatchRuleForTenant(user, "r1", { isActive: true, threshold: 0.9 });
      expect((rule as any).isActive).toBe(true);
      expect((rule as any).threshold).toBe(0.9);
    });
  });
});

describe("runDedupeScanForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
  });

  it("upserts a DedupeMatch for each exact-email and exact-phone group found", async () => {
    dbMocks.query.mockImplementation((sql: string) => {
      if (sql.includes('select "ruleType", threshold from "DedupeMatchRule"')) {
        return Promise.resolve([
          { ruleType: "EXACT_EMAIL", threshold: null },
          { ruleType: "EXACT_PHONE", threshold: null },
        ]);
      }
      if (sql.includes("group by lower(trim(email))")) return Promise.resolve([{ ids: ["lead-1", "lead-2"] }]);
      if (sql.includes("group by regexp_replace(phone")) return Promise.resolve([{ ids: ["lead-3", "lead-4"] }]);
      return Promise.resolve([]);
    });

    const result = await runDedupeScanForTenant(user, "LEAD");

    expect(result.candidatesFound).toBe(2);
    const upsertCalls = dbMocks.execute.mock.calls.filter((c) => String(c[0]).includes('insert into "DedupeMatch"'));
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0][1]).toContain("EXACT_EMAIL");
    expect(upsertCalls[1][1]).toContain("EXACT_PHONE");
  });

  it("finds fuzzy-name Lead duplicates within the same company, respecting the threshold", async () => {
    dbMocks.query.mockImplementation((sql: string) => {
      if (sql.includes('select "ruleType", threshold from "DedupeMatchRule"')) {
        return Promise.resolve([{ ruleType: "FUZZY_NAME", threshold: 0.8 }]);
      }
      if (sql.includes('select id, name, company from "Lead"')) {
        return Promise.resolve([
          { id: "lead-1", name: "Jonathan Smith", company: "Acme Inc" },
          { id: "lead-2", name: "Jonathon Smith", company: "Acme Inc" }, // near-identical, same company
          { id: "lead-3", name: "Totally Different Person", company: "Acme Inc" },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await runDedupeScanForTenant(user, "LEAD");

    expect(result.candidatesFound).toBe(1);
    const upsertCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "DedupeMatch"'));
    expect(upsertCall?.[1][3]).toEqual(expect.arrayContaining(["lead-1", "lead-2"]));
  });

  it("finds fuzzy-name Opportunity duplicates scoped to the same lead", async () => {
    dbMocks.query.mockImplementation((sql: string) => {
      if (sql.includes('select "ruleType", threshold from "DedupeMatchRule"')) {
        return Promise.resolve([{ ruleType: "FUZZY_NAME", threshold: 0.8 }]);
      }
      if (sql.includes('select id, title, "leadId" from "Opportunity"')) {
        return Promise.resolve([
          { id: "opp-1", title: "Enterprise Deal", leadId: "lead-1" },
          { id: "opp-2", title: "Enterprise Deall", leadId: "lead-1" },
          { id: "opp-3", title: "Enterprise Deal", leadId: "lead-2" }, // different lead -- not compared
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await runDedupeScanForTenant(user, "OPPORTUNITY");

    expect(result.candidatesFound).toBe(1);
  });
});

describe("listDedupeMatchesForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
  });

  it("enriches each match with the matched records' display fields", async () => {
    dbMocks.query
      .mockResolvedValueOnce([{ id: "match-1", entityType: "LEAD", recordIds: ["lead-1", "lead-2"], status: "PENDING" }])
      .mockResolvedValueOnce([
        { id: "lead-1", name: "A", email: "a@x.com" },
        { id: "lead-2", name: "B", email: "b@x.com" },
      ]);

    const matches = await listDedupeMatchesForTenant(user, "LEAD");

    expect(matches[0].records).toHaveLength(2);
  });

  it("returns an empty records array without a second query when there are no matches", async () => {
    dbMocks.query.mockResolvedValueOnce([]);
    const matches = await listDedupeMatchesForTenant(user, "LEAD");
    expect(matches).toEqual([]);
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
  });
});

describe("dismissDedupeMatchForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("throws DEDUPE_MATCH_NOT_PENDING when the atomic claim finds no row", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(dismissDedupeMatchForTenant(user, "match-1")).rejects.toThrow("DEDUPE_MATCH_NOT_PENDING");
  });

  it("marks the match DISMISSED", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "match-1", status: "DISMISSED" });
    const match = await dismissDedupeMatchForTenant(user, "match-1");
    expect((match as any).status).toBe("DISMISSED");
  });
});

function mockLeadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    name: "Old Name",
    email: "old@x.com",
    phone: "5551234567",
    company: "Acme",
    source: "WEB",
    status: "NEW",
    ownerId: "user-2",
    tags: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mergeRecordsForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("throws DEDUPE_MATCH_NOT_PENDING when the atomic claim fails", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(mergeRecordsForTenant(user, { matchId: "match-1", survivorId: "lead-1" })).rejects.toThrow("DEDUPE_MATCH_NOT_PENDING");
  });

  it("throws SURVIVOR_NOT_IN_MATCH and reopens the match when the survivor id isn't part of the group", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "match-1", entityType: "LEAD", recordIds: ["lead-1", "lead-2"], status: "MERGED" });
    await expect(mergeRecordsForTenant(user, { matchId: "match-1", survivorId: "lead-999" })).rejects.toThrow("SURVIVOR_NOT_IN_MATCH");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'PENDING'"), expect.arrayContaining(["match-1"]));
  });

  it("throws RECORD_NOT_FOUND and reopens the match when a matched record no longer exists", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "match-1", entityType: "LEAD", recordIds: ["lead-1", "lead-2"], status: "MERGED" })
      .mockResolvedValueOnce(null); // survivor lookup fails
    await expect(mergeRecordsForTenant(user, { matchId: "match-1", survivorId: "lead-1" })).rejects.toThrow("RECORD_NOT_FOUND");
  });

  it("merges two leads: applies survivorship, repoints child rows, records a MergeAudit, and writes an AuditLog", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "match-1", entityType: "LEAD", recordIds: ["lead-1", "lead-2"], status: "MERGED" })
      .mockResolvedValueOnce(mockLeadRow({ id: "lead-1", name: "Survivor Name", updatedAt: "2026-01-01T00:00:00.000Z" })) // survivor
      .mockResolvedValueOnce(mockLeadRow({ id: "lead-2", name: "Loser Name", email: "loser@x.com", updatedAt: "2026-02-01T00:00:00.000Z" })) // loser (newer!)
      .mockResolvedValueOnce(mockLeadRow({ id: "lead-1", name: "Loser Name", email: "loser@x.com" })); // updated survivor returned by the field-write

    dbMocks.query.mockImplementation((sql: string) => {
      // Every repoint UPDATE ... RETURNING id call: simulate one row moved.
      if (sql.startsWith('update "') && sql.includes("returning id") && !sql.includes("LeadListMember") && !sql.includes("RecordScore")) {
        return Promise.resolve([{ id: "child-1" }]);
      }
      if (sql.includes('update "LeadListMember"')) return Promise.resolve([{ id: "member-1" }]);
      if (sql.includes('delete from "LeadListMember"')) return Promise.resolve([]);
      if (sql.includes('update "RecordScore"')) return Promise.resolve([]);
      if (sql.includes('delete from "RecordScore"')) return Promise.resolve([{ id: "score-1" }]); // survivor already had one -- dropped
      if (sql.includes('update "RecordScoreHistory"')) return Promise.resolve([{ id: "history-1" }]);
      return Promise.resolve([]);
    });

    const result = await mergeRecordsForTenant(user, { matchId: "match-1", survivorId: "lead-1" });

    expect(result.mergeAuditId).toBeTruthy();
    // Loser was updated more recently, so its non-null fields win by default survivorship.
    const survivorUpdateCall = dbMocks.queryOne.mock.calls.find((c) => String(c[0]).startsWith('update "Lead" set "name"'));
    expect(survivorUpdateCall?.[1]).toContain("Loser Name");
    expect(survivorUpdateCall?.[1]).toContain("loser@x.com");

    const mergeAuditInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "MergeAudit"'));
    expect(mergeAuditInsert).toBeTruthy();
    const auditParams = mergeAuditInsert![1];
    const loserSnapshot = auditParams[5];
    const survivorBefore = auditParams[6];
    const repointedRows = auditParams[8];
    expect(loserSnapshot.id).toBe("lead-2");
    expect(survivorBefore.id).toBe("lead-1");
    expect(repointedRows.deleted).toEqual(expect.arrayContaining([expect.objectContaining({ table: "RecordScore" })]));

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "MERGE", "LEAD", "lead-1", expect.anything(), expect.anything(), expect.objectContaining({ loserId: "lead-2" }));

    const mergedFlagCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"mergedIntoId" = $1'));
    expect(mergedFlagCall?.[1]).toEqual(["lead-1", expect.any(String), "tenant-a", "lead-2"]);
  });

  it("respects explicit fieldChoices overrides over the default survivorship computation", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "match-1", entityType: "LEAD", recordIds: ["lead-1", "lead-2"], status: "MERGED" })
      .mockResolvedValueOnce(mockLeadRow({ id: "lead-1", name: "Survivor Name", updatedAt: "2026-02-01T00:00:00.000Z" }))
      .mockResolvedValueOnce(mockLeadRow({ id: "lead-2", name: "Loser Name", updatedAt: "2026-01-01T00:00:00.000Z" }))
      .mockResolvedValueOnce(mockLeadRow({ id: "lead-1", name: "Explicitly Chosen Name" }));
    dbMocks.query.mockResolvedValue([]);

    await mergeRecordsForTenant(user, { matchId: "match-1", survivorId: "lead-1", fieldChoices: { name: "Explicitly Chosen Name" } });

    const survivorUpdateCall = dbMocks.queryOne.mock.calls.find((c) => String(c[0]).startsWith('update "Lead" set "name"'));
    expect(survivorUpdateCall?.[1]).toContain("Explicitly Chosen Name");
  });
});

describe("unmergeForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("throws MERGE_AUDIT_NOT_FOUND when the audit row doesn't exist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(unmergeForTenant(user, "audit-1")).rejects.toThrow("MERGE_AUDIT_NOT_FOUND");
  });

  it("throws ALREADY_UNMERGED when this merge was already undone", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "audit-1", unmergedAt: "2026-01-01T00:00:00.000Z" });
    await expect(unmergeForTenant(user, "audit-1")).rejects.toThrow("ALREADY_UNMERGED");
  });

  it("restores the loser, restores the survivor's pre-merge fields, and reverses every repointed child row -- reporting what's not recoverable", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "audit-1",
      entityType: "LEAD",
      survivorId: "lead-1",
      loserId: "lead-2",
      unmergedAt: null,
      survivorSnapshotBefore: mockLeadRow({ id: "lead-1", name: "Survivor Name" }),
      repointedRows: {
        repointed: [{ table: "Activity", column: "leadId", ids: ["activity-1", "activity-2"] }],
        deleted: [{ table: "RecordScore", column: "recordId", ids: ["score-1"] }],
      },
    });

    const result = await unmergeForTenant(user, "audit-1");

    expect(result.reversed).toHaveLength(1);
    expect(result.notRecoverable).toHaveLength(1);
    expect(result.notRecoverable[0].table).toBe("RecordScore");

    const restoreLoserCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"mergedIntoId" = null'));
    expect(restoreLoserCall?.[1]).toEqual(expect.arrayContaining(["lead-2"]));

    const reverseActivityCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('update "Activity" set "leadId"'));
    expect(reverseActivityCall?.[1]).toEqual(["lead-2", "tenant-a", ["activity-1", "activity-2"]]);

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "UNMERGE", "LEAD", "lead-1", null, null, expect.objectContaining({ loserId: "lead-2" }));
  });
});

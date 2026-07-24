import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FixtureDb } from "./helpers/supabase-mock";

const fixture = vi.hoisted(() => ({ db: {} as FixtureDb }));

function setFixtureDb(db: FixtureDb) {
  fixture.db = db;
}

function getActiveDb() {
  return fixture.db;
}

function rows(table: string) {
  fixture.db[table] = fixture.db[table] ?? [];
  return fixture.db[table];
}

function assignDynamicUpdate(sql: string, target: Record<string, any>, params: any[]) {
  const setClause = sql.match(/set\s+([\s\S]+?)\s+where/i)?.[1] ?? "";
  const columns = [...setClause.matchAll(/"([^"]+)"\s*=\s*\$\d+/g)].map((match) => match[1]);
  columns.forEach((column, index) => {
    target[column] = params[index];
  });
}

vi.mock("@/lib/db/query", () => ({
  query: async (sql: string, params: any[] = []) => {
    if (sql.includes('insert into "ScoringTrainingRun"')) {
      rows("ScoringTrainingRun").push({
        id: params[0],
        tenantId: params[1],
        targetModule: params[2],
        status: "RUNNING",
        startedAt: params[3],
        createdBy: params[4],
        createdAt: params[3],
      });
      return [];
    }
    if (sql.includes('from "Lead"')) {
      return rows("Lead").filter((row) => row.tenantId === params[0] && row.createdAt >= params[1]);
    }
    if (sql.includes('from "Opportunity"')) {
      return rows("Opportunity").filter((row) => row.tenantId === params[0] && row.createdAt >= params[1]);
    }
    if (sql.includes('from "StageDefinition"')) {
      return rows("StageDefinition").filter((row) => !row.tenantId || row.tenantId === params[0]);
    }
    if (sql.includes('from "Activity"')) {
      return rows("Activity").filter((row) => row.tenantId === params[0] && row.createdAt >= params[1]);
    }
    if (sql.includes('from "Task"')) {
      return rows("Task").filter((row) => row.tenantId === params[0] && row.createdAt >= params[1]);
    }
    if (sql.includes('update "Lead" set score')) {
      const row = rows("Lead").find((lead) => lead.tenantId === params[2] && lead.id === params[3]);
      if (row) Object.assign(row, { score: params[0], updatedAt: params[1] });
      return [];
    }
    if (sql.includes('update "ScoringTrainingRun"') && sql.includes("COMPLETED")) {
      const row = rows("ScoringTrainingRun").find((run) => run.tenantId === params[4] && run.id === params[5]);
      if (row) {
        Object.assign(row, {
          status: "COMPLETED",
          completedAt: params[0],
          recordsProcessed: params[1],
          recordsSkipped: params[2],
          metrics: params[3],
        });
      }
      return [];
    }
    if (sql.includes('update "ScoringTrainingRun"') && sql.includes("FAILED")) {
      const row = rows("ScoringTrainingRun").find((run) => run.tenantId === params[2] && run.id === params[3]);
      if (row) Object.assign(row, { status: "FAILED", completedAt: params[0], error: params[1] });
      return [];
    }
    if (sql.includes('update "ScoringSettings" set "lastRecomputedAt"')) {
      const row = rows("ScoringSettings").find((settings) => settings.tenantId === params[1]);
      if (row) Object.assign(row, { lastRecomputedAt: params[0], updatedAt: params[0] });
      return [];
    }
    if (sql.includes('update "RecordScore"')) {
      const row = rows("RecordScore").find((score) => score.tenantId === params[12] && score.id === params[13]);
      if (row) {
        Object.assign(row, {
          fitScore: params[0],
          engagementScore: params[1],
          conversionProbability: params[2],
          winProbability: params[3],
          stallRisk: params[4],
          scoreBand: params[5],
          confidence: params[6],
          reasons: params[7],
          source: params[8],
          featureSnapshotId: params[9],
          calculatedAt: params[10],
          updatedAt: params[11],
        });
      }
      return [];
    }
    if (sql.includes('insert into "RecordScore"')) {
      rows("RecordScore").push({
        id: params[0],
        tenantId: params[1],
        recordType: params[2],
        recordId: params[3],
        fitScore: params[4],
        engagementScore: params[5],
        conversionProbability: params[6],
        winProbability: params[7],
        stallRisk: params[8],
        scoreBand: params[9],
        confidence: params[10],
        reasons: params[11],
        source: params[12],
        featureSnapshotId: params[13],
        calculatedAt: params[14],
        updatedAt: params[14],
        createdAt: params[14],
      });
      return [];
    }
    if (sql.includes('insert into "RecordScoreHistory"')) {
      rows("RecordScoreHistory").push({
        id: params[0],
        tenantId: params[1],
        recordScoreId: params[2],
        recordType: params[3],
        recordId: params[4],
        previousScore: params[5],
        nextScore: params[6],
        changeReason: "RECOMPUTE",
        createdAt: params[7],
      });
      return [];
    }
    return [];
  },
  queryOne: async (sql: string, params: any[] = []) => {
    if (sql.includes('from "ScoringSettings"')) {
      return rows("ScoringSettings").find((row) => row.tenantId === params[0]) ?? null;
    }
    if (sql.includes('insert into "ScoringSettings"')) {
      const row = {
        id: params[0],
        tenantId: params[1],
        isEnabled: params[2],
        targetModules: params[3],
        objective: params[4],
        minimumHistoricalRecords: params[5],
        lookbackDays: params[6],
        retrainCadence: params[7],
        fallbackMode: params[8],
        promotedLeadModelVersionId: params[9],
        promotedOpportunityModelVersionId: params[10],
        lastRecomputedAt: params[11],
        updatedBy: params[12],
        createdAt: params[13],
        updatedAt: params[13],
      };
      rows("ScoringSettings").push(row);
      return row;
    }
    if (sql.includes('update "ScoringSettings"')) {
      const tenantId = params.at(-1);
      const row = rows("ScoringSettings").find((settings) => settings.tenantId === tenantId);
      if (!row) return null;
      assignDynamicUpdate(sql, row, params);
      return row;
    }
    if (sql.includes('insert into "ScoringFeatureSnapshot"')) {
      const row = {
        id: params[0],
        tenantId: params[1],
        recordType: params[2],
        recordId: params[3],
        features: params[4],
        sourceDataUpdatedAt: params[5],
        createdAt: params[6],
      };
      rows("ScoringFeatureSnapshot").push(row);
      return { id: row.id };
    }
    if (sql.includes('from "RecordScore"')) {
      return rows("RecordScore").find((row) => row.tenantId === params[0] && row.recordType === params[1] && row.recordId === params[2]) ?? null;
    }
    return null;
  },
  execute: async () => ({ rowCount: 0 }),
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

import {
  buildLeadFeatureSnapshot,
  buildOpportunityFeatureSnapshot,
  calculateCalibration,
  getScoringSettingsForTenant,
  recomputeSelfLearningScoresForTenant,
  updateScoringSettingsForTenant,
} from "@/lib/server/self-learning-scoring";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT, role: { permissions: { recordAccess: "ALL" } } };

beforeEach(() => {
  setFixtureDb({});
});

describe("Predictive scoring", () => {
  it("creates default tenant settings on first read", async () => {
    const settings = await getScoringSettingsForTenant(adminUser);

    expect(settings.isEnabled).toBe(false);
    expect(settings.targetModules).toEqual(["LEAD", "OPPORTUNITY"]);
    expect(getActiveDb().ScoringSettings).toHaveLength(1);
  });

  it("updates tenant scoring settings", async () => {
    await getScoringSettingsForTenant(adminUser);

    const settings = await updateScoringSettingsForTenant(adminUser, {
      isEnabled: true,
      targetModules: ["LEAD"],
      minimumHistoricalRecords: 3,
    });

    expect(settings.isEnabled).toBe(true);
    expect(settings.targetModules).toEqual(["LEAD"]);
    expect(settings.minimumHistoricalRecords).toBe(3);
  });

  it("calculates calibration rates from historic outcomes", () => {
    const calibration = calculateCalibration({
      leads: [
        { id: "lead-1", source: "Website", status: "NEW" },
        { id: "lead-2", source: "Website", status: "NEW" },
        { id: "lead-3", source: "Partner", status: "NEW" },
      ],
      opportunities: [
        { id: "opp-1", leadId: "lead-1", stageId: "won", priority: "HIGH" },
        { id: "opp-2", leadId: "lead-2", stageId: "lost", priority: "LOW" },
      ],
      stages: [
        { id: "won", name: "Closed Won" },
        { id: "lost", name: "Closed Lost" },
      ],
    });

    expect(calibration.leadOverallConversionRate).toBeCloseTo(2 / 3);
    expect(calibration.leadSourceConversionRates.get("WEBSITE")).toBe(1);
    expect(calibration.opportunityOverallWinRate).toBeCloseTo(0.5);
    expect(calibration.opportunityStageWinRates.get("WON")).toBe(1);
  });

  it("builds feature snapshots for sparse leads and opportunities", () => {
    const leadSnapshot = buildLeadFeatureSnapshot({
      lead: { id: "lead-1", source: "Website", status: "NEW", createdAt: "2026-01-01T00:00:00.000Z" },
      opportunities: [],
      activities: [],
      tasks: [{ id: "task-1", status: "OPEN", dueAt: "2026-01-02T00:00:00.000Z" }],
      now: new Date("2026-01-03T00:00:00.000Z"),
    });
    const opportunitySnapshot = buildOpportunityFeatureSnapshot({
      opportunity: { id: "opp-1", stageId: "stage-1", priority: "HIGH", amount: 500000, createdAt: "2026-01-01T00:00:00.000Z" },
      activities: [],
      tasks: [],
      stage: { id: "stage-1", name: "Negotiation" },
      now: new Date("2026-01-03T00:00:00.000Z"),
    });

    expect(leadSnapshot.features.overdueTaskCount).toBe(1);
    expect(leadSnapshot.features.activityCount).toBe(0);
    expect(opportunitySnapshot.features.valueBand).toBe("MID_MARKET");
    expect(opportunitySnapshot.features.stageName).toBe("Negotiation");
  });

  it("recomputes scores, stores snapshots/history, and updates Lead.score when enabled", async () => {
    setFixtureDb({
      ScoringSettings: [
        {
          id: "settings-1",
          tenantId: TENANT,
          isEnabled: true,
          targetModules: ["LEAD", "OPPORTUNITY"],
          objective: "CONVERSION",
          minimumHistoricalRecords: 2,
          lookbackDays: 365,
          retrainCadence: "MANUAL",
          fallbackMode: "RULE_SCORE",
        },
      ],
      Lead: [
        { id: "lead-1", tenantId: TENANT, email: "hot@example.com", phone: "999", company: "Acme", source: "Website", status: "NEW", score: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "lead-2", tenantId: TENANT, email: null, phone: null, company: null, source: "Partner", status: "NEW", score: 0, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
      ],
      Opportunity: [
        { id: "opp-1", tenantId: TENANT, leadId: "lead-1", stageId: "won", title: "Won deal", amount: 500000, priority: "HIGH", createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" },
      ],
      StageDefinition: [{ id: "won", name: "Closed Won" }],
      Activity: [
        { id: "act-1", tenantId: TENANT, leadId: "lead-1", opportunityId: "opp-1", createdAt: "2026-01-03T01:00:00.000Z", updatedAt: "2026-01-03T01:00:00.000Z" },
      ],
      Task: [
        { id: "task-1", tenantId: TENANT, leadId: "lead-1", opportunityId: "opp-1", status: "COMPLETED", dueAt: "2026-01-03T00:00:00.000Z", createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" },
      ],
    });

    const result = await recomputeSelfLearningScoresForTenant(adminUser);

    expect(result.processed).toBe(3);
    expect(getActiveDb().ScoringFeatureSnapshot).toHaveLength(3);
    expect(getActiveDb().RecordScore).toHaveLength(3);
    expect(getActiveDb().RecordScoreHistory).toHaveLength(3);
    expect(getActiveDb().Lead[0].score).toBeGreaterThan(0);
    expect(getActiveDb().ScoringTrainingRun[0].status).toBe("COMPLETED");
  });

  it("handles an empty tenant without failing", async () => {
    setFixtureDb({
      ScoringSettings: [
        {
          id: "settings-empty",
          tenantId: TENANT,
          isEnabled: true,
          targetModules: ["LEAD", "OPPORTUNITY"],
          objective: "CONVERSION",
          minimumHistoricalRecords: 10,
          lookbackDays: 365,
          retrainCadence: "MANUAL",
          fallbackMode: "RULE_SCORE",
        },
      ],
      Lead: [],
      Opportunity: [],
      StageDefinition: [],
      Activity: [],
      Task: [],
    });

    const result = await recomputeSelfLearningScoresForTenant(adminUser);

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(getActiveDb().ScoringTrainingRun[0].status).toBe("COMPLETED");
  });

  it("falls back to rule score when history is insufficient", async () => {
    setFixtureDb({
      ScoringSettings: [
        {
          id: "settings-fallback",
          tenantId: TENANT,
          isEnabled: true,
          targetModules: ["LEAD"],
          objective: "CONVERSION",
          minimumHistoricalRecords: 100,
          lookbackDays: 365,
          retrainCadence: "MANUAL",
          fallbackMode: "RULE_SCORE",
        },
      ],
      Lead: [
        { id: "lead-1", tenantId: TENANT, email: null, phone: null, company: null, source: "Manual", status: "NEW", score: 37, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      Opportunity: [],
      StageDefinition: [],
      Activity: [],
      Task: [],
    });

    await recomputeSelfLearningScoresForTenant(adminUser);

    expect(getActiveDb().RecordScore[0].source).toBe("RULE_FALLBACK");
    expect(getActiveDb().RecordScore[0].conversionProbability).toBe(37);
  });

  it("extracts safe features for records with missing owner, no activity, and partial opportunity data", () => {
    const leadSnapshot = buildLeadFeatureSnapshot({
      lead: { id: "lead-missing", source: null, status: null, ownerId: null, createdAt: null, updatedAt: null },
      opportunities: [],
      activities: [],
      tasks: [],
      now: new Date("2026-07-08T00:00:00.000Z"),
    });
    const opportunitySnapshot = buildOpportunityFeatureSnapshot({
      opportunity: { id: "opp-partial", stageId: null, ownerId: null, amount: null, priority: null, createdAt: null, updatedAt: null },
      activities: [],
      tasks: [],
      stage: null,
      now: new Date("2026-07-08T00:00:00.000Z"),
    });

    expect(leadSnapshot.features.ownerId).toBeNull();
    expect(leadSnapshot.features.activityCount).toBe(0);
    expect(leadSnapshot.features.lastActivityAgeDays).toBeNull();
    expect(opportunitySnapshot.features.ownerId).toBeNull();
    expect(opportunitySnapshot.features.valueBand).toBe("UNKNOWN");
    expect(opportunitySnapshot.features.stageName).toBe("UNKNOWN");
  });
});

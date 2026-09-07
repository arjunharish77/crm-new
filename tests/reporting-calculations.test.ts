import { describe, expect, it } from "vitest";

import {
  calculateActivityCallVolumeTrendReport,
  calculateCohortReport,
  calculateDataQualityReport,
  calculateFunnelExplorerReport,
  calculatePeriodComparisonReport,
  calculateReassignmentImpactReport,
  calculateTelephonyCallPerformanceReport,
  detectAnomalyFromDailySeries,
  fillDailySeries,
  projectLinearTrend,
} from "@/lib/server/inbuilt-reports";

const NOW = new Date("2026-07-07T12:00:00.000Z");

describe("reporting calculations", () => {
  it("handles empty activity ranges without fabricating buckets", () => {
    const report = calculateActivityCallVolumeTrendReport([], "day", "2026-07-01", "2026-07-07", NOW);
    expect(report.rows).toEqual([]);
  });

  it("buckets activity volume into partial periods and counts calls/overdue rows", () => {
    const report = calculateActivityCallVolumeTrendReport(
      [
        { id: "a1", createdAt: "2026-07-01T10:00:00.000Z", type: { name: "Call" }, dueAt: "2026-07-02T10:00:00.000Z", completedAt: null },
        { id: "a2", createdAt: "2026-07-03T10:00:00.000Z", type: { name: "Email" }, completedAt: "2026-07-03T11:00:00.000Z" },
        { id: "a3", createdAt: "2026-08-01T10:00:00.000Z", type: { name: "Call" } },
      ],
      "month",
      "2026-07-01",
      "2026-07-31",
      NOW
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ activities: 2, calls: 1, completed: 1, overdue: 1 });
    expect(report.rows[0].byType).toEqual({ Call: 1, Email: 1 });
  });

  it("keeps leads with no activity in the reassignment baseline and marks response breaches", () => {
    const report = calculateReassignmentImpactReport(
      [
        { id: "l1", createdAt: "2026-07-01T00:00:00.000Z" },
        { id: "l2", createdAt: "2026-07-01T00:00:00.000Z" },
      ],
      [{ id: "o1", leadId: "l2", stage: { isWon: true } }],
      [{ id: "a1", leadId: "l2", createdAt: "2026-07-01T01:00:00.000Z" }],
      [
        { entityType: "LEAD", entityId: "l2" },
        { entityType: "LEAD", entityId: "l2" },
      ],
      24,
      NOW
    );

    expect(report.rows.find((row) => row.bucket === "Never or initial assignment")).toMatchObject({
      leads: 1,
      responseBreaches: 1,
    });
    expect(report.rows.find((row) => row.bucket === "Reassigned once")).toMatchObject({
      leads: 1,
      opportunities: 1,
      wonOpportunities: 1,
      responseBreaches: 0,
    });
  });

  it("counts cohort stage reach once per lead and preserves empty later cohorts", () => {
    const report = calculateCohortReport(
      [
        { id: "l1", createdAt: "2026-01-03T00:00:00.000Z" },
        { id: "l2", createdAt: "2026-02-03T00:00:00.000Z" },
      ],
      [{ id: "o1", leadId: "l1", stageId: "won", createdAt: "2026-01-04T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z" }],
      [
        { opportunityId: "o1", toStageId: "new", changedAt: "2026-01-04T00:00:00.000Z" },
        { opportunityId: "o1", toStageId: "won", changedAt: "2026-01-10T00:00:00.000Z" },
      ],
      [{ stages: [{ id: "new", name: "New", order: 1 }, { id: "won", name: "Won", order: 2 }] }],
      "month",
      NOW
    );

    expect(report.rows).toHaveLength(2);
    expect(report.dimension).toBe("CREATED_DATE");
    expect(report.rows[0].leads).toBe(1);
    expect(report.rows[0].opportunities).toBe(1);
    expect(report.rows[0].cohortStart).not.toBeNull();
    expect(report.rows[0].stages.map((stage) => stage.leadsReached)).toEqual([1, 1]);
    expect(report.rows[1].leads).toBe(1);
    expect(report.rows[1].opportunities).toBe(0);
    expect(report.rows[1].stages.map((stage) => stage.leadsReached)).toEqual([0, 0]);
  });

  it("buckets a cohort by a non-date dimension (gap checklist Module 17, item 11), sorted by lead count", () => {
    const report = calculateCohortReport(
      [
        { id: "l1", createdAt: "2026-01-03T00:00:00.000Z" },
        { id: "l2", createdAt: "2026-01-05T00:00:00.000Z" },
        { id: "l3", createdAt: "2026-02-01T00:00:00.000Z" },
      ],
      [{ id: "o1", leadId: "l1", stageId: "won", createdAt: "2026-01-04T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z" }],
      [{ opportunityId: "o1", toStageId: "won", changedAt: "2026-01-10T00:00:00.000Z" }],
      [{ stages: [{ id: "won", name: "Won", order: 1 }] }],
      "month",
      NOW,
      "SOURCE",
      new Map([
        ["l1", "google"],
        ["l2", "google"],
        ["l3", "referral"],
      ])
    );

    expect(report.dimension).toBe("SOURCE");
    // No natural date range for a dimension cohort -- cohortStart/cohortEnd stay null, and the
    // label carries the dimension value instead.
    expect(report.rows.map((row) => ({ label: row.cohortLabel, leads: row.leads, start: row.cohortStart }))).toEqual([
      { label: "google", leads: 2, start: null },
      { label: "referral", leads: 1, start: null },
    ]);
    expect(report.rows[0].stages[0].leadsReached).toBe(1);
  });

  it("computes stage aging, drop-off reasons, re-entry, and segment comparison (gap checklist Module 17, item 12)", () => {
    const stageNew = { id: "new", name: "New", order: 1, isWon: false, isClosed: false };
    const stageWon = { id: "won", name: "Won", order: 2, isWon: true, isClosed: true };
    const stageLost = { id: "lost", name: "Lost", order: 3, isWon: false, isClosed: true };

    const report = calculateFunnelExplorerReport(
      [
        { id: "o1", createdAt: "2026-07-01T12:00:00.000Z", stage: stageNew },
        { id: "o2", createdAt: "2026-06-01T00:00:00.000Z", stage: stageWon },
        { id: "o3", createdAt: "2026-06-15T00:00:00.000Z", stage: stageLost },
        { id: "o4", createdAt: "2026-06-20T00:00:00.000Z", stage: stageNew },
      ],
      [
        { opportunityId: "o4", toStageId: "new", changedAt: "2026-06-21T00:00:00.000Z" },
        { opportunityId: "o4", toStageId: "won", changedAt: "2026-06-25T00:00:00.000Z" },
        { opportunityId: "o4", toStageId: "new", changedAt: "2026-07-05T12:00:00.000Z" },
      ],
      new Map([["o3", "Budget cut"]]),
      new Map([
        ["o1", "google"],
        ["o2", "referral"],
        ["o3", "google"],
        ["o4", "google"],
      ]),
      "SOURCE",
      NOW
    );

    expect(report.segmentDimension).toBe("SOURCE");
    // o1 has no stage history -- aging falls back to createdAt (6 days before NOW). o4's last
    // entry into "new" was 2 days before NOW -- the re-entry, not its original 2026-06-20 entry.
    expect(report.stageAging).toEqual([{ stageId: "new", stageName: "New", order: 1, openCount: 2, avgDaysInStage: 4, maxDaysInStage: 6 }]);
    expect(report.dropOff).toEqual([{ stageId: "lost", stageName: "Lost", order: 3, lostCount: 1, topReasons: [{ reason: "Budget cut", count: 1 }] }]);
    // Only o4 revisits a stage ("new") already present earlier in its own history.
    expect(report.reEntryCount).toBe(1);
    expect(report.segments).toEqual([
      { segment: "google", totalOpportunities: 3, wonCount: 0, wonRate: 0 },
      { segment: "referral", totalOpportunities: 1, wonCount: 1, wonRate: 1 },
    ]);
  });

  it("compares two arbitrary date ranges' leads/opportunities/win-rate with percent change (gap checklist Module 17, item 8 -- period comparison)", () => {
    const stageWon = { isWon: true };
    const stageOpen = { isWon: false };

    const report = calculatePeriodComparisonReport(
      [
        { createdAt: "2026-06-15T00:00:00.000Z" },
        { createdAt: "2026-06-20T00:00:00.000Z" },
        { createdAt: "2026-07-03T00:00:00.000Z" },
      ],
      [
        { createdAt: "2026-06-10T00:00:00.000Z", amount: 1000, stage: stageWon },
        { createdAt: "2026-06-12T00:00:00.000Z", amount: 500, stage: stageOpen },
        { createdAt: "2026-07-02T00:00:00.000Z", amount: 2000, stage: stageWon },
      ],
      { start: new Date("2026-07-01T00:00:00.000Z"), end: NOW },
      { start: new Date("2026-06-01T00:00:00.000Z"), end: new Date("2026-07-01T00:00:00.000Z") },
      NOW
    );

    expect(report.current).toMatchObject({ leadsCreated: 1, opportunitiesCreated: 1, opportunitiesWon: 1, wonValue: 2000, winRate: 1 });
    expect(report.previous).toMatchObject({ leadsCreated: 2, opportunitiesCreated: 2, opportunitiesWon: 1, wonValue: 1000, winRate: 0.5 });
    expect(report.percentChange).toEqual({
      leadsCreated: -50,
      opportunitiesCreated: -50,
      opportunitiesWon: 0,
      wonValue: 100,
      winRate: 100,
    });
  });

  it("returns null percent change (not a fabricated or infinite rate) when the previous period's value was zero", () => {
    const report = calculatePeriodComparisonReport(
      [{ createdAt: "2026-07-03T00:00:00.000Z" }],
      [],
      { start: new Date("2026-07-01T00:00:00.000Z"), end: NOW },
      { start: new Date("2026-06-01T00:00:00.000Z"), end: new Date("2026-07-01T00:00:00.000Z") },
      NOW
    );

    expect(report.previous).toMatchObject({ leadsCreated: 0, opportunitiesCreated: 0, winRate: null });
    expect(report.percentChange).toEqual({
      leadsCreated: null,
      opportunitiesCreated: null,
      opportunitiesWon: null,
      wonValue: null,
      winRate: null,
    });
  });

  it("reports stale, missing-required, and duplicate lead quality issues", () => {
    const report = calculateDataQualityReport(
      [
        { id: "l1", name: "", email: "same@example.com", phone: "555-111-2222", ownerId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "l2", name: "Lead 2", email: "SAME@example.com", phone: "5551112222", ownerId: "u1", updatedAt: "2026-07-06T00:00:00.000Z" },
      ],
      [{ id: "a1", leadId: "l2", createdAt: "2026-07-06T00:00:00.000Z" }],
      [{ id: "required-field" }],
      [{ entityId: "l2", fieldDefinitionId: "required-field", value: "ok" }],
      30,
      NOW
    );

    expect(report.totals).toMatchObject({
      totalLeads: 2,
      duplicateEmailGroups: 1,
      duplicatePhoneGroups: 1,
      duplicateLeads: 2,
      staleLeads: 1,
      missingRequiredFieldLeads: 1,
      missingOwner: 1,
    });
  });

  it("flags invalid UTM combinations, SLA breach counts, and stage-required-field gaps", () => {
    const report = calculateDataQualityReport(
      [{ id: "l1", name: "Lead 1", email: "lead1@example.com", phone: "5551110000", ownerId: "u1", updatedAt: NOW.toISOString() }],
      [],
      [],
      [],
      30,
      NOW,
      {
        attributionTouches: [
          { id: "touch-1", source: null, medium: "cpc", campaign: null },
          { id: "touch-2", source: null, medium: null, campaign: "spring-sale" },
          { id: "touch-3", source: "google", medium: "cpc", campaign: "spring-sale" },
        ],
        slaBreachCount: 4,
        opportunities: [
          { id: "opp-first-stage", stageId: "stage-0", amount: null },
          { id: "opp-later-stage-missing-amount", stageId: "stage-1", amount: null },
          { id: "opp-later-stage-has-amount", stageId: "stage-1", amount: 5000 },
        ],
        opportunityTypes: [
          {
            id: "type-1",
            stages: [
              { id: "stage-0", order: 0 },
              { id: "stage-1", order: 1 },
            ],
          },
        ],
      }
    );

    expect(report.totals.invalidUtmTouches).toBe(2);
    expect(report.totals.slaBreaches).toBe(4);
    expect(report.totals.opportunitiesMissingStageRequiredFields).toBe(1);

    const utmIssue = report.issues.find((item) => item.type === "invalid_utm_combination");
    expect(utmIssue?.sampleLeadIds).toEqual(["touch-1", "touch-2"]);

    const stageIssue = report.issues.find((item) => item.type === "stage_required_fields");
    expect(stageIssue?.sampleLeadIds).toEqual(["opp-later-stage-missing-amount"]);
  });

  it("computes telephony call performance totals, answer rate, and per-agent talk time", () => {
    const report = calculateTelephonyCallPerformanceReport(
      [
        { id: "log-1", provider: "twilio", direction: "OUTBOUND", status: "completed", duration: 120, agentId: "agent-1" },
        { id: "log-2", provider: "twilio", direction: "OUTBOUND", status: "completed", duration: 60, agentId: "agent-1" },
        { id: "log-3", provider: "twilio", direction: "INBOUND", status: "missed", duration: null, agentId: "agent-2" },
        { id: "log-4", provider: "twilio", direction: "OUTBOUND", status: "failed", duration: null, agentId: "agent-2" },
        { id: "log-5", provider: "click-to-call", direction: "OUTBOUND", status: "dialing", duration: null, agentId: "agent-1" },
      ],
      [
        { id: "agent-1", name: "Rep One", email: "rep1@example.com" },
        { id: "agent-2", name: "Rep Two", email: "rep2@example.com" },
      ],
      NOW,
    );

    expect(report.totals).toMatchObject({
      totalCalls: 5,
      inbound: 1,
      outbound: 4,
      answered: 2,
      missed: 1,
      failed: 1,
      voicemail: 0,
      inProgressOrUnknown: 1,
      answerRate: 50, // 2 answered / 4 terminal calls (dialing excluded as non-terminal)
      avgDurationSeconds: 90, // (120 + 60) / 2
      totalTalkTimeSeconds: 180,
    });

    const agent1 = report.byAgent.find((row) => row.agentId === "agent-1");
    expect(agent1).toMatchObject({ agentName: "Rep One", totalCalls: 3, answered: 2, avgDurationSeconds: 90 });

    const agent2 = report.byAgent.find((row) => row.agentId === "agent-2");
    expect(agent2).toMatchObject({ agentName: "Rep Two", totalCalls: 2, answered: 0, avgDurationSeconds: 0 });

    expect(report.byProvider).toEqual(
      expect.arrayContaining([
        { provider: "twilio", count: 4 },
        { provider: "click-to-call", count: 1 },
      ]),
    );
  });

  it("handles an empty call log set without dividing by zero", () => {
    const report = calculateTelephonyCallPerformanceReport([], [], NOW);
    expect(report.totals).toMatchObject({ totalCalls: 0, answerRate: 0, avgDurationSeconds: 0 });
    expect(report.byAgent).toEqual([]);
  });

  it("labels calls with no agentId as Unassigned rather than dropping them", () => {
    const report = calculateTelephonyCallPerformanceReport(
      [{ id: "log-1", provider: "twilio", direction: "INBOUND", status: "completed", duration: 30, agentId: null }],
      [],
      NOW,
    );
    expect(report.byAgent).toEqual([
      { agentId: null, agentName: "Unassigned", totalCalls: 1, answered: 1, answerRate: 100, avgDurationSeconds: 30 },
    ]);
  });

  // Gap checklist Module 17, item 9 (anomaly detection). All 7 domains share this one
  // rolling-average ± standard-deviation baseline/threshold method.
  describe("anomaly detection (gap checklist Module 17, item 9)", () => {
    it("flags a spike when the latest value is far above a stable baseline", () => {
      const series = [
        ...Array.from({ length: 14 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, value: 10 })),
        { date: "2026-01-15", value: 100 },
      ];
      const result = detectAnomalyFromDailySeries("LEAD_VOLUME", series);
      expect(result.isAnomaly).toBe(true);
      expect(result.direction).toBe("SPIKE");
      expect(result.baselineMean).toBe(10);
      expect(result.baselineStdDev).toBe(0);
    });

    it("flags a drop when the latest value is far below a stable baseline", () => {
      const series = [
        ...Array.from({ length: 14 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, value: 20 })),
        { date: "2026-01-15", value: 0 },
      ];
      const result = detectAnomalyFromDailySeries("CONVERSIONS", series);
      expect(result.isAnomaly).toBe(true);
      expect(result.direction).toBe("DROP");
    });

    it("does not flag a normal fluctuation within the baseline's spread", () => {
      const series = [
        { date: "2026-01-01", value: 8 }, { date: "2026-01-02", value: 12 }, { date: "2026-01-03", value: 9 },
        { date: "2026-01-04", value: 11 }, { date: "2026-01-05", value: 10 }, { date: "2026-01-06", value: 10 },
      ];
      const result = detectAnomalyFromDailySeries("SLA_BREACHES", series);
      expect(result.isAnomaly).toBe(false);
      expect(result.direction).toBeNull();
    });

    it("does not flag anything with fewer than 3 data points -- not enough history for a baseline", () => {
      const result = detectAnomalyFromDailySeries("PAYOUT_AMOUNT", [{ date: "2026-01-01", value: 5 }, { date: "2026-01-02", value: 500 }]);
      expect(result.isAnomaly).toBe(false);
      expect(result.baselineMean).toBe(0);
    });

    it("does not divide by zero when the baseline has zero variance and the latest value matches it exactly", () => {
      const series = Array.from({ length: 6 }, (_, i) => ({ date: `2026-01-0${i + 1}`, value: 5 }));
      const result = detectAnomalyFromDailySeries("SCORING_DRIFT", series);
      expect(result.isAnomaly).toBe(false);
      expect(result.deviationInStdDevs).toBe(0);
    });

    it("fillDailySeries produces a dense, chronologically-ordered series with 0-filled gaps", () => {
      const now = new Date("2026-01-05T12:00:00.000Z");
      const series = fillDailySeries([{ day: "2026-01-03", value: "7" }, { day: "2026-01-05", value: 3 }], 5, now);
      expect(series).toEqual([
        { date: "2026-01-01", value: 0 },
        { date: "2026-01-02", value: 0 },
        { date: "2026-01-03", value: 7 },
        { date: "2026-01-04", value: 0 },
        { date: "2026-01-05", value: 3 },
      ]);
    });
  });

  // Gap checklist Module 17, item 10 (forecasting-lite). All 4 domains share this one linear
  // regression trend projection, not a simple moving average.
  describe("forecasting-lite (gap checklist Module 17, item 10)", () => {
    const risingHistory = [0, 1, 2, 3, 4].map((value, i) => ({ date: `2026-01-0${i + 1}`, value }));
    const fallingHistory = [10, 8, 6, 4, 2].map((value, i) => ({ date: `2026-01-0${i + 1}`, value }));
    const flatHistory = [5, 5, 5, 5, 5].map((value, i) => ({ date: `2026-01-0${i + 1}`, value }));

    it("projects a rising trend forward", () => {
      const result = projectLinearTrend(risingHistory, 3);
      expect(result.slope).toBe(1);
      expect(result.intercept).toBe(0);
      expect(result.forecast).toEqual([
        { date: "2026-01-06", value: 5 },
        { date: "2026-01-07", value: 6 },
        { date: "2026-01-08", value: 7 },
      ]);
    });

    it("clamps a falling trend's projection to 0 -- never a negative count", () => {
      const result = projectLinearTrend(fallingHistory, 3);
      expect(result.slope).toBe(-2);
      expect(result.forecast.map((point) => point.value)).toEqual([0, 0, 0]);
    });

    it("projects a flat history as a flat continuation", () => {
      const result = projectLinearTrend(flatHistory, 2);
      expect(result.slope).toBe(0);
      expect(result.forecast.map((point) => point.value)).toEqual([5, 5]);
    });

    it("returns no forecast for fewer than 2 history points", () => {
      expect(projectLinearTrend([{ date: "2026-01-01", value: 7 }], 5)).toEqual({ forecast: [], slope: 0, intercept: 7 });
      expect(projectLinearTrend([], 5)).toEqual({ forecast: [], slope: 0, intercept: 0 });
    });
  });
});

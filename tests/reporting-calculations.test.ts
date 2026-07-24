import { describe, expect, it } from "vitest";

import {
  calculateActivityCallVolumeTrendReport,
  calculateCohortReport,
  calculateDataQualityReport,
  calculateReassignmentImpactReport,
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
    expect(report.rows[0].leads).toBe(1);
    expect(report.rows[0].opportunities).toBe(1);
    expect(report.rows[0].stages.map((stage) => stage.leadsReached)).toEqual([1, 1]);
    expect(report.rows[1].leads).toBe(1);
    expect(report.rows[1].opportunities).toBe(0);
    expect(report.rows[1].stages.map((stage) => stage.leadsReached)).toEqual([0, 0]);
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
});

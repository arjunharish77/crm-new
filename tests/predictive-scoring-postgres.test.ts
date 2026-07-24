import { beforeEach, describe, expect, it, vi } from "vitest";

const pgQueryMock = vi.fn();
const pgQueryOneMock = vi.fn();

vi.mock("@/lib/db/access-mode", () => ({
  isPostgresMode: () => true,
}));

vi.mock("@/lib/db/query", () => ({
  query: pgQueryMock,
  queryOne: pgQueryOneMock,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

describe("direct Postgres predictive scoring", () => {
  beforeEach(() => {
    pgQueryMock.mockReset();
    pgQueryOneMock.mockReset();
  });

  it("creates default scoring settings through Postgres on first read", async () => {
    pgQueryOneMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "settings-1",
        tenantId: "tenant-1",
        isEnabled: false,
        targetModules: ["LEAD", "OPPORTUNITY"],
        objective: "CONVERSION",
        minimumHistoricalRecords: 25,
        lookbackDays: 365,
        retrainCadence: "MANUAL",
        fallbackMode: "RULE_SCORE",
      });

    const { getScoringSettingsForTenant } = await import("@/lib/server/self-learning-scoring");
    const settings = await getScoringSettingsForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(settings.targetModules).toEqual(["LEAD", "OPPORTUNITY"]);
    expect(pgQueryOneMock.mock.calls[1][0]).toContain('insert into "ScoringSettings"');
  });

  it("recomputes lead scores and persists score/history through Postgres", async () => {
    pgQueryOneMock
      .mockResolvedValueOnce({
        id: "settings-1",
        tenantId: "tenant-1",
        isEnabled: true,
        targetModules: ["LEAD"],
        objective: "CONVERSION",
        minimumHistoricalRecords: 1,
        lookbackDays: 365,
        retrainCadence: "MANUAL",
        fallbackMode: "RULE_SCORE",
      })
      .mockResolvedValueOnce({ id: "snapshot-1" })
      .mockResolvedValueOnce(null);

    pgQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "lead-1",
          name: "Hot Lead",
          email: "hot@example.com",
          phone: "9999999999",
          company: "Acme",
          status: "NEW",
          source: "Website",
          score: 0,
          ownerId: "rep-1",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { recomputeSelfLearningScoresForTenant } = await import("@/lib/server/self-learning-scoring");
    const result = await recomputeSelfLearningScoresForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(result.processed).toBe(1);
    expect(pgQueryOneMock.mock.calls[1][0]).toContain('insert into "ScoringFeatureSnapshot"');
    expect(pgQueryMock.mock.calls.some((call) => String(call[0]).includes('insert into "RecordScore"'))).toBe(true);
    expect(pgQueryMock.mock.calls.some((call) => String(call[0]).includes('insert into "RecordScoreHistory"'))).toBe(true);
    expect(pgQueryMock.mock.calls.some((call) => String(call[0]).includes('update "Lead" set score'))).toBe(true);
  });
});

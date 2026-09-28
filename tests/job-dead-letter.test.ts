import { beforeEach, describe, expect, it, vi } from "vitest";

// WP10 follow-up (F18 item 4/6): dead-letter tooling -- see migrations/0108_job_dead_letter.sql
// and src/lib/server/job-dead-letter.ts. Same DB-mocking convention as
// tests/platform-admin-stats.test.ts for a real, wired-up data function.
const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  jsonbParam: (v: unknown) => JSON.stringify(v ?? null),
}));
vi.mock("@/lib/db/query", () => dbMocks);

import { recordJobDeadLetter, listRecentJobDeadLetters } from "@/lib/server/job-dead-letter";

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.execute.mockReset();
});

describe("recordJobDeadLetter", () => {
  it("inserts one row with the job's final-attempt details, jsonb-encoding the payload", async () => {
    dbMocks.execute.mockResolvedValue(1);

    await recordJobDeadLetter({
      queueName: "crm-jobs-heavy",
      jobName: "exports.process",
      jobId: "export-123",
      tenantId: "tenant-a",
      payload: { exportRequestId: "export-123", tenantId: "tenant-a" },
      errorMessage: "Storage driver unavailable",
      attemptsMade: 3,
    });

    expect(dbMocks.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = dbMocks.execute.mock.calls[0];
    expect(sql).toContain('insert into "JobDeadLetter"');
    const [, queueName, jobName, jobId, tenantId, payload, errorMessage, attemptsMade] = params;
    expect(queueName).toBe("crm-jobs-heavy");
    expect(jobName).toBe("exports.process");
    expect(jobId).toBe("export-123");
    expect(tenantId).toBe("tenant-a");
    expect(JSON.parse(payload)).toEqual({ exportRequestId: "export-123", tenantId: "tenant-a" });
    expect(errorMessage).toBe("Storage driver unavailable");
    expect(attemptsMade).toBe(3);
  });

  it("stores a null tenantId for a non-tenant-scoped job without erroring", async () => {
    dbMocks.execute.mockResolvedValue(1);

    await recordJobDeadLetter({
      queueName: "crm-jobs-operational",
      jobName: "automation.processDue",
      jobId: "automation.processDue",
      tenantId: null,
      payload: {},
      errorMessage: "boom",
      attemptsMade: 3,
    });

    const [, , , , tenantId] = dbMocks.execute.mock.calls[0][1];
    expect(tenantId).toBeNull();
  });

  it("propagates a DB failure instead of silently swallowing it", async () => {
    dbMocks.execute.mockRejectedValueOnce(new Error("db unreachable"));
    await expect(
      recordJobDeadLetter({
        queueName: "crm-jobs-heavy",
        jobName: "imports.process",
        jobId: "import-1",
        tenantId: "tenant-a",
        payload: {},
        errorMessage: "boom",
        attemptsMade: 3,
      }),
    ).rejects.toThrow("db unreachable");
  });
});

describe("listRecentJobDeadLetters", () => {
  it("lists rows most-recently-failed first with a default limit", async () => {
    dbMocks.query.mockResolvedValue([{ id: "dlq-1", queueName: "crm-jobs-heavy", jobName: "exports.process", jobId: "export-1", tenantId: "tenant-a", payload: {}, errorMessage: "boom", attemptsMade: 3, failedAt: "2026-09-09T00:00:00.000Z" }]);

    const rows = await listRecentJobDeadLetters();

    expect(rows).toHaveLength(1);
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('order by "failedAt" desc');
    expect(params[params.length - 1]).toBe(100);
  });

  it("filters by queueName and tenantId when provided", async () => {
    dbMocks.query.mockResolvedValue([]);

    await listRecentJobDeadLetters({ queueName: "crm-jobs-heavy", tenantId: "tenant-a", limit: 25 });

    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('"queueName" = $1');
    expect(sql).toContain('"tenantId" = $2');
    expect(params).toEqual(["crm-jobs-heavy", "tenant-a", 25]);
  });

  it("clamps an out-of-range limit to the max", async () => {
    dbMocks.query.mockResolvedValue([]);
    await listRecentJobDeadLetters({ limit: 10_000 });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(500);
  });
});

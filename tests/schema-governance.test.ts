import { promises as fs } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { getMigrationStatus } from "@/lib/server/schema-governance";

async function realMigrationFileIds() {
  const files = await fs.readdir(path.join(process.cwd(), "migrations"));
  return files.filter((file) => file.endsWith(".sql")).sort();
}

describe("getMigrationStatus", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
  });

  it("reports the tracking table as missing when the query fails", async () => {
    dbMocks.query.mockRejectedValueOnce(new Error('relation "SchemaMigration" does not exist'));

    const report = await getMigrationStatus();

    expect(report.schemaMigrationTableExists).toBe(false);
    expect(report.totals.applied).toBe(0);
    // Every real migration file on disk should show up as PENDING when there's no tracking data.
    const fileIds = await realMigrationFileIds();
    expect(report.totals.pending).toBe(fileIds.length);
  });

  it("marks every migration file APPLIED when the tracking table says so", async () => {
    const fileIds = await realMigrationFileIds();
    dbMocks.query.mockResolvedValueOnce(
      fileIds.map((id) => ({ id, status: "APPLIED", appliedAt: "2026-01-01T00:00:00.000Z", error: null })),
    );

    const report = await getMigrationStatus();

    expect(report.schemaMigrationTableExists).toBe(true);
    expect(report.totals.applied).toBe(fileIds.length);
    expect(report.totals.pending).toBe(0);
    expect(report.totals.failed).toBe(0);
  });

  it("flags a migration file with no matching applied row as PENDING", async () => {
    const fileIds = await realMigrationFileIds();
    const appliedSubset = fileIds.slice(0, -1); // pretend the newest one hasn't run yet
    dbMocks.query.mockResolvedValueOnce(
      appliedSubset.map((id) => ({ id, status: "APPLIED", appliedAt: "2026-01-01T00:00:00.000Z", error: null })),
    );

    const report = await getMigrationStatus();

    expect(report.totals.pending).toBe(1);
    const pendingEntry = report.entries.find((entry) => entry.status === "PENDING");
    expect(pendingEntry?.id).toBe(fileIds[fileIds.length - 1]);
  });

  it("surfaces a FAILED row with its error message", async () => {
    const fileIds = await realMigrationFileIds();
    dbMocks.query.mockResolvedValueOnce([
      ...fileIds.slice(0, -1).map((id) => ({ id, status: "APPLIED", appliedAt: "2026-01-01T00:00:00.000Z", error: null })),
      { id: fileIds[fileIds.length - 1], status: "FAILED", appliedAt: "2026-01-02T00:00:00.000Z", error: "syntax error" },
    ]);

    const report = await getMigrationStatus();

    expect(report.totals.failed).toBe(1);
    const failedEntry = report.entries.find((entry) => entry.status === "FAILED");
    expect(failedEntry?.error).toBe("syntax error");
  });

  it("keeps a tracked row that has no matching local file instead of dropping it", async () => {
    const fileIds = await realMigrationFileIds();
    dbMocks.query.mockResolvedValueOnce([
      ...fileIds.map((id) => ({ id, status: "APPLIED", appliedAt: "2026-01-01T00:00:00.000Z", error: null })),
      { id: "base:legacy-schema-dump.sql", status: "APPLIED", appliedAt: "2025-01-01T00:00:00.000Z", error: null },
    ]);

    const report = await getMigrationStatus();

    expect(report.entries.some((entry) => entry.id === "base:legacy-schema-dump.sql")).toBe(true);
    expect(report.totals.applied).toBe(fileIds.length + 1);
  });

  it("always returns a boolean schemaMdStale flag without throwing", async () => {
    dbMocks.query.mockResolvedValueOnce([]);
    const report = await getMigrationStatus();
    expect(typeof report.schemaMdStale).toBe("boolean");
  });
});

import { promises as fs } from "fs";
import path from "path";
import { query } from "@/lib/db/query";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");
const SCHEMA_MD_PATH = path.join(process.cwd(), "SCHEMA.md");

export type MigrationStatusEntry = {
  id: string;
  status: "APPLIED" | "FAILED" | "PENDING";
  appliedAt: string | null;
  error: string | null;
};

export type MigrationStatusReport = {
  entries: MigrationStatusEntry[];
  totals: { applied: number; pending: number; failed: number };
  schemaMigrationTableExists: boolean;
  schemaMdStale: boolean;
  schemaMdCheckedAt: string | null;
  newestMigrationFile: string | null;
};

async function listMigrationFiles() {
  try {
    const files = await fs.readdir(MIGRATIONS_DIR);
    return files.filter((file) => file.endsWith(".sql")).sort();
  } catch {
    return [];
  }
}

// Heuristic, not a semantic diff: SCHEMA.md is a manually-regenerated DB dump (confirmed by
// reading 01_SCHEMA_EXPORT_INSTRUCTIONS.md -- there's no automated regeneration), so the
// only cheap, honest signal available is "does a migration file exist that's newer than the
// last time SCHEMA.md was written." A false negative is possible (SCHEMA.md touched without
// content changing) but a false positive isn't -- if this fires, something migrated after
// the last SCHEMA.md export.
async function checkSchemaMdFreshness(migrationFiles: string[]) {
  if (!migrationFiles.length) return { stale: false, newestMigrationFile: null as string | null };
  let schemaMdMtime: number;
  try {
    schemaMdMtime = (await fs.stat(SCHEMA_MD_PATH)).mtimeMs;
  } catch {
    return { stale: true, newestMigrationFile: migrationFiles[migrationFiles.length - 1] };
  }
  let newest: { file: string; mtime: number } | null = null;
  for (const file of migrationFiles) {
    const stat = await fs.stat(path.join(MIGRATIONS_DIR, file)).catch(() => null);
    if (stat && (!newest || stat.mtimeMs > newest.mtime)) newest = { file, mtime: stat.mtimeMs };
  }
  return { stale: !!newest && newest.mtime > schemaMdMtime, newestMigrationFile: newest?.file ?? null };
}

export async function getMigrationStatus(): Promise<MigrationStatusReport> {
  const migrationFiles = await listMigrationFiles();
  const freshness = await checkSchemaMdFreshness(migrationFiles);

  let rows: Array<{ id: string; status: string; appliedAt: string; error: string | null }> = [];
  let schemaMigrationTableExists = true;
  try {
    rows = await query(`select "id", "status", "appliedAt", "error" from "SchemaMigration"`);
  } catch {
    schemaMigrationTableExists = false;
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const entries: MigrationStatusEntry[] = migrationFiles.map((file) => {
    const row = rowById.get(file);
    if (!row) return { id: file, status: "PENDING", appliedAt: null, error: null };
    return { id: file, status: row.status as "APPLIED" | "FAILED", appliedAt: row.appliedAt, error: row.error };
  });

  // Rows recorded in the DB but with no matching local file (e.g. a migration that was
  // later renamed/removed, or the base-schema baseline entry) still matter for a complete
  // picture -- surfaced, not silently dropped.
  const fileIds = new Set(migrationFiles);
  for (const row of rows) {
    if (!fileIds.has(row.id)) {
      entries.push({ id: row.id, status: row.status as "APPLIED" | "FAILED", appliedAt: row.appliedAt, error: row.error });
    }
  }

  const totals = entries.reduce(
    (acc, entry) => {
      if (entry.status === "APPLIED") acc.applied += 1;
      else if (entry.status === "FAILED") acc.failed += 1;
      else acc.pending += 1;
      return acc;
    },
    { applied: 0, pending: 0, failed: 0 },
  );

  return {
    entries,
    totals,
    schemaMigrationTableExists,
    schemaMdStale: freshness.stale,
    schemaMdCheckedAt: new Date().toISOString(),
    newestMigrationFile: freshness.newestMigrationFile,
  };
}

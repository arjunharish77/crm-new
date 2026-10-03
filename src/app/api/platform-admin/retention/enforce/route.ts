import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { previewAllDataRetention, processDueDataRetentionEnforcement } from "@/lib/server/retention";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

const COUNT_KEYS = ["leadsAnonymized", "opportunitiesAnonymized", "activitiesAnonymized", "auditLogsDeleted", "fieldDefinitionsPurged", "marketplaceAppLogsPurged"] as const;
type Counts = Record<(typeof COUNT_KEYS)[number], number>;
const total = (rows: Counts[]) => Object.fromEntries(COUNT_KEYS.map((key) => [key, rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)])) as Counts;

// Preview: what "Enforce now" would change for every tenant with a policy. Changes nothing.
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const tenants = await previewAllDataRetention();
    return NextResponse.json({ tenants, totals: total(tenants) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to preview retention enforcement", error);
  }
}

// Enforce every policy now (the worker otherwise enforces each policy once a day).
export async function POST(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const result = await processDueDataRetentionEnforcement(undefined, { all: true });
    return NextResponse.json({ ...total(result.processed), tenantsProcessed: result.processed.length, tenantsFailed: result.processed.filter((row) => row.failed).length });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to enforce retention policies", error);
  }
}

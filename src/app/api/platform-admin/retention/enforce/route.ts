import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { processDueDataRetentionEnforcement } from "@/lib/server/retention";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const result = await processDueDataRetentionEnforcement();
    const totals = result.processed.reduce(
      (acc, tenant) => ({
        leadsAnonymized: acc.leadsAnonymized + tenant.leadsAnonymized,
        opportunitiesAnonymized: acc.opportunitiesAnonymized + tenant.opportunitiesAnonymized,
        activitiesAnonymized: acc.activitiesAnonymized + tenant.activitiesAnonymized,
        auditLogsDeleted: acc.auditLogsDeleted + tenant.auditLogsDeleted,
        fieldDefinitionsPurged: acc.fieldDefinitionsPurged + tenant.fieldDefinitionsPurged,
      }),
      { leadsAnonymized: 0, opportunitiesAnonymized: 0, activitiesAnonymized: 0, auditLogsDeleted: 0, fieldDefinitionsPurged: 0 },
    );
    return NextResponse.json({ ...totals, tenantsProcessed: result.processed.length });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to enforce retention policies", error);
  }
}

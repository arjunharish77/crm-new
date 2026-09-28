import { NextResponse } from "next/server";
import { getActiveRateLimitViolationSnapshot } from "@/lib/server/rate-limit";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { queryAsSystem } from "@/lib/db/query";

// F23 fix (WP11): /dashboard/admin/rate-limits previously called this exact route and, finding
// it absent, silently displayed 0 for every figure. There is no persistent rate-limit-violation
// log in this app (see getActiveRateLimitViolationSnapshot's own comment), so this returns a
// real, live snapshot of currently-active violation counters -- true data, honestly scoped to
// "right now" rather than a fabricated 24h history the system doesn't actually track.
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const snapshot = await getActiveRateLimitViolationSnapshot();
    const tenantIds = snapshot.byTenant.map((row) => row.tenantId);
    // WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- looks up names for potentially many
    // different tenants surfaced by the Redis-based violation snapshot at once.
    const tenantNames = tenantIds.length
      ? await queryAsSystem<{ id: string; name: string }>(`select id, name from "Tenant" where id = any($1::text[])`, [tenantIds])
      : [];
    const nameById = new Map(tenantNames.map((row) => [row.id, row.name]));

    return NextResponse.json({
      live: true,
      scanned: snapshot.scanned,
      totalActive: snapshot.totalActive,
      byTenant: snapshot.byTenant.map((row) => ({
        tenantId: row.tenantId,
        tenantName: nameById.get(row.tenantId) ?? row.tenantId,
        violationCount: row.violationCount,
      })),
      byCategory: snapshot.byCategory,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch rate limit stats", error);
  }
}

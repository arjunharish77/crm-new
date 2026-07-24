import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { execute, query as dbQuery } from "@/lib/db/query";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const rows = await dbQuery(
      user.tenantId
        ? `select id, title, message, data, "createdAt" from "Notification" where "userId"::text = $1 and "isRead" = false and "tenantId"::text = $2 order by "createdAt" desc limit 20`
        : `select id, title, message, data, "createdAt" from "Notification" where "userId"::text = $1 and "isRead" = false and "tenantId" is null order by "createdAt" desc limit 20`,
      user.tenantId ? [String(user.id), String(user.tenantId)] : [String(user.id)],
    );
    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch notifications", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) return NextResponse.json({ updated: 0 });
    const updated = await execute(
      user.tenantId
        ? `update "Notification" set "isRead" = true, "readAt" = $1 where "userId"::text = $2 and id::text = any($3::text[]) and "tenantId"::text = $4`
        : `update "Notification" set "isRead" = true, "readAt" = $1 where "userId"::text = $2 and id::text = any($3::text[]) and "tenantId" is null`,
      user.tenantId ? [new Date().toISOString(), String(user.id), ids.map(String), String(user.tenantId)] : [new Date().toISOString(), String(user.id), ids.map(String)],
    );
    return NextResponse.json({ updated });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update notifications", error);
  }
}

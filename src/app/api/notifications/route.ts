import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { execute, query as dbQuery } from "@/lib/db/query";
import { serverError, unauthorized } from "@/lib/server/http";

// Unread notifications (the bell). `?status=all` returns read ones too, newest first, for the
// notifications page; `before` (an ISO time) pages back through older ones (UI/UX plan §11.6 M).
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("status") === "all";
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? (all ? 50 : 20)) || 20));
    const before = searchParams.get("before");
    const values: unknown[] = [String(user.id)];
    const clauses = ['"userId"::text = $1'];
    if (user.tenantId) {
      values.push(String(user.tenantId));
      clauses.push(`"tenantId"::text = $${values.length}`);
    } else {
      clauses.push('"tenantId" is null');
    }
    if (!all) clauses.push('"isRead" = false');
    if (before && !Number.isNaN(new Date(before).getTime())) {
      values.push(new Date(before).toISOString());
      clauses.push(`"createdAt" < $${values.length}`);
    }
    values.push(limit);
    const rows = await dbQuery(
      `select id, title, message, data, "isRead", "createdAt" from "Notification" where ${clauses.join(" and ")} order by "createdAt" desc limit $${values.length}`,
      values,
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
    // `read: false` puts notifications back to unread (the Undo after "Mark all as read").
    const read = body?.read !== false;
    const readAt = read ? new Date().toISOString() : null;
    const updated = await execute(
      user.tenantId
        ? `update "Notification" set "isRead" = $5, "readAt" = $1 where "userId"::text = $2 and id::text = any($3::text[]) and "tenantId"::text = $4`
        : `update "Notification" set "isRead" = $4, "readAt" = $1 where "userId"::text = $2 and id::text = any($3::text[]) and "tenantId" is null`,
      user.tenantId ? [readAt, String(user.id), ids.map(String), String(user.tenantId), read] : [readAt, String(user.id), ids.map(String), read],
    );
    return NextResponse.json({ updated });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update notifications", error);
  }
}

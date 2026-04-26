import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const supabase = createSupabaseAdminClient();
    const query = supabase
      .from("Notification")
      .select("id,title,message,data,createdAt")
      .eq("userId", user.id)
      .eq("isRead", false)
      .order("createdAt", { ascending: false })
      .limit(20);
    const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
    const { data, error } = await scopedQuery;
    if (error) throw error;
    return NextResponse.json(data ?? []);
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
    const supabase = createSupabaseAdminClient();
    if (ids.length === 0) return NextResponse.json({ updated: 0 });

    const query = supabase
      .from("Notification")
      .update({ isRead: true, readAt: new Date().toISOString() })
      .eq("userId", user.id)
      .in("id", ids);
    const scopedQuery = user.tenantId ? query.eq("tenantId", user.tenantId) : query.is("tenantId", null);
    const { error } = await scopedQuery;
    if (error) throw error;
    return NextResponse.json({ updated: ids.length });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update notifications", error);
  }
}

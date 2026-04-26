import { NextResponse } from "next/server";
import { createTelephonyCallLogForTenant } from "@/lib/server/crm";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { badRequest, serverError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tenantId = body?.tenantId ? String(body.tenantId) : "";
    if (!tenantId) return badRequest("tenantId is required");
    const supabase = createSupabaseAdminClient();
    const { data: user, error } = await supabase
      .from("User")
      .select("id,name,email,tenantId")
      .eq("tenantId", tenantId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!user?.id) return badRequest("No tenant user found");
    const log = await createTelephonyCallLogForTenant(user, body);
    return NextResponse.json(log);
  } catch (error) {
    return serverError("Failed to ingest telephony webhook", error);
  }
}

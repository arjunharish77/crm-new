import { NextResponse } from "next/server";
import { createLeadForTenant } from "@/lib/server/crm";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { badRequest, serverError } from "@/lib/server/http";

type Params = {
  params: Promise<{ tenantId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const { tenantId } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Lead name is required");

    const supabase = createSupabaseAdminClient();
    const { data: user, error } = await supabase
      .from("User")
      .select("id,name,email,tenantId")
      .eq("tenantId", tenantId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!user?.id) return badRequest("No active tenant user found for inbound capture");

    const lead = await createLeadForTenant(user, { ...body, source: body.source ?? "Inbound Webhook" });
    return NextResponse.json(lead);
  } catch (error) {
    return serverError("Failed to capture inbound lead", error);
  }
}

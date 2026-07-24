import { NextResponse } from "next/server";
import { createLeadForTenant } from "@/lib/server/crm";
import { queryOne } from "@/lib/db/query";
import { badRequest, forbidden, serverError } from "@/lib/server/http";

type Params = {
  params: Promise<{ tenantId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const { tenantId } = await params;
    const url = new URL(request.url);
    const webhookSecret = process.env.WEBHOOK_SIGNING_SECRET;
    const suppliedSecret = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
    if (!webhookSecret) return forbidden("Webhook signing secret is not configured");
    if (suppliedSecret !== webhookSecret) return forbidden("Invalid webhook secret");

    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Lead name is required");

    const user = await queryOne<{ id: string; name: string | null; email: string | null; tenantId: string }>(
      `select id, name, email, "tenantId" from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`,
      [tenantId],
    );
    if (!user?.id) return badRequest("No active tenant user found for inbound capture");

    const lead = await createLeadForTenant(user, { ...body, source: body.source ?? "Inbound Webhook" });
    return NextResponse.json(lead);
  } catch (error) {
    return serverError("Failed to capture inbound lead", error);
  }
}

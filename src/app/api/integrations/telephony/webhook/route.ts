import { NextResponse } from "next/server";
import { createTelephonyCallLogForTenant } from "@/lib/server/crm";
import { queryOne } from "@/lib/db/query";
import { badRequest, forbidden, serverError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const url = new URL(request.url);
    const webhookSecret = process.env.WEBHOOK_SIGNING_SECRET;
    const suppliedSecret = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
    if (!webhookSecret) return forbidden("Webhook signing secret is not configured");
    if (suppliedSecret !== webhookSecret) return forbidden("Invalid webhook secret");

    const tenantId = body?.tenantId ? String(body.tenantId) : "";
    if (!tenantId) return badRequest("tenantId is required");
    const user = await queryOne<{ id: string; name: string | null; email: string | null; tenantId: string }>(
      `select id, name, email, "tenantId" from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`,
      [tenantId],
    );
    if (!user?.id) return badRequest("No tenant user found");
    const log = await createTelephonyCallLogForTenant(user, body);
    return NextResponse.json(log);
  } catch (error) {
    return serverError("Failed to ingest telephony webhook", error);
  }
}

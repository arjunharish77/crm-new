import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrmSyncConfig } from "@/lib/crm-sync";
import { query } from "@/lib/db";

const configSchema = z.object({
  isEnabled: z.boolean(),
  autoPushEnabled: z.boolean(),
  manualPushEnabled: z.boolean(),
  apiBaseUrl: z.string().trim().optional().default(""),
  endpointPath: z.string().trim().optional().default(""),
  httpMethod: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  authType: z.enum(["NONE", "API_KEY", "BEARER"]).default("NONE"),
  headersTemplate: z.record(z.string(), z.string()).default({}),
  successStatusCodes: z.array(z.number().int().min(100).max(599)).default([200, 201]),
  timeoutMs: z.number().int().min(1000).max(60000).default(15000),
  pushOnlyAfterEmailOtp: z.boolean(),
  pushOnlyAfterConsent: z.boolean(),
});

export async function GET() {
  return NextResponse.json(await getCrmSyncConfig());
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid CRM sync settings" }, { status: 400 });
  }

  const value = parsed.data;
  const existing = await getCrmSyncConfig();
  await query(
    `update crm_sync_config
     set is_enabled = $1,
         auto_push_enabled = $2,
         manual_push_enabled = $3,
         api_base_url = $4,
         endpoint_path = $5,
         http_method = $6,
         auth_type = $7,
         headers_template = $8,
         success_status_codes = $9,
         timeout_ms = $10,
         push_only_after_email_otp = $11,
         push_only_after_consent = $12,
         updated_at = now()
     where id = $13`,
    [
      value.isEnabled,
      value.autoPushEnabled,
      value.manualPushEnabled,
      value.apiBaseUrl || null,
      value.endpointPath || null,
      value.httpMethod,
      value.authType,
      value.headersTemplate,
      value.successStatusCodes,
      value.timeoutMs,
      value.pushOnlyAfterEmailOtp,
      value.pushOnlyAfterConsent,
      existing.id,
    ],
  );

  return NextResponse.json(await getCrmSyncConfig());
}

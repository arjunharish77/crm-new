import { NextResponse } from "next/server";
import { z } from "zod";
import { crmSyncTokens, getActiveMapping } from "@/lib/crm-sync";
import { query } from "@/lib/db";

const mappingSchema = z.object({
  name: z.string().trim().min(2).default("Default lead handoff"),
  requestBodyTemplate: z.record(z.string(), z.unknown()),
});

export async function GET() {
  const active = await getActiveMapping();
  return NextResponse.json({
    tokens: crmSyncTokens,
    active: active
      ? {
          version: active.version,
          name: active.name,
          requestBodyTemplate: active.request_body_template,
        }
      : null,
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = mappingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mapping template" }, { status: 400 });
  }

  const latest = await query<{ next_version: number }>(
    `select coalesce(max(version), 0) + 1 as next_version from crm_sync_mapping`,
  );
  const version = latest.rows[0].next_version;

  await query("update crm_sync_mapping set is_active = false where is_active = true");
  await query(
    `insert into crm_sync_mapping (
       version, name, request_body_template, available_field_snapshot, helper_config, is_active
     )
     values ($1, $2, $3, $4, '{}'::jsonb, true)`,
    [
      version,
      parsed.data.name,
      parsed.data.requestBodyTemplate,
      { tokens: crmSyncTokens },
    ],
  );

  return NextResponse.json({ version, name: parsed.data.name, requestBodyTemplate: parsed.data.requestBodyTemplate });
}

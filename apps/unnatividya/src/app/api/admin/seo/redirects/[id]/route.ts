import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const patchSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid redirect update" }, { status: 400 });
  }

  const saved = await query<{ id: string }>(
    `update seo_redirect
     set is_active = $1, updated_at = now()
     where id = $2
     returning id`,
    [parsed.data.isActive, id],
  );
  if (!saved.rowCount) return NextResponse.json({ error: "Redirect not found" }, { status: 404 });

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('SEO_REDIRECT_STATUS_CHANGED', 'seo_redirect', $1, $2)`,
    [id, { isActive: parsed.data.isActive }],
  );

  return NextResponse.json({ id, isActive: parsed.data.isActive });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await query<{ id: string }>(
    `delete from seo_redirect where id = $1 returning id`,
    [id],
  );
  if (!deleted.rowCount) return NextResponse.json({ error: "Redirect not found" }, { status: 404 });

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('SEO_REDIRECT_DELETED', 'seo_redirect', $1, '{}'::jsonb)`,
    [id],
  );

  return NextResponse.json({ id });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const schema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(10),
});

export async function POST(request: Request) {
  const enabled = process.env.UNNATIVIDYA_CMS_SETUP_ENABLED !== "false";
  if (!enabled) {
    return NextResponse.json({ error: "Setup is disabled" }, { status: 403 });
  }

  const existing = await query<{ count: string }>("select count(*)::text as count from cms_user");
  if (Number(existing.rows[0]?.count || 0) > 0) {
    return NextResponse.json({ error: "Admin already exists" }, { status: 409 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid admin details" }, { status: 400 });
  }

  const created = await query<{ id: string }>(
    `insert into cms_user (name, email, password_hash, role, two_factor_enabled)
     values ($1, $2, $3, 'ADMIN', true)
     returning id`,
    [parsed.data.name, parsed.data.email.toLowerCase(), hashPassword(parsed.data.password)],
  );
  await query(
    `insert into cms_audit_log (user_id, action, entity_type, entity_id, metadata)
     values ($1, 'CMS_ADMIN_CREATED', 'cms_user', $1, '{}'::jsonb)`,
    [created.rows[0].id],
  );

  return NextResponse.json({ ok: true });
}

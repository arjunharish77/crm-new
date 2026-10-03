import { NextResponse } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { entityTypeSchema, revisionContent, revisionContentSchemas } from "@/lib/catalog-revisions";

const schema = z.object({ entityType: entityTypeSchema, entityId: z.string().min(1).max(200),
  baseSnapshot: z.record(z.string(), z.unknown()), content: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(5).max(2000) }).strict();
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS login required" }, { status: 401 });
  if (!["ADMIN", "EDITOR"].includes(session.role)) return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide valid content and a review reason (at least 5 characters)." }, { status: 400 });
  const value = parsed.data;
  const content = revisionContentSchemas[value.entityType].safeParse(value.content);
  if (!content.success) return NextResponse.json({ error: "Invalid content fields. Identity and publication status cannot be changed in a revision." }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ snapshot: Record<string, unknown> }>(`select to_jsonb(t) as snapshot from ${value.entityType} t where id=$1 for update`, [value.entityId]);
    const current = result.rows[0]?.snapshot;
    if (!current) { await client.query("rollback"); return NextResponse.json({ error: "Catalog record not found" }, { status: 404 }); }
    if (!isDeepStrictEqual(current, value.baseSnapshot)) { await client.query("rollback"); return NextResponse.json({ error: "Record changed. Reload it and review your changes against the latest version." }, { status: 409 }); }
    if (isDeepStrictEqual(revisionContent(value.entityType, current), content.data)) { await client.query("rollback"); return NextResponse.json({ error: "No content changes to review." }, { status: 400 }); }
    const saved = await client.query<{ id: string }>(`insert into catalog_revision(entity_type,entity_id,base_snapshot,proposed_content,reason,created_by) values($1,$2,$3,$4,$5,$6) returning id`, [value.entityType,value.entityId,current,content.data,value.reason,session.userId]);
    await client.query(`insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CATALOG_REVISION_PROPOSED','catalog_revision',$2,$3)`, [session.userId,saved.rows[0].id,{ entityType:value.entityType,entityId:value.entityId }]);
    await client.query("commit");
    return NextResponse.json({ id: saved.rows[0].id }, { status: 201 });
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

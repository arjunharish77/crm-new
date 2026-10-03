import { NextResponse } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { entityTypeSchema, revisionContent, revisionContentSchemas } from "@/lib/catalog-revisions";
import type { CatalogWorkingDraft } from "@/lib/catalog-working-drafts";

const schema = z.object({ entityType: entityTypeSchema, entityId: z.string().min(1).max(200),
  baseSnapshot: z.record(z.string(), z.unknown()), content: z.record(z.string(), z.unknown()),
  reason: z.string().max(2000), version: z.number().int().positive().nullable() }).strict();

async function write(request: Request, action: "SAVE" | "SUBMIT" | "DISCARD") {
  const submit = action === "SUBMIT";
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS login required" }, { status: 401 });
  if (!["ADMIN", "EDITOR"].includes(session.role)) return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft details." }, { status: 400 });
  const value = parsed.data;
  const reviewed = submit ? revisionContentSchemas[value.entityType].safeParse(value.content) : null;
  if (submit && (!reviewed?.success || value.reason.trim().length < 5)) return NextResponse.json({ error: "Complete valid revision fields and a review reason of at least 5 characters before submitting." }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const draft = (await client.query<CatalogWorkingDraft>("select * from catalog_working_draft where created_by=$1 and entity_type=$2 and entity_id=$3 for update", [session.userId,value.entityType,value.entityId])).rows[0];
    const fail = async (error: string, status = 409) => { await client.query("rollback"); return NextResponse.json({ error }, { status }); };
    if ((draft?.version ?? null) !== value.version) return fail("This draft changed in another tab or was already submitted. Reload before editing; your current text has not been saved.");
    if (submit && !draft) return fail("Save a working draft before submitting it through this endpoint.");
    if (draft && !isDeepStrictEqual(draft.base_snapshot, value.baseSnapshot)) return fail("The draft baseline cannot be replaced. Review your saved draft against the catalog.");
    if (action === "DISCARD") {
      if (!draft) return fail("Draft no longer exists.");
      await client.query("delete from catalog_working_draft where id=$1", [draft.id]);
      await client.query("insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CATALOG_WORKING_DRAFT_DISCARDED','catalog_working_draft',$2,$3)", [session.userId,draft.id,{entityType:value.entityType,entityId:value.entityId}]);
      await client.query("commit");
      return NextResponse.json({discarded:true});
    }
    const current = (await client.query<{snapshot:Record<string,unknown>}>(`select to_jsonb(t) as snapshot from ${value.entityType} t where id=$1 for update`, [value.entityId])).rows[0]?.snapshot;
    if (!current) return fail("Catalog record not found.", 404);
    if ((!draft || submit) && !isDeepStrictEqual(current, value.baseSnapshot)) return fail("The catalog changed since this draft began. Your saved draft remains available; compare it with the latest record before preparing a new revision.");
    if (submit && reviewed?.success) {
      if (isDeepStrictEqual(revisionContent(value.entityType,current), reviewed.data)) return fail("No content changes to review.", 400);
      const saved = await client.query<{id:string}>("insert into catalog_revision(entity_type,entity_id,base_snapshot,proposed_content,reason,created_by) values($1,$2,$3,$4,$5,$6) returning id", [value.entityType,value.entityId,draft.base_snapshot,reviewed.data,value.reason.trim(),session.userId]);
      await client.query("delete from catalog_working_draft where id=$1", [draft.id]);
      await client.query("insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CATALOG_REVISION_PROPOSED','catalog_revision',$2,$3)", [session.userId,saved.rows[0].id,{entityType:value.entityType,entityId:value.entityId,workingDraftId:draft.id}]);
      await client.query("commit");
      return NextResponse.json({id:saved.rows[0].id}, {status:201});
    }
    const saved = draft
      ? await client.query<CatalogWorkingDraft>("update catalog_working_draft set proposed_content=$1,reason=$2,version=version+1,updated_at=now() where id=$3 returning *", [value.content,value.reason,draft.id])
      : await client.query<CatalogWorkingDraft>("insert into catalog_working_draft(entity_type,entity_id,created_by,base_snapshot,proposed_content,reason) values($1,$2,$3,$4,$5,$6) returning *", [value.entityType,value.entityId,session.userId,current,value.content,value.reason]);
    await client.query("insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CATALOG_WORKING_DRAFT_SAVED','catalog_working_draft',$2,$3)", [session.userId,saved.rows[0].id,{entityType:value.entityType,entityId:value.entityId,version:saved.rows[0].version}]);
    await client.query("commit");
    return NextResponse.json({draft:saved.rows[0]});
  } catch (error) {
    await client.query("rollback");
    if ((error as {code?:string}).code === "23505") return NextResponse.json({error:"Another tab saved this draft. Reload before saving again."},{status:409});
    throw error;
  } finally { client.release(); }
}
export async function PUT(request: Request) { return write(request,"SAVE"); }
export async function POST(request: Request) { return write(request,"SUBMIT"); }

export async function DELETE(request: Request) { return write(request,"DISCARD"); }

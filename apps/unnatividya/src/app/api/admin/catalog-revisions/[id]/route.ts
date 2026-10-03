import { validatePublishedCatalog, catalogWriteFailure, CatalogValidationError } from "@/lib/catalog-write";
import { NextResponse } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { entityTypeSchema, revisionColumns, revisionContentSchemas, type CatalogRevision } from "@/lib/catalog-revisions";

const schema = z.object({ action: z.enum(["APPLY", "REJECT"]), note: z.string().trim().min(5).max(2000) }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS login required" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Only administrators can apply or reject revisions." }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Provide a valid revision and review note (at least 5 characters)." }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(714083291)");
    const revision = (await client.query<CatalogRevision>("select * from catalog_revision where id=$1 for update", [id])).rows[0];
    if (!revision) { await client.query("rollback"); return NextResponse.json({ error: "Revision not found" }, { status: 404 }); }
    if (revision.status !== "NEEDS_REVIEW") { await client.query("rollback"); return NextResponse.json({ error: "Revision already reviewed." }, { status: 409 }); }
    if (parsed.data.action === "APPLY") {
      const type = entityTypeSchema.parse(revision.entity_type);
      const content = revisionContentSchemas[type].parse(revision.proposed_content) as Record<string, unknown>;
      const current = (await client.query<{ snapshot: Record<string, unknown> }>(`select to_jsonb(t) as snapshot from ${type} t where id=$1 for update`, [revision.entity_id])).rows[0]?.snapshot;
      if (!current || !isDeepStrictEqual(current, revision.base_snapshot)) {
        await client.query("rollback");
        return NextResponse.json({ error: "Catalog changed since this proposal. Create a new revision from the latest record; nothing was applied." }, { status: 409 });
      }
      if(current.is_published && current.slug !== content.slug) throw new CatalogValidationError([{entityType:type,entityId:revision.entity_id,field:"slug",message:"Published URLs are locked until a reviewed redirect workflow is available."}]);
      const columns = revisionColumns[type];
      await client.query(`update ${type} set ${columns.map((key,i)=>`${key}=$${i+1}`).join(",")}, updated_at=now() where id=$${columns.length+1}`, [...columns.map(key=>content[key]),revision.entity_id]);
    }
    if (parsed.data.action === "APPLY") await validatePublishedCatalog(client);
    const status = parsed.data.action === "APPLY" ? "APPLIED" : "REJECTED";
    await client.query("update catalog_revision set status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now() where id=$4",[status,session.userId,parsed.data.note,id]);
    await client.query(`insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,$2,'catalog_revision',$3,$4)`,[session.userId,`CATALOG_REVISION_${status}`,id,{entityType:revision.entity_type,entityId:revision.entity_id,note:parsed.data.note,rollbackOf:revision.rollback_of}]);
    await client.query("commit");
    return NextResponse.json({ status });
  } catch (error) {
    await client.query("rollback");
    const failure = catalogWriteFailure(error); if (failure) return failure;
    if (["23505","23503"].includes(String((error as {code?:string}).code))) return NextResponse.json({error:"Slug or university reference conflicts with the catalog. Nothing was applied."},{status:409});
    throw error;
  } finally { client.release(); }
}

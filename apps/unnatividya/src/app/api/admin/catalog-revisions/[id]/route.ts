import { catalogWriteFailure } from "@/lib/catalog-write";
import { applyCatalogRevision, CatalogApplyConflict, CATALOG_LOCK } from "@/lib/catalog-apply";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import type { CatalogRevision } from "@/lib/catalog-revisions";

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
    await client.query("select pg_advisory_xact_lock($1)", [CATALOG_LOCK]);
    const revision = (await client.query<CatalogRevision>("select * from catalog_revision where id=$1 for update", [id])).rows[0];
    if (!revision) { await client.query("rollback"); return NextResponse.json({ error: "Revision not found" }, { status: 404 }); }
    if (revision.status !== "NEEDS_REVIEW") { await client.query("rollback"); return NextResponse.json({ error: "Revision already reviewed." }, { status: 409 }); }
    if (parsed.data.action === "APPLY") {
      try { await applyCatalogRevision(client, id, session.userId, parsed.data.note); }
      catch (error) {
        if (!(error instanceof CatalogApplyConflict)) throw error;
        await client.query("rollback");
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    } else {
      await client.query("update catalog_revision set status='REJECTED',reviewed_by=$1,review_note=$2,reviewed_at=now() where id=$3",[session.userId,parsed.data.note,id]);
      await client.query(`insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CATALOG_REVISION_REJECTED','catalog_revision',$2,$3)`,[session.userId,id,{entityType:revision.entity_type,entityId:revision.entity_id,note:parsed.data.note,rollbackOf:revision.rollback_of}]);
    }
    const status = parsed.data.action === "APPLY" ? "APPLIED" : "REJECTED";
    await client.query("commit");
    return NextResponse.json({ status });
  } catch (error) {
    await client.query("rollback");
    const failure = catalogWriteFailure(error); if (failure) return failure;
    if (["23505","23503"].includes(String((error as {code?:string}).code))) return NextResponse.json({error:"Slug or university reference conflicts with the catalog. Nothing was applied."},{status:409});
    throw error;
  } finally { client.release(); }
}

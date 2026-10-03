import { NextResponse } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { entityTypeSchema, revisionContent, revisionContentSchemas, type CatalogRevision } from "@/lib/catalog-revisions";

const schema=z.object({note:z.string().trim().min(5).max(1500)}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const session=await getAdminSession();
  if(!session) return NextResponse.json({error:"CMS login required"},{status:401});
  if(session.role!=="ADMIN") return NextResponse.json({error:"Only administrators can prepare rollbacks."},{status:403});
  const {id}=await params;
  const input=schema.safeParse(await request.json().catch(()=>null));
  if(!z.string().uuid().safeParse(id).success||!input.success) return NextResponse.json({error:"Provide a valid revision and rollback reason (5–1500 characters)."},{status:400});
  const client=await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(714083291)");
    const source=(await client.query<CatalogRevision>("select * from catalog_revision where id=$1 for update",[id])).rows[0];
    if(!source){await client.query("rollback");return NextResponse.json({error:"Revision not found"},{status:404});}
    if(source.status!=="APPLIED"){await client.query("rollback");return NextResponse.json({error:"Only an applied revision has changes to restore."},{status:409});}
    const type=entityTypeSchema.parse(source.entity_type);
    const current=(await client.query<{snapshot:Record<string,unknown>}>(`select to_jsonb(t) snapshot from ${type} t where id=$1 for update`,[source.entity_id])).rows[0]?.snapshot;
    if(!current){await client.query("rollback");return NextResponse.json({error:"Catalog record no longer exists."},{status:404});}
    const parsed=revisionContentSchemas[type].safeParse(revisionContent(type,source.base_snapshot));
    if(!parsed.success){await client.query("rollback");return NextResponse.json({error:"The historical content no longer passes field validation. Prepare a corrected revision instead."},{status:409});}
    if(isDeepStrictEqual(revisionContent(type,current),parsed.data)){await client.query("rollback");return NextResponse.json({error:"This record already contains the earlier content."},{status:409});}
    const existing=(await client.query<CatalogRevision>("select * from catalog_revision where rollback_of=$1 and status='NEEDS_REVIEW'",[id])).rows[0];
    if(existing){
      await client.query("rollback");
      if(!isDeepStrictEqual(existing.base_snapshot,current)) return NextResponse.json({error:"An earlier rollback proposal is now stale. Reject it before preparing a new one.",id:existing.id},{status:409});
      return NextResponse.json({id:existing.id,rollbackOf:id,reused:true});
    }
    const saved=(await client.query<{id:string}>(`insert into catalog_revision(entity_type,entity_id,base_snapshot,proposed_content,reason,created_by,rollback_of)
      values($1,$2,$3,$4,$5,$6,$7) returning id`,[type,source.entity_id,current,parsed.data,`Restore content from before revision ${id}: ${input.data.note}`,session.userId,id])).rows[0];
    await client.query(`insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CATALOG_ROLLBACK_PROPOSED','catalog_revision',$2,$3)`,[session.userId,saved.id,{entityType:type,entityId:source.entity_id,rollbackOf:id,note:input.data.note}]);
    await client.query("commit");
    return NextResponse.json({id:saved.id,rollbackOf:id},{status:201});
  } catch(error){await client.query("rollback");throw error;}
  finally {client.release();}
}

import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool, type query as queryType } from "@/lib/db";
import { buildCatalogSnapshot } from "@/lib/catalog-snapshot";

export async function validatePublishedCatalog(client:PoolClient, allowEmpty = false) {
  const universities=await client.query("select * from university where status='PUBLISHED' and is_published=true order by id");
  const courses=await client.query("select * from course where status='PUBLISHED' and is_published=true order by id");
  // Empty bootstrap databases can accept drafts; public reads still report not ready.
  if(allowEmpty && !universities.rows.length && !courses.rows.length) return;
  const result=buildCatalogSnapshot(universities.rows,courses.rows);
  const issues = allowEmpty && !courses.rows.length ? result.issues.filter(issue => !(issue.entityType === "catalog" && issue.field === "courses")) : result.issues;
  if(issues.length) throw new CatalogValidationError(issues);
}
export class CatalogValidationError extends Error {
  constructor(public issues:ReturnType<typeof buildCatalogSnapshot>["issues"]) { super("Published content is incomplete. Fix the reported fields before applying this change."); }
}
export function catalogWriteFailure(error:unknown) {
  if(error instanceof CatalogValidationError) return NextResponse.json({error:error.message,issues:error.issues},{status:409});
  if(["23505","23503"].includes(String((error as {code?:string}).code))) return NextResponse.json({error:"The slug or university reference conflicts with another record."},{status:409});
  return null;
}
export async function withCatalogWrite(work:(query:typeof queryType)=>Promise<NextResponse>) {
  const client=await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(714083291)");
    const prior=await client.query("select id,slug,'course' as entity_type from course where status='PUBLISHED' and is_published=true union all select id,slug,'university' as entity_type from university where status='PUBLISHED' and is_published=true");
    const result=await work(client.query.bind(client) as typeof queryType);
    if(result.status>=400){await client.query("rollback");return result;}
    const after=await client.query("select id,slug,'course' as entity_type from course union all select id,slug,'university' as entity_type from university");
    const slugs=new Map(after.rows.map(row=>[`${row.entity_type}:${row.id}`,row.slug]));
    for(const row of prior.rows) {
      const slug=slugs.get(`${row.entity_type}:${row.id}`);
      if(slug && slug!==row.slug) throw new CatalogValidationError([{entityType:row.entity_type,entityId:row.id,field:"slug",message:"Published URLs are locked until a reviewed redirect workflow is available."}]);
    }
    await validatePublishedCatalog(client, !prior.rows.some(row=>row.entity_type==="course"));
    await client.query("commit");
    return result;
  } catch(error) { await client.query("rollback");const response=catalogWriteFailure(error);if(response)return response;throw error; }
  finally { client.release(); }
}

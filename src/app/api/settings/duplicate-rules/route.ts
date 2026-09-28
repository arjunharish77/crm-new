import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { query } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { duplicateRuleInput } from "@/lib/duplicate-rules";
import { badRequest, conflict, forbidden, serverError, unauthorized } from "@/lib/server/http";
function fail(error: unknown) {
 if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
 if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
 if (error instanceof Error && error.message === "RULE_STALE") return conflict("This rule changed. Reload before saving.");
 return serverError("Unable to manage duplicate rules", error);
}
export async function GET(request: Request) {
 try {
  const user = await requireTenantAdmin(request);
  if (!user.tenantId) return forbidden("Select a workspace first");
  return NextResponse.json(await query('select id, entity, name, fields, action, enabled, version from "DuplicateRule" where "tenantId"=$1 order by entity,name,id', [user.tenantId]));
 } catch(error) { return fail(error); }
}
export async function POST(request: Request) {
 try {
  const user = await requireTenantAdmin(request);
  if (!user.tenantId) return forbidden("Select a workspace first");
  const parsed = duplicateRuleInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const input = parsed.data;
  const result = await withTransaction({ id:user.id, tenantId:user.tenantId }, async tx => {
   await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`duplicate-rules:${user.tenantId}`]);
   const before = input.id ? (await tx.query('select * from "DuplicateRule" where id=$1 and "tenantId"=$2', [input.id,user.tenantId])).rows[0] : null;
   if (input.id && (!before || before.version !== input.version)) throw new Error("RULE_STALE");
   if (!input.id) {
    const count = await tx.query('select count(*)::int as n from "DuplicateRule" where "tenantId"=$1', [user.tenantId]);
    if (count.rows[0].n >= 50) throw new Error("RULE_LIMIT");
   }
   const id = input.id ?? randomUUID();
   const row = (await tx.query(`insert into "DuplicateRule" (id,"tenantId",entity,name,fields,action,enabled)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do update set entity=excluded.entity,name=excluded.name,fields=excluded.fields,action=excluded.action,enabled=excluded.enabled,version="DuplicateRule".version+1,"updatedAt"=now() returning *`,
     [id,user.tenantId,input.entity,input.name,input.fields,input.action,input.enabled])).rows[0];
   await tx.query(`insert into "AuditLog" (id,"tenantId","userId",action,"entityType","entityId",before,after,"createdAt") values ($1,$2,$3,$4,'DUPLICATE_RULE',$5,$6,$7,now())`, [randomUUID(),user.tenantId,user.id,input.id?'UPDATE':'CREATE',id,before,row]);
   return row;
  });
  return NextResponse.json(result);
 } catch(error) { if (error instanceof Error && error.message === "RULE_LIMIT") return badRequest("Maximum 50 rules per workspace"); return fail(error); }
}

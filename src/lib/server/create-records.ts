import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { withTransaction } from "@/lib/db/transaction";
import { createLeadForTenant } from "@/lib/repositories/leads-postgres";
import { createOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";
import type { CreateUnitOfWork } from "@/lib/repositories/create-unit-of-work";
const optionalText = z.string().trim().max(500).nullable().optional();
export const apiLeadCreate = z.object({name:z.string().trim().min(1).max(250),email:z.union([z.email(),z.literal("")]).nullable().optional(),phone:optionalText,company:optionalText,source:optionalText,status:z.enum(["NEW","CONTACTED","QUALIFIED","LOST","CONVERTED"]).optional()}).strict();
export const apiOpportunityCreate = z.object({title:z.string().trim().min(1).max(250),leadId:z.string().min(1).max(100),opportunityTypeId:z.string().min(1).max(100),stageId:z.string().min(1).max(100).optional(),amount:z.number().finite().min(0).nullable().optional(),expectedCloseDate:z.iso.date().nullable().optional(),priority:z.enum(["LOW","MEDIUM","HIGH","URGENT"]).optional()}).strict();
export const combinedCreate = z.object({lead:apiLeadCreate,opportunity:apiOpportunityCreate.omit({leadId:true})}).strict();
export function validIdempotencyKey(key:string|null) { return key === null || (key.length >= 1 && key.length <= 200 && /^[\x21-\x7e]+$/.test(key)); }
/** A canonical body makes JSON property ordering irrelevant to retry identity. */
function canonical(value:unknown):string { if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`; if(value && typeof value === "object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;return JSON.stringify(value); }
export async function createApiRecords(user:{id:string;tenantId:string|null;apiKeyId?:string}, kind:"opportunity"|"combined", input:Record<string,unknown>, key:string|null) {
 if(!user.tenantId)throw new Error("TENANT_REQUIRED");
 const source = `api.v1.${kind}.create`;
 const hash = createHash("sha256").update(canonical(input)).digest("hex");
 const afterCommit:CreateUnitOfWork["afterCommit"] = [];
 const result = await withTransaction(user, async tx => {
  if(key){
   await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${user.tenantId}:${source}:${key}`]);
   const existing=(await tx.query('select "requestHash","responseSnapshot" from "RequestIdempotencyKey" where "tenantId"=$1 and source=$2 and "idempotencyKey"=$3',[user.tenantId,source,key])).rows[0];
   if(existing){if(existing.requestHash!==hash)throw new Error("IDEMPOTENCY_KEY_CONFLICT");return existing.responseSnapshot;}
  }
  const unit = {tx,afterCommit};
  let response;
  if(kind === "combined"){
   const parsed = combinedCreate.parse(input);
   const lead=await createLeadForTenant(user,parsed.lead,null,unit);
   const opportunity=await createOpportunityForTenant(user,{...parsed.opportunity,leadId:lead.id},unit);
   response={lead,opportunity,duplicateWarnings:[...(lead.duplicateWarnings??[]),...(opportunity.duplicateWarnings??[])]};
  }else{ response=await createOpportunityForTenant(user,apiOpportunityCreate.parse(input),unit); }
  if(key)await tx.query(`insert into "RequestIdempotencyKey" (id,"tenantId",source,"idempotencyKey","requestHash","entityType","entityId","responseSnapshot","createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,[randomUUID(),user.tenantId,source,key,hash,kind === "combined" ? "LEAD" : "OPPORTUNITY",kind === "combined" ? response.lead.id : response.id,response]);
  return response;
 });
 // Durable webhook events committed with the records. Secondary processing must never
 // make a committed create appear to fail, which could cause unsafe client retries.
 for(const hook of afterCommit)await hook().catch(error=>console.error("Post-create processing failed",error));
 return result;
}

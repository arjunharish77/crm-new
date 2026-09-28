/** Local-only release check. All fixtures belong to two isolated temporary tenants. */
import { createRequire } from 'module';
import { randomUUID } from 'crypto';
import assert from 'node:assert/strict';
import { getPool } from '../src/lib/db/pool';
import { updateTenantFeatureFlags } from '../src/lib/repositories/auth-admin-postgres';
import { createApiKeyForTenant } from '../src/lib/repositories/api-keys-postgres';
import { createApiRecords } from '../src/lib/server/create-records';
const require=createRequire(import.meta.url);const d=require('./db-utils.js');
async function main(){
 for(const url of [d.directDatabaseUrl(),d.appDatabaseUrl()])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local database required');
 const pool=getPool();const q=(sql:string,args:unknown[]=[])=>pool.query(sql,args);
 const tenant=randomUUID(), other=randomUUID(), object=randomUUID(),opObject=randomUUID(),type=randomUUID(),stage=randomUUID(),rule=randomUUID(),opRule=randomUUID();
 let checks=0;const check=(v:unknown)=>{assert.ok(v);checks++;};
 const lead=async(email:string|null,phone:string|null=null,t=tenant)=>{const id=randomUUID();return (await q('insert into "Lead" (id,"tenantId","objectId",name,email,phone,"updatedAt") values ($1,$2,$3,$4,$5,$6,now()) returning *',[id,t,object,'Duplicate smoke',email,phone])).rows[0];};
 try {
  for(const id of [tenant,other])await q('insert into "Tenant" (id,name,"updatedAt") values ($1,$2,now())',[id,'Release smoke']);
  for(const [id,name] of [[object,'lead'],[opObject,'opportunity']])await q('insert into "ObjectDefinition" (id,"tenantId",name,label,"updatedAt") values ($1,$2,$3,$3,now())',[id,tenant,name]);
  await q('insert into "OpportunityType" (id,"tenantId","objectId",name,"updatedAt") values ($1,$2,$3,$4,now())',[type,tenant,opObject,'Release test']);
  await q('insert into "StageDefinition" (id,"tenantId","opportunityTypeId",name,"order","updatedAt") values ($1,$2,$3,$4,0,now())',[stage,tenant,type,'New']);
  await q('insert into "DuplicateRule" (id,"tenantId",entity,name,fields,action) values ($1,$2,$3,$4,$5,$6)',[rule,tenant,'Lead','Unique email',['email'],'BLOCK']);
  const first=await lead('Example@EXAMPLE.invalid');
  await assert.rejects(()=>lead(' example@example.invalid '),/DUPLICATE_RULE_BLOCK/);checks++;
  const races=await Promise.allSettled(Array.from({length:6},()=>lead('race@example.invalid')));check(races.filter(r=>r.status==='fulfilled').length===1);
  await lead(null);await lead('');checks++;
  await lead('example@example.invalid',null,other);checks++;
  await q('update "DuplicateRule" set action=$1 where id=$2',['WARN',rule]);
  const warned=await lead('example@example.invalid');check(warned.duplicateWarnings[0].name==='Unique email');
  await q('update "DuplicateRule" set action=$1 where id=$2',['BLOCK',rule]);
  await q('update "Lead" set company=$1 where id=$2',['Unrelated edit',warned.id]);checks++;
  await assert.rejects(()=>q('update "Lead" set email=$1 where id=$2',['race@example.invalid',warned.id]),/DUPLICATE_RULE_BLOCK/);checks++;
  await q('update "DuplicateRule" set fields=$1 where id=$2',[['phone'],rule]);
  await lead(null,'+91 987-654-3210');await assert.rejects(()=>lead(null,'919876543210'),/DUPLICATE_RULE_BLOCK/);checks++;
  await q('update "DuplicateRule" set fields=$1,action=$2 where id=$3',[['email'],'BLOCK',rule]);
  await q('insert into "DuplicateRule" (id,"tenantId",entity,name,fields,action) values ($1,$2,$3,$4,$5,$6)',[opRule,tenant,'Opportunity','Lead + type',['leadId','opportunityTypeId'],'BLOCK']);
  const actor={id:randomUUID(),tenantId:tenant};
  const role=(await q('select "roleId" from "User" where email=$1',['admintest@test.com'])).rows[0].roleId;
  await q('insert into "User" (id,"tenantId",email,name,password,status,"roleId","updatedAt") values ($1,$2,$3,$4,$5,$6,$7,now())',[actor.id,tenant,`${actor.id}@example.invalid`,'Release smoke',randomUUID(),'INACTIVE',role]);
  const input={lead:{name:'Atomic lead',email:'atomic@example.invalid'},opportunity:{title:'Atomic opportunity',opportunityTypeId:type,amount:0}};
  const key=randomUUID();const result=await createApiRecords(actor,'combined',input,key);
  check(result.opportunity.leadId===result.lead.id);check((await createApiRecords(actor,'combined',input,key)).lead.id===result.lead.id);
  await assert.rejects(()=>createApiRecords(actor,'combined',{...input,lead:{...input.lead,name:'Changed'}},key),/IDEMPOTENCY_KEY_CONFLICT/);checks++;
  await assert.rejects(()=>createApiRecords(actor,'opportunity',{title:'Duplicate',leadId:result.lead.id,opportunityTypeId:type},randomUUID()),/DUPLICATE_RULE_BLOCK/);checks++;
  await assert.rejects(()=>createApiRecords(actor,'combined',{lead:{name:'Rollback',email:'rollback@example.invalid'},opportunity:{title:'Invalid',opportunityTypeId:'missing'}},randomUUID()),/INVALID_OPPORTUNITY_REFERENCE/);checks++;
  check((await q('select id from "Lead" where "tenantId"=$1 and email=$2',[tenant,'rollback@example.invalid'])).rowCount===0);
  const parallelKey=randomUUID();const parallelInput={lead:{name:'Parallel',email:'parallel@example.invalid'},opportunity:{title:'Parallel',opportunityTypeId:type}};
  const parallel=await Promise.all(Array.from({length:4},()=>createApiRecords(actor,'combined',parallelInput,parallelKey)));check(new Set(parallel.map(r=>r.lead.id)).size===1);
  await assert.rejects(()=>createApiRecords({...actor,tenantId:other},'opportunity',{title:'Cross tenant',leadId:first.id,opportunityTypeId:type},null),/INVALID_OPPORTUNITY_REFERENCE/);checks++;
  if(process.env.CRM_SMOKE_HTTP === 'true') {
   await updateTenantFeatureFlags(tenant,{apiAccessEnabled:true});
   await q('update "User" set status=$1 where id=$2',['ACTIVE',actor.id]);
   const apiKey=await createApiKeyForTenant(actor,{name:'Release HTTP',permissions:{leads:{create:true},opportunities:{create:true}},rateLimitPerMinute:120});
   const headers={'Content-Type':'application/json',Authorization:`Bearer ${apiKey.id}.${apiKey.secret}`};
   const post=async(path:string,body:unknown,key:string=randomUUID())=>fetch(`http://localhost:3000/api/v1/${path}`,{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(body)});
   const leadKey=randomUUID();const leadBody={name:'HTTP lead',email:'http@example.invalid'};
   const leadResponse=await post('leads',leadBody,leadKey);assert.equal(leadResponse.status,201,JSON.stringify(await leadResponse.clone().json()));checks++;
   const httpLead=await leadResponse.json();check((await (await post('leads',leadBody,leadKey)).json()).id===httpLead.id);
   check((await post('leads',leadBody)).status===409);
   check((await post('leads',{name:'Bad',unknownField:true})).status===400);
   const opBody={title:'HTTP opportunity',leadId:httpLead.id,opportunityTypeId:type,amount:0};const opKey=randomUUID();
   const opResponse=await post('opportunities',opBody,opKey);assert.equal(opResponse.status,201,JSON.stringify(await opResponse.clone().json()));checks++;
   const httpOp=await opResponse.json();check(Number(httpOp.amount)===0);check((await (await post('opportunities',opBody,opKey)).json()).id===httpOp.id);
   const together={lead:{name:'HTTP both',email:'both@example.invalid'},opportunity:{title:'HTTP both',opportunityTypeId:type}};const togetherKey=randomUUID();
   const both=await post('leads-with-opportunity',together,togetherKey);assert.equal(both.status,201,JSON.stringify(await both.clone().json()));checks++;
   const bothBody=await both.json();check(bothBody.lead.id===bothBody.opportunity.leadId);check((await (await post('leads-with-opportunity',together,togetherKey)).json()).lead.id===bothBody.lead.id);
   check((await post('leads-with-opportunity',{...together,lead:{name:'Changed'}},togetherKey)).status===409);
   const bad=await post('leads-with-opportunity',{lead:{name:'HTTP rollback',email:'http-rollback@example.invalid'},opportunity:{title:'Bad type',opportunityTypeId:'missing'}});check(bad.status===400);
   check((await q('select id from "Lead" where "tenantId"=$1 and email=$2',[tenant,'http-rollback@example.invalid'])).rowCount===0);
   await q('update "ApiKey" set permissions=$1 where id=$2',[{leads:{create:true}},apiKey.id]);check((await post('leads-with-opportunity',together)).status===403);
   check((await fetch('http://localhost:3000/api/v1/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(leadBody)})).status===401);
   check((await q('select id from "AuditLog" where "tenantId"=$1 and "entityId"=$2 and metadata->>\'apiKeyId\'=$3',[tenant,httpLead.id,apiKey.id])).rowCount===1);
  }
  console.log(JSON.stringify({status:'passed' ,checks,concurrentDuplicateAttempts:6,concurrentCombinedRetries:4}));
 }finally{
  // Delete only these generated tenant IDs. Repeated passes handle FK dependency order.
  const tables=(await q(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)).rows.map(r=>r.table_name as string);
  for(let pass=0;pass<8;pass++)for(const table of tables)await q(`delete from "${table.replaceAll('"','""')}" where "tenantId"=any($1::text[])`,[[tenant,other]]).catch(()=>undefined);
  await q('delete from "Tenant" where id=any($1::text[])',[[tenant,other]]);await pool.end();
 }
}
// Imported server modules can keep background handles (e.g. queue clients) open; exit explicitly.
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>process.exit(process.exitCode ?? 0));

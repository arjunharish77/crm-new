/** Local-only integration smoke. Creates and removes isolated catalog/application fixtures. */
import { createRequire } from 'module';
import { randomUUID } from 'crypto';
import assert from 'node:assert/strict';
import { createApplication,getApplication,listApplications,saveNumberingRule,getApplicationEligibility,saveApplicationEligibility } from '../src/lib/repositories/applications-postgres';
import { getPool } from '../src/lib/db/pool';
const require=createRequire(import.meta.url);
const d=require('./db-utils.js');
async function main(){
 for(const url of [d.directDatabaseUrl(),d.appDatabaseUrl()])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local database required');
 const pool=getPool();const q=(sql:string,args:unknown[]=[])=>pool.query(sql,args);
 const user=(await q('select id,"tenantId" from "User" where email=$1',['admintest@test.com'])).rows[0];assert.ok(user);const actor={...user,isTenantAdmin:true};
 const lead=(await q('select id from "Lead" where "tenantId"=$1 limit 1',[user.tenantId])).rows[0];assert.ok(lead,'A local applicant fixture is required');
 const catalog=randomUUID(),university=randomUUID(),program=randomUUID(),stage=randomUUID();let checks=0;
 const check=(v:unknown)=>{assert.ok(v);checks++;};
 try{
 await q('insert into "ProductCatalog" (id,"tenantId",name) values ($1,$2,$3)',[catalog,user.tenantId,'Application smoke']);
 await q('insert into "University" (id,"tenantId","catalogId",name) values ($1,$2,$3,$4)',[university,user.tenantId,catalog,'Application smoke university']);
 await q('insert into "Program" (id,"tenantId","universityId",name) values ($1,$2,$3,$4)',[program,user.tenantId,university,'Application smoke program']);
 await q('insert into "ApplicationStage" (id,"tenantId","programId",name) values ($1,$2,$3,$4)',[stage,user.tenantId,program,'New']);
 const rule=await saveNumberingRule(actor,{universityId:university,prefix:'SMOKE-{FY}-'});
 check(rule.prefix==='SMOKE-{FY}-');
 const edited=await saveNumberingRule(actor,{universityId:university,prefix:'SMOKE-{YYYY}-'});check(edited.id===rule.id);
 const input={leadId:lead.id,programId:program,stageId:stage,requestKey:randomUUID()};
 const duplicates=await Promise.all(Array.from({length:6},()=>createApplication(actor,input)));
 check(new Set(duplicates.map(r=>r.record.id)).size===1);check(duplicates.filter(r=>!r.replayed).length===1);
 const distinct=await Promise.all(Array.from({length:6},()=>createApplication(actor,{...input,requestKey:randomUUID()})));
 check(new Set(distinct.map(r=>r.record.applicationNumber)).size===6);check(distinct.every(r=>r.record.applicationNumber.startsWith('SMOKE-')));
 await assert.rejects(()=>createApplication(actor,{...input,courseId:'invalid'}),(e:any)=>e.status===409);checks++;
 await assert.rejects(()=>createApplication(actor,{...input,requestKey:randomUUID(),stageId:'invalid'}),(e:any)=>e.status===400);checks++;
 await assert.rejects(()=>createApplication(actor,{...input,requestKey:randomUUID(),leadId:'invalid'}),(e:any)=>e.status===400);checks++;
 const id=duplicates[0].record.id;
 check(await getApplication({...actor,tenantId:randomUUID()},id)===null);
 const own={...user,id:randomUUID(),role:{permissions:{recordAccess:'OWN',modules:{applications:{read:true}}}}};
 check(await getApplication(own,id)===null);check((await listApplications(own,'Application smoke',1)).total===0);
 await assert.rejects(()=>createApplication(own,input),(e:any)=>e.status===403);checks++;
 check(Number((await q('select count(*) from "ApplicationStageHistory" where "applicationId"=$1',[id])).rows[0].count)===1);
 check(Number((await q('select count(*) from "AuditLog" where "entityId"=$1',[id])).rows[0].count)===1);

 check((await getApplicationEligibility(actor,id)).evaluation.status==='NOT_CONFIGURED');
 const eligibilityRule=randomUUID();
 await q('insert into "EligibilityRule" (id,"tenantId","programId",name,"minEducationLevel","minPercentage","requiredEntranceExam") values ($1,$2,$3,$4,$5,$6,$7)',[eligibilityRule,user.tenantId,program,'Entry','CLASS_12',60,'Exam A']);
 check((await getApplicationEligibility(actor,id)).evaluation.status==='NEEDS_INFO');
 const facts={educationLevel:'BACHELORS',percentage:70,entranceExams:['Exam A'],examInformationProvided:true,notes:'Test qualification'};
 await assert.rejects(()=>saveApplicationEligibility(own,id,{version:0,facts}),(e:any)=>e.status===403);checks++;
 await assert.rejects(()=>saveApplicationEligibility({...actor,tenantId:randomUUID()},id,{version:0,facts}),(e:any)=>e.status===404);checks++;
 const saves=await Promise.allSettled([saveApplicationEligibility(actor,id,{version:0,facts}),saveApplicationEligibility(actor,id,{version:0,facts})]);
 check(saves.filter(r=>r.status==='fulfilled').length===1);check(saves.filter(r=>r.status==='rejected'&&r.reason.status===409).length===1);
 const current=await getApplicationEligibility(actor,id);check(current.version===1);check(current.evaluation.status==='MET');check(current.facts.notes===facts.notes);
 await q('update "EligibilityRule" set "minPercentage"=80 where id=$1',[eligibilityRule]);check((await getApplicationEligibility(actor,id)).evaluation.status==='NOT_MET');
 await q('update "EligibilityRule" set "isActive"=false where id=$1',[eligibilityRule]);check((await getApplicationEligibility(actor,id)).evaluation.status==='NOT_CONFIGURED');

 if(process.env.CRM_TEST_PASSWORD){
 const base='http://localhost:3000';const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admintest@test.com',password:process.env.CRM_TEST_PASSWORD})});check(login.status===200);
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),url=base+`/api/applications/${id}/eligibility`;
 const fetched=await fetch(url,{headers:{Cookie:cookie}});check(fetched.status===200);check((await fetched.json()).version===1);
 const save=()=>fetch(url,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({version:1,facts:{...facts,percentage:65}})});
 const saved=await save();check(saved.status===200);check((await saved.json()).version===2);check((await save()).status===409);
 check((await fetch(url)).status===401);
 }
 console.log(JSON.stringify({checks,status:'passed',concurrentSameRequest:6,concurrentDistinctRequests:6}));
 }finally{
 await q('delete from "AuditLog" where "tenantId"=$1 and ("entityId" in (select id from "Application" where "programId"=$2) or "entityId" in (select id from "ApplicationNumberRule" where "universityId"=$3))',[user.tenantId,program,university]);
 await q('delete from "ApplicationStageHistory" where "applicationId" in (select id from "Application" where "programId"=$1)',[program]);
 await q('delete from "Application" where "programId"=$1',[program]);
 await q('delete from "ApplicationNumberRule" where "universityId"=$1',[university]);
 await q('delete from "ApplicationStage" where "programId"=$1',[program]);
 await q('delete from "Program" where id=$1',[program]);await q('delete from "University" where id=$1',[university]);await q('delete from "ProductCatalog" where id=$1',[catalog]);
 await pool.end();
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

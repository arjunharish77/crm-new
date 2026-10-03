// Local-only HTTP/database smoke. Never sends an OTP email or pushes CRM data.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || !['localhost','127.0.0.1'].includes(new URL(dbUrl).hostname) || !['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local endpoints required');
const db = new Client({ connectionString: dbUrl });
const submissionKey = randomUUID(), token = randomBytes(32).toString('hex');
let leadId; let checks = 0;
const testIp = `127.0.0.${Math.floor(Math.random()*200)+20}`;
function check(value, expected) { assert.deepEqual(value,expected); checks++; }
async function api(route, method, body, capability = token) {
 const r = await fetch(base+route,{method,headers:{'X-Forwarded-For':testIp,'Content-Type':'application/json',Authorization:`Bearer ${capability}`,Origin:base},body:body ? JSON.stringify(body) : undefined});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
}
(async()=>{
 await db.connect();
 const c=(await db.query('select is_enabled from crm_sync_config order by created_at limit 1')).rows[0];
 if(c?.is_enabled) throw Error('Disable CRM delivery for this local smoke; no external sends allowed');
 const body={submissionKey,name:'UV smoke learner',email:`uv-${submissionKey}@example.invalid`,phone:'+919999999999',consent:true,intent:'local_smoke'};
 check((await api('/api/leads','POST',body,'bad')).status,403);
 check((await api('/api/leads','POST',{...body,consent:false})).status,400);
 const created=await api('/api/leads','POST',body);check(created.status,201);leadId=created.data.leadId;
 const retries=await Promise.all(Array.from({length:3},()=>api('/api/leads','POST',body)));
 check(retries.map(r=>r.data.leadId),[leadId,leadId,leadId]);
 check((await db.query('select count(*)::int n from lead_capture where submission_key=$1',[submissionKey])).rows[0].n,1);
 check((await api('/api/leads','POST',{...body,name:'Changed'})).status,409);
 check((await api(`/api/leads/${leadId}`,'PATCH',{coursePreference:'Online MBA',university:''},randomBytes(32).toString('hex'))).status,403);
 check((await api(`/api/leads/${leadId}`,'PATCH',{coursePreference:'Not a course',university:''})).status,400);
 check((await api(`/api/leads/${leadId}`,'PATCH',{coursePreference:'Online MBA',university:'unknown'})).status,400);
 check((await api(`/api/leads/${leadId}`,'PATCH',{coursePreference:'Online MBA',university:''})).status,200);
 const row=(await db.query('select * from lead_capture where id=$1',[leadId])).rows[0];
 check([row.course_preference,row.course_id,row.university_id],['Online MBA',null,null]);
 check(row.email_otp_verified,false);check(row.consent_version,'application-follow-up-2026-09-29');
 check((await api('/api/otp/send','POST',{leadId},'bad')).status,403);
 // Insert a synthetic code directly instead of invoking the email provider.
 const code='5678';const hash=createHash('sha256').update(`${code}:${process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me'}`).digest('hex');
 await db.query(`insert into otp_request(lead_capture_id,channel,purpose,target,otp_hash,expires_at,provider) values($1,'EMAIL','LEAD_VERIFY',$2,$3,now()+interval '10 minutes','local_test')`,[leadId,row.email,hash]);
 check((await api('/api/otp/verify','POST',{leadId,otp:'1111'})).status,400);
 const verified=await api('/api/otp/verify','POST',{leadId,otp:code});check(verified.status,200);
 const cookie=verified.cookie.split(';')[0];
 check((await (await fetch(base+'/api/compare-access',{headers:{Cookie:cookie}})).json()).unlocked,true);
 check((await api(`/api/leads/${leadId}`,'PATCH',{contact:{...body,email:`changed-${submissionKey}@example.invalid`}})).status,200);
 check((await (await fetch(base+'/api/compare-access',{headers:{Cookie:cookie}})).json()).unlocked,false);
 check((await db.query('select count(*)::int n from otp_request where lead_capture_id=$1',[leadId])).rows[0].n,0);
 check((await api(`/api/leads/${leadId}`,'PATCH',{coursePreference:'Online MBA',university:'muj'})).status,200);
 const selected=(await db.query('select course_id,university_id from lead_capture where id=$1',[leadId])).rows[0];check(selected,{course_id:'mba-muj',university_id:'muj'});
 console.log(`PASS ${checks} contact-first database/HTTP checks; no external delivery attempted.`);
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{await db.query('delete from lead_capture where submission_key=$1',[submissionKey]);await db.end()});

// Local-only integration check; creates disposable users/catalog rows, never sends email.
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const url = process.env.UNNATIVIDYA_DATABASE_URL;
if (!url || ![url, base].every(v => ['localhost', '127.0.0.1'].includes(new URL(v).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString: url });
const prefix = `cms-smoke-${randomUUID()}`;
const users = [], entities = [], cookies = {};
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
async function api(role, route, method, body) {
  const response = await fetch(base + route, { method, headers: { Cookie: cookies[role] || '', Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {status: response.status, data: await response.json()};
}
(async () => {
  await db.connect();
  for (const role of ['ADMIN', 'EDITOR', 'VIEWER']) {
    const id = randomUUID(), email = `${prefix}-${role}@example.invalid`;
    await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id,email,'Local permission smoke','not-a-login-password',role]);
    users.push(id);
    const iat = Math.floor(Date.now()/1000);
    const payload = Buffer.from(JSON.stringify({ userId:id,email,role,iat,exp:iat+600 })).toString('base64url');
    const signature = createHmac('sha256', process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url');
    cookies[role] = `uv_admin_session=${payload}.${signature}`;
  }
  const universityId = `${prefix}-university`;
  await db.query("insert into university(id,slug,name,short_name,status,is_published) values($1,$1,'Revision fixture','Fixture','DRAFT',false)",[universityId]);
  entities.push(universityId);
  const courseId = `${prefix}-course`; entities.push(courseId);
  await db.query(`insert into course(id,slug,university_id,name,short_name,level,program_type,ugc_approved,stream,fee_inr,duration,status,is_published,data)
    select $1,$1,university_id,'Revision course',short_name,level,program_type,ugc_approved,stream,fee_inr,duration,'PUBLISHED',true,data from course where id='mba-muj'`,[courseId]);
  async function snapshot(type,id) { return (await db.query(`select to_jsonb(t) snapshot from ${type} t where id=$1`,[id])).rows[0].snapshot; }
  async function propose(type,id,suffix='changed') {
    const baseSnapshot = await snapshot(type,id);
    const keys = type === 'university' ? ['slug','name','short_name','data','city'] : ['slug','name','short_name','data','university_id','level','program_type','ugc_approved','stream','fee_inr','duration'];
    const content = Object.fromEntries(keys.map(k=>[k,baseSnapshot[k]]));
    content.name += suffix;
    return { entityType:type,entityId:id,baseSnapshot,content,reason:'Verified fixture correction' };
  }
  for (const [type,id] of [['university',universityId],['course',courseId]]) {
    const body = await propose(type,id);
    const endpoint='/api/admin/catalog-revisions';
    check((await api('NONE',endpoint,'POST',body)).status,401);
    check((await api('VIEWER',endpoint,'POST',body)).status,403);
    check((await api('EDITOR',endpoint,'POST',{...body,content:{...body.content,is_published:false}})).status,400);
    const created=await api('EDITOR',endpoint,'POST',body);check(created.status,201);
    const revisionId=created.data.id;
    check(await snapshot(type,id),body.baseSnapshot);
    const url=`${endpoint}/${revisionId}`;
    check((await api('EDITOR',url,'PATCH',{action:'APPLY',note:'Editor bypass attempt'})).status,403);
    check((await api('VIEWER',url,'PATCH',{action:'REJECT',note:'Viewer bypass attempt'})).status,403);
    check((await api('ADMIN',url,'PATCH',{action:'APPLY',note:'Reviewed fixture content'})).status,200);
    const applied=await snapshot(type,id);
    check(applied.name,body.content.name);check([applied.status,applied.is_published],type==='course'?['PUBLISHED',true]:['DRAFT',false]);
    check((await api('ADMIN',url,'PATCH',{action:'APPLY',note:'Duplicate click test'})).status,409);
    const audit=(await db.query("select user_id from cms_audit_log where entity_id=$1 and action='CATALOG_REVISION_APPLIED'",[revisionId])).rows;
    check(audit.map(r=>r.user_id),[users[0]]);
    const staleBody=await propose(type,id,'stale');
    const stale=await api('EDITOR',endpoint,'POST',staleBody);check(stale.status,201);
    await db.query(`update ${type} set name=name || 'newer',updated_at=now() where id=$1`,[id]);
    const newer=await snapshot(type,id);
    check((await api('ADMIN',`${endpoint}/${stale.data.id}`,'PATCH',{action:'APPLY',note:'Stale version must fail'})).status,409);
    check(await snapshot(type,id),newer);
    check((await api('EDITOR',endpoint,'POST',staleBody)).status,409);
    check((await api('ADMIN',`${endpoint}/${stale.data.id}`,'PATCH',{action:'REJECT',note:'Superseded by newer content'})).status,200);
    check(await snapshot(type,id),newer);
    const rejected=await api('EDITOR',endpoint,'POST',await propose(type,id,'reject'));
    check((await api('ADMIN',`${endpoint}/${rejected.data.id}`,'PATCH',{action:'REJECT',note:'Not supported by sources'})).status,200);
    check((await api('ADMIN',`${endpoint}/${rejected.data.id}`,'PATCH',{action:'APPLY',note:'Rejected cannot be applied'})).status,409);
  }
  console.log(`PASS ${checks} revision checks; disposable fixtures cleaned up.`);
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(async () => {
  await db.query("delete from cms_audit_log where entity_id in (select id::text from catalog_revision where entity_id=any($1::text[]))",[entities]);
  await db.query('delete from catalog_revision where entity_id=any($1::text[])',[entities]);
  await db.query('delete from course where id = any($1::text[])',[entities]);
  await db.query('delete from university where id = any($1::text[])',[entities]);
  await db.query('delete from cms_user where id = any($1::uuid[])',[users]);
  await db.end();
});

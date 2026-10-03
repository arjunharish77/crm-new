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
  return response.status;
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
  const template=(await db.query("select * from course where id='mba-muj'")).rows[0];
  for (const kind of ['universities','courses']) {
    const id = kind === 'universities' ? universityId : `${prefix}-course`;
    entities.push(id);
    const draft = { id,slug:id,name:'Local smoke draft',shortName:'Smoke',status:'DRAFT',isPublished:false,data:{},city:'Test', universityId,level:'PG',programType:'DEGREE',ugcApproved:false,stream:'Management',feeInr:null,duration:'' };
    if(kind==='courses') Object.assign(draft,{universityId:'muj',ugcApproved:true,feeInr:template.fee_inr,duration:template.duration,data:template.data});
    const published = {...draft,status:'PUBLISHED',isPublished:true};
    const route = `/api/admin/catalog/${kind}`;
    check(await api('NONE',route,'POST',draft),401);
    check(await api('VIEWER',route,'POST',draft),403);
    check(await api('EDITOR',route,'POST',published),403);
    check(await api('EDITOR',route,'POST',draft),201);
    check(await api('VIEWER',`${route}/${id}`,'PATCH',draft),403);
    check(await api('EDITOR',`${route}/${id}`,'PATCH',{...draft,status:'NEEDS_REVIEW'}),200);
    check(await api('EDITOR',`${route}/${id}`,'PATCH',published),403);
    check(await api('ADMIN',`${route}/${id}`,'PATCH',{...draft,isPublished:true}),400);
    check(await api('ADMIN',`${route}/${id}`,'PATCH',published),kind==='courses'?200:409);
    if(kind==='universities') await db.query("update university set status='ARCHIVED' where id=$1",[id]);
    check(await api('EDITOR',`${route}/${id}`,'PATCH',draft),403);
    const table = kind === 'universities' ? 'university' : 'course';
    check((await db.query(`select status from ${table} where id=$1`,[id])).rows[0].status,kind==='courses'?'PUBLISHED':'ARCHIVED');
    check(await api('ADMIN',`${route}/${id}`,'PATCH',{...draft,status:'ARCHIVED'}),200);
    check(await api('EDITOR',`${route}/${id}`,'PATCH',draft),403);
    // A token claiming ADMIN must lose write access immediately after a DB role downgrade.
    await db.query("update cms_user set role='VIEWER' where id=$1",[users[0]]);
    check(await api('ADMIN',`${route}/${id}`,'PATCH',published),403);
    await db.query("update cms_user set role='ADMIN' where id=$1",[users[0]]);
  }
  const importRoute = `/api/admin/source-import-items/${randomUUID()}`;
  check(await api('VIEWER',importRoute,'PATCH',{action:'MARK_REVIEWED'}),403);
  check(await api('EDITOR',importRoute,'PATCH',{action:'APPLY_TO_CATALOG'}),403);
  check(await api('EDITOR',importRoute,'PATCH',{action:'MARK_REVIEWED'}),404);
  console.log(`PASS ${checks} catalog authorization checks; disposable rows cleaned up.`);
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(async () => {
  await db.query('delete from cms_audit_log where entity_id = any($1::text[])',[entities]);
  await db.query('delete from course where id = any($1::text[])',[entities]);
  await db.query('delete from university where id = any($1::text[])',[entities]);
  await db.query('delete from cms_user where id = any($1::uuid[])',[users]);
  await db.end();
});

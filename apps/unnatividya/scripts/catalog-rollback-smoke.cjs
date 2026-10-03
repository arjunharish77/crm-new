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
let checks = 0; let browser;
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
  const id=`${prefix}-course`;entities.push(id);
  await db.query(`insert into course(id,slug,university_id,name,short_name,level,program_type,ugc_approved,stream,fee_inr,duration,status,is_published,data)
    select $1,$1,university_id,'Original rollback fixture',short_name,level,program_type,ugc_approved,stream,fee_inr,duration,'PUBLISHED',true,data from course where id='mba-muj'`,[id]);
  const endpoint='/api/admin/catalog-revisions';
  async function current(){return (await db.query('select to_jsonb(t) snapshot from course t where id=$1',[id])).rows[0].snapshot;}
  function content(row){const keys=['slug','name','short_name','data','university_id','level','program_type','ugc_approved','stream','fee_inr','duration'];return Object.fromEntries(keys.map(key=>[key,row[key]]));}
  async function propose(name){const baseSnapshot=await current();const response=await api('EDITOR',endpoint,'POST',{entityType:'course',entityId:id,baseSnapshot,content:{...content(baseSnapshot),name},reason:'Local rollback fixture change'});check(response.status,201);return response.data.id;}
  async function apply(revision){return api('ADMIN',`${endpoint}/${revision}`,'PATCH',{action:'APPLY',note:'Reviewed local rollback fixture'});}
  async function prepare(revision,role='ADMIN'){return api(role,`${endpoint}/${revision}/rollback`,'POST',{note:'Restore the earlier verified content'});}
  const original=await current();const source=await propose('Changed rollback fixture');
  check((await prepare(source)).status,409);
  check((await apply(source)).status,200);
  const changed=await current();
  check((await prepare(source,'NONE')).status,401);
  check((await prepare(source,'EDITOR')).status,403);
  check((await prepare(source,'VIEWER')).status,403);
  check((await prepare(randomUUID())).status,404);
  check((await api('ADMIN',`${endpoint}/${source}/rollback`,'POST',{note:'no'})).status,400);
  const rollback=await prepare(source);check(rollback.status,201);
  check(await current(),changed);
  const history=(await db.query('select * from catalog_revision where id=$1',[rollback.data.id])).rows[0];
  check(history.rollback_of,source);check(history.proposed_content.name,original.name);
  check(history.status,'NEEDS_REVIEW');check(history.created_by,users[0]);
  const retry=await prepare(source);check(retry.status,200);check(retry.data.id,rollback.data.id);
  const newer=await propose('Newer rollback fixture');check((await apply(newer)).status,200);
  check((await apply(rollback.data.id)).status,409);check((await prepare(source)).status,409);
  check((await current()).name,'Newer rollback fixture');
  check((await api('ADMIN',`${endpoint}/${rollback.data.id}`,'PATCH',{action:'REJECT',note:'Reject stale rollback proposal'})).status,200);
  const fresh=await prepare(source);check(fresh.status,201);check((await apply(fresh.data.id)).status,200);
  const restored=await current();check(content(restored),content(original));check([restored.status,restored.is_published],['PUBLISHED',true]);
  check((await prepare(source)).status,409);
  check((await db.query('select status from catalog_revision where id=$1',[source])).rows[0].status,'APPLIED');
  const audit=(await db.query("select user_id,metadata from cms_audit_log where entity_id=$1 and action='CATALOG_REVISION_APPLIED'",[fresh.data.id])).rows[0];
  check(audit.user_id,users[0]);check(audit.metadata.rollbackOf,source);
  const archiveSource=await propose('Archived rollback fixture');check((await apply(archiveSource)).status,200);
  await db.query("update course set status='ARCHIVED',is_published=false,updated_at=now() where id=$1",[id]);
  const archiveRollback=await prepare(archiveSource);check(archiveRollback.status,201);check((await apply(archiveRollback.data.id)).status,200);
  check([(await current()).status,(await current()).is_published],['ARCHIVED',false]);
  await db.query("update course set status='PUBLISHED',is_published=true,updated_at=now() where id=$1",[id]);
  // Historical data can predate current validation: proposing it must never bypass apply checks.
  const historical=(await db.query(`insert into catalog_revision(entity_type,entity_id,base_snapshot,proposed_content,reason,status,created_by)
    values('course',$1,$2,$3,'Historical invalid fixture','APPLIED',$4) returning id`,[id,{...original,fee_inr:null},content(original),users[0]])).rows[0].id;
  const invalid=await prepare(historical);check(invalid.status,201);check((await apply(invalid.data.id)).status,409);check(content(await current()),content(original));
  if(process.env.UV_BROWSER_SMOKE==='1') {
    const next=await propose('Browser rollback fixture');check((await apply(next)).status,200);
    const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
    browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    await context.addCookies([{name:'uv_admin_session',value:cookies.ADMIN.split('=')[1],url:base}]);
    const page=await context.newPage();await page.goto(`${base}/admin/catalog-revisions?type=course&id=${id}`,{waitUntil:'networkidle'});
    const card=page.locator(`#revision-${next}`);
    await card.getByText('Restore earlier content',{exact:true}).click();
    await card.getByLabel('Why restore earlier content?').fill('Browser rollback review test');
    const response=page.waitForResponse(r=>r.url().endsWith(`/${next}/rollback`)&&r.request().method()==='POST');
    await card.getByRole('button',{name:'Prepare rollback proposal'}).click();
    const prepared=await response;check(prepared.status(),201);const preparedId=(await prepared.json()).id;
    const preparedCard=page.locator(`#revision-${preparedId}`);await preparedCard.waitFor();
    await preparedCard.getByText('Review proposed content changes',{exact:true}).click();
    await preparedCard.getByLabel('Administrator review note').fill('Approved browser rollback');
    const applied=page.waitForResponse(r=>r.url().endsWith(`/${preparedId}`)&&r.request().method()==='PATCH');
    await preparedCard.getByRole('button',{name:'Apply reviewed revision'}).click();check((await applied).status(),200);
    check(content(await current()),content(original));
    await context.addCookies([{name:'uv_admin_session',value:cookies.EDITOR.split('=')[1],url:base}]);await page.reload({waitUntil:'networkidle'});
    check(await page.getByText('Restore earlier content',{exact:true}).count(),0);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await db.query('delete from course where id=$1',[id]);check((await prepare(source)).status,404);
  console.log(`PASS ${checks} rollback checks; fixture records removed and no external delivery attempted.`);
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{
  if(browser) await browser.close();
  await db.query('delete from cms_audit_log where entity_id in (select id::text from catalog_revision where entity_id=any($1::text[]))',[entities]);
  await db.query('delete from catalog_revision where entity_id=any($1::text[])',[entities]);
  await db.query('delete from course where id=any($1::text[])',[entities]);
  await db.query('delete from cms_user where id=any($1::uuid[])',[users]);
  await db.end();
});

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
let checks = 0; let browser, page;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
async function api(role, route, method, body) {
  const response = await fetch(base + route, { method, headers: { Cookie: cookies[role] || '', Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {status:response.status,data:await response.json()};
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
  const template=(await db.query("select * from course where id='mba-muj'")).rows[0];
  assert.ok(template,'Local MUJ seed required');
  await db.query(`insert into course(id,slug,university_id,name,short_name,level,program_type,ugc_approved,stream,fee_inr,duration,status,is_published,data)
    values($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT',false,$11)`,[id,template.university_id,'Online CMS Smoke MBA',template.short_name,template.level,template.program_type,template.ugc_approved,template.stream,template.fee_inr,template.duration,template.data]);
  async function current(){return (await db.query('select to_jsonb(t) snapshot from course t where id=$1',[id])).rows[0].snapshot;}
  function content(row){const keys=['slug','name','short_name','data','university_id','level','program_type','ugc_approved','stream','fee_inr','duration'];return Object.fromEntries(keys.map(key=>[key,row[key]]));}
  async function propose(next){const baseSnapshot=await current();if(next.fee_inr!=null) next={...next,data:{...baseSnapshot.data,feePlans:[],highlights:[]}};return api('EDITOR','/api/admin/catalog-revisions','POST',{entityType:'course',entityId:id,baseSnapshot,content:{...content(baseSnapshot),...next},reason:'Local CMS public-reader fixture'});}
  async function read(route){const response=await fetch(base+route);return {status:response.status,text:await response.text(),cache:response.headers.get('cache-control')};}
  check((await read(`/courses/${id}`)).status,404);
  check((await read('/sitemaps/courses.xml')).text.includes(id),false);
  const proposal=await propose({fee_inr:432123});check(proposal.status,201);
  check((await api('EDITOR',`/api/admin/catalog-revisions/${proposal.data.id}`,'PATCH',{action:'APPLY',note:'Editor must not apply'})).status,403);
  check((await api('ADMIN',`/api/admin/catalog-revisions/${proposal.data.id}`,'PATCH',{action:'APPLY',note:'Apply valid draft fixture'})).status,200);
  check((await read(`/courses/${id}`)).status,404);
  const row=await current();
  const publish={slug:row.slug,universityId:row.university_id,name:row.name,shortName:row.short_name,level:row.level,programType:row.program_type,ugcApproved:row.ugc_approved,stream:row.stream,feeInr:row.fee_inr,duration:row.duration,status:'PUBLISHED',isPublished:true,data:row.data};
  check((await api('EDITOR',`/api/admin/catalog/courses/${id}`,'PATCH',publish)).status,403);
  check((await api('ADMIN',`/api/admin/catalog/courses/${id}`,'PATCH',publish)).status,200);
  const detail=await read(`/courses/${id}`);check(detail.status,200);check(detail.text.includes('4,32,123'),true);
  check(/<meta name="description" content="[^"]*4,32,123/.test(detail.text),true);
  for(const route of ['/courses','/compare','/recommender','/shortlist','/tools/emi-calculator','/lead','/sitemap.xml','/sitemaps/courses.xml','/sitemaps/guides.xml']){
    const page=await read(route);check(page.status,200);check(page.text.includes(id)||page.text.includes('cms-smoke-mba'),true);
  }
  check((await read('/sitemaps/courses.xml')).cache.includes('no-store'),true);
  const update=await propose({fee_inr:456789,eligibility:'ignored'});check(update.status,400); // unknown content keys cannot bypass the schema
  if(process.env.UV_BROWSER_SMOKE==='1') {
    const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
    browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
    page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(`${base}/courses/${id}`,{waitUntil:'networkidle'});
  }
  const fresh=await propose({fee_inr:456789});check(fresh.status,201);
  check((await api('ADMIN',`/api/admin/catalog-revisions/${fresh.data.id}`,'PATCH',{action:'APPLY',note:'Verify no-build fee refresh'})).status,200);
  check((await read(`/courses/${id}`)).text.includes('4,56,789'),true);
  if(page) {
    await page.locator('a[href="/tools/emi-calculator"]').first().click();
    await page.waitForURL('**/tools/emi-calculator');
    await page.locator(`#emi-course option[value="${id}"]`).waitFor({state:'attached'});
    check((await page.locator(`#emi-course option[value="${id}"]`).innerText()).includes('4,56,789'),true);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }

  const invalid=await propose({fee_inr:null});check(invalid.status,201);
  const rejected=await api('ADMIN',`/api/admin/catalog-revisions/${invalid.data.id}`,'PATCH',{action:'APPLY',note:'Invalid public fee must roll back'});
  check(rejected.status,409);check((await current()).fee_inr,456789);
  check((await db.query('select status from catalog_revision where id=$1',[invalid.data.id])).rows[0].status,'NEEDS_REVIEW');
  check((await api('ADMIN',`/api/admin/catalog/courses/${id}`,'PATCH',{...publish,slug:id+'-renamed'})).status,409);
  check((await current()).slug,id);
  check((await api('ADMIN',`/api/admin/catalog/courses/${id}`,'PATCH',{...publish,status:'ARCHIVED',isPublished:false})).status,200);
  check((await read(`/courses/${id}`)).status,404);
  check((await read('/sitemaps/courses.xml')).text.includes(id),false);
  console.log(`PASS ${checks} CMS public-reader checks, including publication without rebuild, validation rollback and withdrawal.`);
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{
  if(browser) await browser.close();
  await db.query('delete from cms_audit_log where entity_id=any($1::text[]) or entity_id in (select id::text from catalog_revision where entity_id=any($1::text[]))',[entities]);
  await db.query('delete from catalog_revision where entity_id=any($1::text[])',[entities]);
  await db.query('delete from course where id=any($1::text[])',[entities]);
  await db.query('delete from cms_user where id=any($1::uuid[])',[users]);
  await db.end();
});

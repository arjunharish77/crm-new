// Local read-only catalog checks with disposable CMS identities; no publication.
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
const connectionString = process.env.UNNATIVIDYA_DATABASE_URL;
if (!connectionString || ![connectionString, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString });
const fixtureIds=[]; const fixtureReason="ui-history-"+randomUUID();
const users = []; let browser, checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
 try {
  await db.connect();
  for(let i=0;i<23;i++){const id=randomUUID();fixtureIds.push(id);await db.query("insert into catalog_revision(id,entity_type,entity_id,base_snapshot,proposed_content,reason,status) values($1,'course','mba-muj','{}','{}',$2,$3)",[id,fixtureReason+' '+i,i<21?'REJECTED':'NEEDS_REVIEW']);}
  browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  for (const role of ['VIEWER']) {
   const id = randomUUID(), email = `fee-review-${id}@example.invalid`;
   await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id,email,'Disposable fee reviewer','not-a-login-password',role]); users.push(id);
   const iat = Math.floor(Date.now()/1000);
   const payload = Buffer.from(JSON.stringify({userId:id,email,role,iat,exp:iat+600})).toString('base64url');
   const token = payload+'.'+createHmac('sha256',process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url');
   const context = await browser.newContext({viewport:{width:390,height:844}});
   await context.addCookies([{name:'uv_admin_session',value:token,url:base}]);
   await context.route('**/*', r => ['GET','HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
   const page=await context.newPage();
   const url=base+'/admin/catalog-revisions?q='+fixtureReason;
   await page.goto(url,{waitUntil:'networkidle'});
   check(await page.locator('section[id^="revision-"]').count(),20);
   await Promise.all([page.waitForURL(/page=2/),page.getByRole('link',{name:'Next page',exact:true}).click()]);await page.getByText('Page 2 of 2',{exact:true}).waitFor();
   check(await page.locator('section[id^="revision-"]').count(),3);check(new URL(page.url()).searchParams.get('q'),fixtureReason);
   await page.goto(url+'&status=NEEDS_REVIEW',{waitUntil:'networkidle'});check(await page.locator('section[id^="revision-"]').count(),2);
   check(await page.getByRole('button',{name:'Apply reviewed revision',exact:true}).count(),0);
   await page.goto(url+'&type=course&id=mba-muj&status=REJECTED',{waitUntil:'networkidle'});
   const next=await page.getByRole('link',{name:'Next page',exact:true}).getAttribute('href');check(next.includes('id=mba-muj'),true);check(next.includes('status=REJECTED'),true);
   check(await page.locator('input[name="id"]').inputValue(),'mba-muj');
   for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   await page.goto(url+'&status=invalid&page=999',{waitUntil:'networkidle'});check(await page.locator('section[id^="revision-"]').count(),3);
   await page.goto(url+'&q=ignored&page=-2',{waitUntil:'networkidle'});check(await page.locator('section[id^="revision-"]').count(),20);
   await page.goto(base+'/admin/catalog-revisions?q=%25',{waitUntil:'networkidle'});check(await page.locator('section[id^="revision-"]').count(),0);
   await page.goto(url+'&type=course&id=mba-muj&status=APPLIED',{waitUntil:'networkidle'});
   check(await page.locator('section[id^="revision-"]').count(),0);check((await page.getByRole('link',{name:'Clear history filters',exact:true}).getAttribute('href')).includes('id=mba-muj'),true);
   await page.goto(url+'&status=NEEDS_REVIEW',{waitUntil:'networkidle'});await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'Revision history',exact:true}).scrollIntoViewIfNeeded();
   if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
   await context.close();
  }
  console.log(`PASS ${checks} revision-history UI checks; no publication actions.`);
 } finally {
  if(browser) await browser.close();
  if(fixtureIds.length)await db.query('delete from catalog_revision where id=any($1::uuid[])',[fixtureIds]);
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

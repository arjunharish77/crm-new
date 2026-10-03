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
const users = []; let browser, checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
 try {
  await db.connect();
  browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  for (const role of ['ADMIN', 'EDITOR', 'VIEWER']) {
   const id = randomUUID(), email = `fee-review-${id}@example.invalid`;
   await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id,email,'Disposable fee reviewer','not-a-login-password',role]); users.push(id);
   const iat = Math.floor(Date.now()/1000);
   const payload = Buffer.from(JSON.stringify({userId:id,email,role,iat,exp:iat+600})).toString('base64url');
   const token = payload+'.'+createHmac('sha256',process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url');
   const context = await browser.newContext({viewport:{width:390,height:844}});
   await context.addCookies([{name:'uv_admin_session',value:token,url:base}]);
   await context.route('**/*', r => ['GET','HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
   const page=await context.newPage();
   for (const [route,kind] of [['courses','course'],['universities','university']]) {
    await page.goto(base+'/admin/'+route,{waitUntil:'networkidle'});
    const total=Number((await db.query(`select count(*) as n from ${kind}`)).rows[0].n);
    check(await page.locator('.quality-record').count(),Math.min(total,12));
    check(await page.getByRole('link',{name:'New '+kind,exact:true}).count(),role==='VIEWER'?0:1);
    for (const width of [320,390,768,1280]) {
     await page.setViewportSize({width,height:900});
     check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
   }
   await page.goto(base+'/admin/courses?university=smu&status=PUBLISHED',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),Number((await db.query("select count(*) as n from course where university_id='smu' and status='PUBLISHED'")).rows[0].n));
   check(await page.locator('.quality-record .admin-tag').evaluateAll(els=>els.every(el=>el.textContent.includes('Sikkim'))),true);
   await page.goto(base+'/admin/courses?status=PUBLISHED',{waitUntil:'networkidle'});
   await Promise.all([page.waitForURL(/page=2/),page.getByRole('link',{name:'Next page',exact:true}).click()]);
   await page.getByText('Page 2 of 3',{exact:true}).waitFor();
   check(new URL(page.url()).searchParams.get('status'),'PUBLISHED');
   check(await page.locator('.quality-record').count(),12);
   await page.goto(base+'/admin/courses?page=999',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),6);
   await page.goto(base+'/admin/courses?q=mba-muj&q=ignored&status=bad&university=bad&page=-3',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),1);
   check(await page.getByRole('link',{name:/View revisions:/}).getAttribute('href'),'/admin/catalog-revisions?type=course&id=mba-muj');
   await page.goto(base+'/admin/universities?q=%25',{waitUntil:'networkidle'});
   check(await page.getByRole('heading',{name:'No matching records',exact:true}).count(),1);
   await Promise.all([page.waitForURL(base+'/admin/universities'),page.getByRole('link',{name:'View all records',exact:true}).click()]);
   await page.locator('.quality-record').first().waitFor();
   check(await page.locator('.quality-record').count(),3);
   await page.goto(base+'/admin/courses?q='+ 'x'.repeat(500),{waitUntil:'networkidle'});
   check((await page.getByLabel('Name or record ID').inputValue()).length,200);
   await page.setViewportSize({width:320,height:900});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(role==='VIEWER' && process.env.UV_SCREENSHOT_PATH) {
    await page.goto(base+'/admin/courses?q=mba-muj',{waitUntil:'networkidle'});
    await page.setViewportSize({width:390,height:844}); await page.locator('.quality-record').scrollIntoViewIfNeeded();
    await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
   }
   await context.close();
  }
  console.log(`PASS ${checks} catalog-queue UI checks; catalog read-only.`);
 } finally {
  if(browser) await browser.close();
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

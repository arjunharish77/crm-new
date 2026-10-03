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
   for (const url of ['/admin/courses/ba-amity','/admin/catalog-revisions?type=course&id=ba-amity']) {
    await page.goto(base+url,{waitUntil:'networkidle'});
    const notice=page.getByRole('complementary',{name:'Fee terms need confirmation'});
    check(await notice.count(),1);
    check((await notice.innerText()).includes('INR 115,200'),true);
    check((await notice.innerText()).includes('does not automatically block publication'),true);
    check(await notice.getByRole('link').getAttribute('href'),'https://amityonline.com/bachelor-of-arts-online');
    for (const width of [320,390,768,1280]) {
     await page.setViewportSize({width,height:900});
     check(await notice.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
     check(await notice.getByRole('link').evaluate(el=>el.getBoundingClientRect().height>=44),true);
    }
   }
   await page.goto(base+'/admin/courses/mba-smu',{waitUntil:'networkidle'});
   check((await page.locator('.fee-review-notice').innerText()).includes('Separate NRI applicability is unconfirmed'),true);
   await page.goto(base+'/admin/courses/mba-muj',{waitUntil:'networkidle'});
   check((await page.locator('.fee-review-notice').innerText()).includes('Nepal, Bhutan'),true);
   await page.goto(base+'/admin/content-quality',{waitUntil:'networkidle'});
   check(await page.getByText('Fee terms have unresolved source findings; review the course notice',{exact:true}).count(),30);
   await context.close();
  }
  console.log(`PASS ${checks} fee-review UI checks; catalog read-only.`);
 } finally {
  if(browser) await browser.close();
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

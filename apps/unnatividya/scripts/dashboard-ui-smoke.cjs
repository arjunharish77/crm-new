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
const fixture = randomUUID();
const users = []; let browser, checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
 try {
  await db.connect();
  await db.query("insert into lead_capture(id,name,email,phone,crm_sync_status,email_otp_verified) values($1,$2,$3,$4,'DISABLED',false)",[fixture,'Long learner name '+ 'x'.repeat(100),'dashboard-'+fixture+'@example.invalid','+19995550000']);
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
   await page.goto(base+'/admin',{waitUntil:'networkidle'});
   check(await page.getByRole('navigation',{name:'Dashboard shortcuts'}).getByRole('link').count(),3);
   check(await page.getByRole('link',{name:'Open lead inbox',exact:true}).getAttribute('href'),'/admin/leads');
   check(await page.locator('.dashboard-lead').count()>0,true);
   check((await page.locator('.dashboard-lead').first().innerText()).includes('Not selected yet'),true);
   check((await page.locator('.dashboard-lead').first().innerText()).includes('DISABLED'),true);
   check(await page.getByText('Course publication',{exact:true}).count(),1);
   check(await page.getByText('Content readiness',{exact:true}).count(),0);
   check(await page.locator('table').count(),0);
   for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    check(await page.locator('.dashboard-sections > section').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth)),true);
   }
   if(role==='VIEWER' && process.env.UV_SCREENSHOT_PATH) {
    await page.setViewportSize({width:390,height:844}); await page.locator('.dashboard-lead').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
   }
   await context.close();
  }
  console.log(`PASS ${checks} dashboard UI checks; synthetic lead delivery disabled.`);
 } finally {
  if(browser) await browser.close();
  await db.query('delete from lead_capture where id=$1',[fixture]);
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

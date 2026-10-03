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
  for(let i=0;i<23;i++) await db.query("insert into crm_sync_attempt(lead_capture_id,trigger_type,status,crm_record_id,error_message,response_status) values($1,'MANUAL',$2,$3,$4,$5)",[fixture,i<21?'SUCCESS':i===21?'FAILED':'DUPLICATE',i===0?'fixture-100%_literal':null,i===21?'Failure '+ 'x'.repeat(600):null,i<21?200:null]);
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
   const url=base+'/admin/crm-sync/history?q='+fixture;
   await page.goto(url,{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),20);
   check(await page.locator('details[open]').count(),0);
   await Promise.all([page.waitForURL(/page=2/),page.getByRole('link',{name:'Next page',exact:true}).click()]);
   await page.getByText('Page 2 of 2',{exact:true}).waitFor();
   check(await page.locator('.quality-record').count(),3);
   check(new URL(page.url()).searchParams.get('q'),fixture);
   await page.goto(url+'&status=SUCCESS&trigger=MANUAL',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),20);
   check(await page.locator('.admin-status.good').count(),20);
   const disclosure=page.locator('summary').first();await disclosure.focus();await page.keyboard.press('Enter');
   check(await page.getByText('Delivery recorded as successful.',{exact:true}).first().isVisible(),true);
   check(await page.getByText('No response yet',{exact:true}).count(),0);
   check(await page.locator('.quality-record a').first().getAttribute('href'),'/admin/leads/'+fixture);
   await page.goto(url+'&status=FAILED',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),1);
   await page.locator('summary').click();
   for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   if(process.env.UV_SCREENSHOT_PATH) {await page.setViewportSize({width:390,height:844});await page.locator('.quality-record').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});}
   await page.goto(base+'/admin/crm-sync/history?q=fixture-100%25_literal',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),1);
   await page.goto(url+'&status=INVALID&trigger=INVALID&page=999',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),3);
   await page.goto(url+'&q=ignored&page=-1',{waitUntil:'networkidle'});
   check(await page.locator('.quality-record').count(),20);
   await page.goto(url+'&status=PROCESSING',{waitUntil:'networkidle'});
   check(await page.getByRole('heading',{name:'No matching delivery attempts',exact:true}).count(),1);
   await context.close();
  }
  console.log(`PASS ${checks} delivery-history UI checks; synthetic lead delivery disabled.`);
 } finally {
  if(browser) await browser.close();
  await db.query('delete from lead_capture where id=$1',[fixture]);
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

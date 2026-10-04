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
   // Block every configuration request before loading the page. No request is forwarded.
   await page.route('**/api/admin/crm-sync/config',r=>r.abort());
   await page.goto(base+'/admin/crm-sync',{waitUntil:'networkidle'});
   const form=page.locator('.crm-config-form');
   check(await form.locator('fieldset').count(),3);
   await form.getByLabel('API base URL',{exact:true}).fill('https://example.invalid');
   await form.getByLabel('Headers JSON',{exact:true}).fill('[]');
   await form.getByRole('button',{name:'Save sync settings',exact:true}).click();
   await form.getByRole('alert').waitFor();
   check((await form.getByRole('alert').innerText()).includes('JSON object'),true);
   await form.getByLabel('Headers JSON',{exact:true}).fill('{}');
   await form.getByLabel('Success HTTP codes',{exact:true}).fill('200,,201');
   await form.getByRole('button',{name:'Save sync settings',exact:true}).click();
   await form.getByRole('alert').filter({hasText:'without empty entries'}).waitFor();
   check(await form.getByRole('button',{name:'Save sync settings',exact:true}).isEnabled(),true);
   await form.getByLabel('Success HTTP codes',{exact:true}).fill('200,201');
   await form.getByRole('button',{name:'Save sync settings',exact:true}).click();
   await form.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();
   check(await form.getByRole('button',{name:'Save sync settings',exact:true}).isEnabled(),true);
   check(await form.getByLabel('API base URL',{exact:true}).inputValue(),'https://example.invalid');
   await page.route('**/api/admin/crm-sync/config',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Mock rejected settings'})}));
   await form.getByRole('button',{name:'Save sync settings',exact:true}).click();
   await form.getByText('Mock rejected settings',{exact:true}).waitFor();
   check(await form.getByRole('button',{name:'Save sync settings',exact:true}).isEnabled(),true);
   await page.route('**/api/admin/crm-sync/config',r=>r.fulfill({contentType:'application/json',body:'{}'}));
   await form.getByRole('button',{name:'Save sync settings',exact:true}).click();
   await form.getByRole('status').waitFor();
   check((await form.getByRole('status').innerText()).includes('does not test the connection'),true);
   for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    check(await form.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   }
   await page.setViewportSize({width:390,height:844});await form.locator('fieldset').first().scrollIntoViewIfNeeded();
   if(process.env.UV_SCREENSHOT_PATH) await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
   await context.close();
  }
  console.log(`PASS ${checks} CRM-config UI checks; all saves blocked or mocked.`);
 } finally {
  if(browser) await browser.close();
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

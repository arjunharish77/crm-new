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
   await page.route('**/api/admin/crm-sync/mapping',r=>r.abort());
   await page.goto(base+'/admin/crm-sync/mappings',{waitUntil:'networkidle'});
   const form=page.locator('form.form-grid');
   check(await page.locator('.crm-mapping-layout article h2').first().innerText(),'JSON body template');
   await form.getByLabel('Mapping name',{exact:true}).fill('Unsaved test mapping');
   await form.getByLabel('Request body JSON',{exact:true}).fill('[]');
   await form.getByRole('button',{name:'Save active mapping',exact:true}).click();
   await form.getByRole('alert').waitFor();
   check((await form.getByRole('alert').innerText()).includes('JSON object'),true);
   const template=JSON.stringify({name:'{{lead.name}}'});
   await form.getByLabel('Request body JSON',{exact:true}).fill(template);
   await form.getByRole('button',{name:'Save active mapping',exact:true}).click();
   await form.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();
   check(await form.getByLabel('Mapping name',{exact:true}).inputValue(),'Unsaved test mapping');
   check(await form.getByLabel('Request body JSON',{exact:true}).inputValue(),template);
   check(await form.getByRole('button',{name:'Save active mapping',exact:true}).isEnabled(),true);
   await page.route('**/api/admin/crm-sync/mapping',r=>r.fulfill({contentType:'application/json',body:'{}'}));
   await form.getByRole('button',{name:'Save active mapping',exact:true}).click();
   await form.getByRole('status').waitFor();
   check((await form.getByRole('status').innerText()).includes('active version'),true);
   await page.getByLabel('Find a merge field',{exact:true}).fill('lead.email');
   check(await page.locator('.admin-token').count()>0,true);
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('blocked')}}}));
   await page.locator('.admin-token').first().click();
   await page.getByText(/Could not copy/).waitFor();
   check(await page.getByText(/copy it manually/).count(),1);
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}}));
   await page.locator('.admin-token').first().click();await page.getByText(/^Copied/).waitFor();
   check(await page.getByText(/^Copied/).count(),1);
   await page.getByLabel('Find a merge field',{exact:true}).fill('not-a-token');
   check(await page.getByText('No matching fields. Try another search.',{exact:true}).count(),1);
   await page.getByLabel('Find a merge field',{exact:true}).fill('');
   for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   await page.setViewportSize({width:390,height:844});
   await page.getByLabel('Find a merge field',{exact:true}).blur(); await page.evaluate(()=>window.scrollTo(0,0));
   if(process.env.UV_SCREENSHOT_PATH) await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
   await context.close();
  }
  console.log(`PASS ${checks} CRM mapping UI checks; saves blocked or mocked.`);
 } finally {
  if(browser) await browser.close();
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

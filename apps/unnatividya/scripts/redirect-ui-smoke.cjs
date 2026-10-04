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
  await db.query("insert into seo_redirect(id,from_path,to_path,status_code,is_active,reason) values($1,$2,$3,301,false,$4)",[fixture,'/ui-test-'+fixture,'/courses/'+ 'x'.repeat(200),'Disposable UI test']);
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
   await page.goto(base+'/admin/redirects',{waitUntil:'networkidle'});
   const card=page.locator('.quality-record').filter({hasText:'/ui-test-'+fixture});
   check(await card.count(),1);
   check(await card.getByText('Inactive',{exact:true}).count(),1);
   for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    check(await card.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   }
   await card.getByRole('button',{name:'Enable',exact:true}).click();
   await card.getByRole('alert').waitFor();
   check(await card.getByRole('button',{name:'Enable',exact:true}).isEnabled(),true);
   await page.route('**/api/admin/seo/redirects/'+fixture,r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Mock validation error'})}));
   await card.getByRole('button',{name:'Delete',exact:true}).click();
   await card.getByText('Mock validation error',{exact:true}).waitFor();
   check(await card.getByRole('button',{name:'Delete',exact:true}).isEnabled(),true);
   const form=page.locator('form.admin-form-grid');
   await form.getByLabel('From path',{exact:true}).fill('/not-saved-'+fixture);
   await form.getByLabel('To path',{exact:true}).fill('/courses');
   await form.getByRole('button',{name:'Save redirect',exact:true}).click();
   await form.getByRole('alert').waitFor();
   check(await form.getByRole('button',{name:'Save redirect',exact:true}).isEnabled(),true);
   await page.route('**/api/admin/seo/redirects',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:'mock-only'})}));
   await form.getByRole('button',{name:'Save redirect',exact:true}).click();
   await form.getByRole('status').waitFor();
   check(await form.getByRole('status').innerText(),'Redirect saved.');
   if(role==='VIEWER' && process.env.UV_SCREENSHOT_PATH) {await page.setViewportSize({width:390,height:844});await card.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});}
   await context.close();
  }
  console.log(`PASS ${checks} redirect UI checks; all mutations blocked or mocked.`);
 } finally {
  if(browser) await browser.close();
  await db.query('delete from seo_redirect where id=$1',[fixture]);
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

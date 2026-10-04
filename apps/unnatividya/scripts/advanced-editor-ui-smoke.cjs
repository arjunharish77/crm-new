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
   await page.route('**/api/admin/catalog/**',r=>r.abort());
   for(const [kind,record] of [['course','mba-muj'],['university','muj']]) {
    const plural=kind==='course'?'courses':'universities';
    await page.goto(base+'/admin/'+plural+'/'+record,{waitUntil:'networkidle'});
    await page.getByText('Advanced record settings',{exact:true}).click();
    const form=page.locator('form').filter({has:page.locator('.admin-catalog-fields')});
    const save=form.getByRole('button',{name:'Save '+kind,exact:true});
    check(await save.isEnabled(),role==='ADMIN');
    if(role==='ADMIN') {
     const name=form.getByLabel(kind==='course'?'Course name':'University name',{exact:true});await name.fill('Unsaved UI check');
     await form.getByLabel('Structured data JSON',{exact:true}).fill('[]');await save.click();await form.getByRole('alert').waitFor();
     check((await form.getByRole('alert').innerText()).includes('JSON object'),true);check(await name.inputValue(),'Unsaved UI check');
     await form.getByLabel('Structured data JSON',{exact:true}).fill('{}');await save.click();await form.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();
     check(await name.inputValue(),'Unsaved UI check');check(await save.isEnabled(),true);
     await page.route('**/api/admin/catalog/'+plural+'/'+record,r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Mock invalid record',issues:[{field:'data',message:'Mock source check'}]})}));
     await save.click();await form.getByRole('alert').filter({hasText:'Mock invalid record'}).waitFor();check(await name.inputValue(),'Unsaved UI check');
     await page.route('**/api/admin/catalog/'+plural+'/'+record,r=>r.fulfill({contentType:'application/json',body:'{}'}));await save.click();await form.getByRole('status').waitFor();check(await name.inputValue(),'Unsaved UI check');
    }
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   }
   await context.close();
  }
  console.log(`PASS ${checks} advanced-editor UI checks; all catalog writes blocked or mocked.`);
 } finally {
  if(browser) await browser.close();
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

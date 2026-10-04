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
const pendingId=randomUUID(),appliedId=randomUUID();
const users = []; let browser, checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
 try {
  await db.connect();
  for(const [id,status] of [[pendingId,'NEEDS_REVIEW'],[appliedId,'APPLIED']])await db.query("insert into catalog_revision(id,entity_type,entity_id,base_snapshot,proposed_content,reason,status) values($1,'course','mba-muj','{}','{}','Disposable feedback test',$2)",[id,status]);
  browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  for (const role of ['ADMIN']) {
   const id = randomUUID(), email = `fee-review-${id}@example.invalid`;
   await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id,email,'Disposable fee reviewer','not-a-login-password',role]); users.push(id);
   const iat = Math.floor(Date.now()/1000);
   const payload = Buffer.from(JSON.stringify({userId:id,email,role,iat,exp:iat+600})).toString('base64url');
   const token = payload+'.'+createHmac('sha256',process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url');
   const context = await browser.newContext({viewport:{width:390,height:844}});
   await context.addCookies([{name:'uv_admin_session',value:token,url:base}]);
   await context.route('**/*', r => ['GET','HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
   const page=await context.newPage();
   await page.route('**/api/admin/catalog-revisions/**',r=>r.abort());
   await page.goto(base+'/admin/catalog-revisions?q='+pendingId,{waitUntil:'networkidle'});
   const note=page.getByLabel('Administrator review note',{exact:true});await note.fill('Keep this review note after a failed request.');
   await page.getByRole('button',{name:'Apply reviewed revision',exact:true}).click();await page.locator('.catalog-revisions').getByRole('alert').waitFor();
   check(await note.inputValue(),'Keep this review note after a failed request.');check(await page.getByRole('button',{name:'Apply reviewed revision',exact:true}).isEnabled(),true);
   check((await page.locator('.catalog-revisions').getByRole('alert').innerText()).includes('may have completed'),true);
   await page.route('**/api/admin/catalog-revisions/'+pendingId,r=>{check(r.request().postDataJSON().action,'REJECT');return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Mock conflict'})});});
   await page.getByRole('button',{name:'Reject revision',exact:true}).click();await page.getByText('Mock conflict',{exact:true}).waitFor();
   check(await note.inputValue(),'Keep this review note after a failed request.');
   await page.route('**/api/admin/catalog-revisions/'+pendingId,r=>{check(r.request().postDataJSON().action,'REJECT');return r.fulfill({contentType:'application/json',body:'{}'});});
   await page.getByRole('button',{name:'Reject revision',exact:true}).click();await page.getByText('Revision rejected. Catalog unchanged.',{exact:true}).waitFor();checks++;
   await page.goto(base+'/admin/catalog-revisions?q='+appliedId,{waitUntil:'networkidle'});await page.getByText('Restore earlier content',{exact:true}).click();
   const rollback=page.getByLabel('Why restore earlier content?',{exact:true});await rollback.fill('Keep this rollback explanation.');
   await page.getByRole('button',{name:'Prepare rollback proposal',exact:true}).click();await page.locator('.catalog-revisions').getByRole('alert').waitFor();
   check(await rollback.inputValue(),'Keep this rollback explanation.');check(await page.getByRole('button',{name:'Prepare rollback proposal',exact:true}).isEnabled(),true);
   check((await db.query('select status from catalog_revision where id=$1',[pendingId])).rows[0].status,'NEEDS_REVIEW');
   check((await db.query('select count(*)::int as n from catalog_revision where rollback_of=$1',[appliedId])).rows[0].n,0);
   await context.close();
  }
  console.log(`PASS ${checks} revision-feedback checks; apply/reject/rollback requests blocked or mocked.`);
 } finally {
  if(browser) await browser.close();
  await db.query('delete from catalog_revision where id=any($1::uuid[])',[[pendingId,appliedId]]);
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

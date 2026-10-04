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
   const url=base+'/admin/catalog-preview';
   await page.goto(url,{waitUntil:'networkidle'});
   check(await page.locator('.preview-course').count(),12);
   check(await page.locator('.preview-university').count(),3);
   check(await page.locator('details[open]').count(),0);
   for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   await Promise.all([page.waitForURL(/page=2/),page.getByRole('link',{name:'Next page',exact:true}).click()]);
   await page.getByText('Page 2 of 3',{exact:true}).waitFor();
   check(await page.locator('.preview-course').count(),12);
   await page.goto(url+'?page=999',{waitUntil:'networkidle'});
   check(await page.locator('.preview-course').count(),6);
   await page.goto(url+'?university=smu',{waitUntil:'networkidle'});
   check(await page.locator('.preview-course').count(),9);
   check(await page.locator('.preview-university').count(),3);
   const disclosure=page.locator('.preview-course summary').first();await disclosure.focus();await page.keyboard.press('Enter');
   check(await page.locator('details[open]').count(),1);
   await page.goto(url+'?q=mba-muj&q=ignored&university=invalid&page=-1',{waitUntil:'networkidle'});
   check(await page.locator('.preview-course').count(),1);
   check(await page.locator('.preview-course').getByRole('link',{name:'Review course: mba-muj',exact:true}).getAttribute('href'),'/admin/catalog-revisions?type=course&id=mba-muj');
   check((await page.locator('.preview-course').getByRole('link',{name:'Open public page',exact:true}).getAttribute('href')).startsWith('/courses/'),true);
   await page.goto(url+'?q=%25',{waitUntil:'networkidle'});
   check(await page.getByRole('heading',{name:'No matching published courses',exact:true}).count(),1);
   await Promise.all([page.waitForURL(url),page.getByRole('link',{name:'View all published courses',exact:true}).click()]);
   await page.locator('.preview-course').first().waitFor();check(await page.locator('.preview-course').count(),12);
   await page.goto(url+'?q='+ 'x'.repeat(500),{waitUntil:'networkidle'});
   check((await page.getByLabel('Course name or ID').inputValue()).length,200);
   await page.goto(url+'?q=mba-muj',{waitUntil:'networkidle'});await page.setViewportSize({width:390,height:844});await page.locator('.preview-course summary').click();await page.locator('.preview-course').scrollIntoViewIfNeeded();
   if(process.env.UV_SCREENSHOT_PATH) await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
   await context.close();
  }
  console.log(`PASS ${checks} catalog-preview UI checks; catalog read-only.`);
 } finally {
  if(browser) await browser.close();
  for(const id of users) await db.query('delete from cms_user where id=$1',[id]);
  await db.end();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

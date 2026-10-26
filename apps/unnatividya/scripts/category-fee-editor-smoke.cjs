// Student-category fees entered by hand in the CMS (Wave 5 E1, decision V11). Local only. A disposable
// editor fills the form for Amity's MBA with every write blocked, so nothing is saved; the check is
// that the unsaved proposal holds exactly what was typed. The identity is deleted afterwards.
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![dbUrl, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
let checks = 0; const check = (a, b) => { assert.deepEqual(a, b); checks++; };

(async () => {
 const db = new Client({ connectionString: dbUrl }); await db.connect();
 const id = randomUUID(), email = `category-fees-${id}@example.invalid`;
 await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id, email, 'Disposable fee editor', 'not-a-login-password', 'EDITOR']);
 const browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
 try {
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ userId: id, email, role: 'EDITOR', iat, exp: iat + 600 })).toString('base64url');
  const token = payload + '.' + createHmac('sha256', process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'uv_admin_session', value: token, url: base }]);
  let blocked = 0;
  await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : (blocked++, route.abort()));
  const page = await context.newPage();
  await page.goto(base + '/admin/catalog-revisions?type=course&id=mba-amity', { waitUntil: 'load' });
  const section = page.getByRole('region', { name: 'Student-category fees' });
  check(await section.isVisible(), true);
  const proposal = async () => JSON.parse(await page.locator('#revision-content').inputValue()).data.categoryFees;
  const before = await proposal();
  check(before, undefined);
  await section.getByRole('button', { name: 'Add category fee row' }).click();
  await section.getByLabel('Official source URL').fill('https://amityonline.com/master-of-business-administration-online');
  await section.getByLabel('Source label').fill('Amity international fee page, read 24 October 2026');
  await section.getByLabel('Checked on').fill('2026-10-24');
  await section.getByLabel('Applicant category 1').fill('International applicants');
  check(await section.getByLabel('Currency 1').inputValue(), 'USD');
  await section.getByLabel('Total 1').fill('5000');
  await section.getByLabel('Per semester 1').fill('1250');
  await section.getByLabel('Semesters 1').fill('4');
  check(await proposal(), {
   checkedAt: '2026-10-24', sourceUrl: 'https://amityonline.com/master-of-business-administration-online', sourceLabel: 'Amity international fee page, read 24 October 2026',
   rows: [{ category: 'International applicants', currency: 'USD', total: 5000, perSemester: 1250, semesters: 4 }],
  });
  // A second row, then removing both clears the block from the proposal.
  await section.getByRole('button', { name: 'Add category fee row' }).click();
  check((await proposal()).rows.length, 2);
  await section.getByRole('button', { name: 'Remove category fee row 2' }).click();
  await section.getByRole('button', { name: 'Remove category fee row 1' }).click();
  check(await proposal(), undefined);
  check(await section.locator('input, select, button').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 36)), true);
  check(blocked, 0);
  await context.close();
  console.log(`PASS ${checks} category-fee editor checks; nothing saved.`);
 } finally {
  await browser.close();
  await db.query('delete from cms_audit_log where user_id=$1', [id]).catch(() => {});
  await db.query('delete from cms_user where id=$1', [id]).catch(() => {});
  await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exitCode = 1; });

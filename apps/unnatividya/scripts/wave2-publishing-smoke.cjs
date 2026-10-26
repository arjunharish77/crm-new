// Wave 2 publishing checks (next-phase plan §3): prepared category fees, UGC-DEB recognition and
// intakes. Local only. Part A loads prepared items in the editor with every write blocked. Part B
// writes the prepared values straight into two local course records, checks the public pages,
// then restores the original records. Disposable CMS identities are deleted afterwards.
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
const connectionString = process.env.UNNATIVIDYA_DATABASE_URL;
if (!connectionString || ![connectionString, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const categoryFees = require('../src/data/prepared-category-fees.json');
const feeCorrections = require('../src/data/prepared-fee-corrections.json');
const recognition = require('../src/data/prepared-recognition.json');
const db = new Client({ connectionString });
const users = []; const originals = []; let browser, checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
async function page(url) { const response = await fetch(base + url); check(response.status, 200); return text(await response.text()); }
function iso(offsetDays) { const date = new Date(Date.now() + offsetDays * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date); }

(async () => {
 try {
  await db.connect();
  browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });

  // Part A: editor panels load prepared items into the unsaved proposal only.
  const id = randomUUID(), email = `wave2-${id}@example.invalid`;
  await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id, email, 'Disposable wave 2 editor', 'not-a-login-password', 'EDITOR']); users.push(id);
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ userId: id, email, role: 'EDITOR', iat, exp: iat + 600 })).toString('base64url');
  const token = payload + '.' + createHmac('sha256', process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'uv_admin_session', value: token, url: base }]);
  let blocked = 0;
  await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : (blocked++, route.abort()));
  const editor = await context.newPage();
  await editor.goto(base + '/admin/catalog-revisions?type=course&id=mba-muj', { waitUntil: 'load' });
  // New-batch fees (12 October 2026): the fee correction is loaded first, then the category fees that match it.
  await editor.getByRole('button', { name: 'Load coordinated fee correction' }).click();
  await editor.getByRole('button', { name: 'Load student-category fees' }).click();
  await editor.getByRole('button', { name: 'Load recognition result' }).click();
  const proposal = JSON.parse(await editor.locator('#revision-content').inputValue());
  check(proposal.data.categoryFees.rows.map(row => row.category), ['Indian applicants', 'NRI applicants', 'Foreign nationals']);
  check(proposal.data.recognition.status, 'listed');
  check(proposal.data.sourceUrls.includes(proposal.data.recognition.sourceUrl), true);
  check(blocked, 0);
  await editor.goto(base + '/admin/publishing-checklist', { waitUntil: 'load' });
  check(await editor.getByRole('heading', { name: 'Publishing checklist' }).isVisible(), true);
  check(await editor.locator('.checklist-table tbody tr').count() >= 30, true);
  await context.close();

  // Part B: public pages once the values are published (restored in finally).
  const targets = { 'mba-muj': {}, 'mba-smu': {}, 'bcom-amity': {} };
  for (const courseId of Object.keys(targets)) {
   const row = (await db.query('select data, fee_inr, updated_at from course where id=$1', [courseId])).rows[0];
   originals.push({ courseId, data: row.data, fee_inr: row.fee_inr, updated_at: row.updated_at });
   const fees = categoryFees.find(item => item.courseId === courseId);
   const result = recognition.find(item => item.courseId === courseId);
   const data = { ...row.data, recognition: result.recognition, ...(fees ? { categoryFees: fees.categoryFees } : {}) };
   // A new-batch fee is published with its coordinated correction (plans, EMI and highlights), as an administrator would.
   const correction = feeCorrections.find(item => item.courseId === courseId && fees && item.fee === fees.expectedFee);
   if (correction) {
    if (correction.feePlans) data.feePlans = correction.feePlans;
    if (correction.emi) data.emi = correction.emi;
    if (correction.highlights) data.highlights = [...(data.highlights || []).filter(item => !/^(total fee|emi from|financing)$/i.test(String(item[0]).trim())), ...correction.highlights];
   }
   if (courseId === 'mba-muj') data.intakes = [
    { label: 'Past intake', applicationDeadline: iso(-3), sourceUrl: 'https://www.onlinemanipal.com/', checkedAt: iso(-10) },
    { label: 'Test intake', applicationDeadline: iso(20), sourceUrl: 'https://www.onlinemanipal.com/', checkedAt: iso(-1) },
   ];
   // Category fees and the course fee are published together (the validator requires the INR row to match).
   await db.query('update course set data=$2, fee_inr=$3 where id=$1', [courseId, data, fees ? fees.expectedFee : row.fee_inr]);
  }

  const muj = await page('/courses/mba-muj');
  check(muj.includes('UGC-DEB 2026-27: listed'), true);
  check(muj.includes('Manipal University, Rajasthan (S.No. 74)'), true);
  check(muj.includes('Test intake · apply by'), true);
  check(muj.includes('Past intake'), false);
  const mujFees = categoryFees.find(item => item.courseId === 'mba-muj');
  check(muj.includes(mujFees.categoryFees.sourceLabel), true);
  check(muj.includes('Yes, for the 2026-27 session'), true);
  const amity = await page('/courses/bcom-amity');
  // Owner decision (plan §11 #15): Amity University Uttar Pradesh awards this degree.
  check(amity.includes('UGC-DEB 2026-27: listed'), true);
  check(amity.includes('Amity University Uttar Pradesh (S.No. 19)'), true);
  check(amity.includes('printed as valid up to January 2027'), true);
  check(amity.includes('Not yet announced'), true);
  const pair = await page('/compare/mba/manipal-university-jaipur-vs-sikkim-manipal-university');
  check(pair.includes('Both Online MBA programs are on the UGC-DEB online list'), true);
  check(pair.includes('NRI applicants: US$2,772'), true);
  const guide = await page('/online-degree-guides/mba-ugc-approval');
  check(guide.includes('On the 2026-27 list'), true);
  check(guide.includes('Check in progress'), true); // mba-amity has no applied result in this test
  check(guide.includes('directly verified'), false);

  const course = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await course.goto(base + '/courses/mba-muj#sec-fees', { waitUntil: 'load' });
  const fees = course.locator('.uvcd-fees');
  check(await fees.locator('.uvcd-fee-result').innerText().then(value => value.includes('₹' + mujFees.expectedFee.toLocaleString('en-IN'))), true);
  await fees.getByLabel('NRI applicants').check();
  check(await fees.locator('.uvcd-fee-result').innerText().then(value => value.includes('US$2,772') && value.includes('US$693 × 4')), true);
  for (const label of ['Indian applicants', 'NRI applicants', 'Foreign nationals']) check(await fees.getByText(label, { exact: true }).evaluate(el => el.closest('label').getBoundingClientRect().height >= 44), true);
  check(await course.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log(`PASS ${checks} wave 2 publishing checks; local records restored, no proposals saved.`);
 } finally {
  for (const original of originals) await db.query('update course set data=$2, fee_inr=$3, updated_at=$4 where id=$1', [original.courseId, original.data, original.fee_inr, original.updated_at]).catch(error => console.error('RESTORE FAILED', original.courseId, error.message));
  if (users.length) await db.query('delete from cms_user where id = any($1::uuid[])', [users]).catch(() => {});
  await browser?.close(); await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exit(1); });

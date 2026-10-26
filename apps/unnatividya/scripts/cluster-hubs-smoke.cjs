// Wave 5 cluster hubs D1–D4. Local only. Public checks, plus one temporary category fee block on a
// local course (MUJ MBA) for the international hub, restored exactly. No lead or OTP submissions.
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![dbUrl, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
let checks = 0; const check = (a, b) => { assert.deepEqual(a, b); checks++; };
const RANKING = /\b(best|cheapest|top pick|winner|recommended)\b/i;
const HUBS = {
 computing: { sections: ['after-12', 'after-degree'], degrees: ['Online BCA', 'Online MCA', 'Online MSc Data Science', 'Online MSc Mathematics'] },
 'commerce-humanities': { sections: ['commerce-business', 'humanities', 'media'], degrees: ['Online B.Com', 'Online B.Com Honours', 'Online BBA', 'Online M.Com', 'Online BA', 'Online BA JMC', 'Online MA JMC'] },
 'online-learning': { sections: ['ol-rules', 'ol-classes', 'ol-exams', 'ol-time'] },
 international: { sections: ['intl-fees', 'intl-documents', 'intl-exams', 'intl-deb'] },
};

(async () => {
 const db = new Client({ connectionString: dbUrl }); await db.connect();
 const original = (await db.query("select data, updated_at, fee_inr from course where id='mba-muj'")).rows[0];
 let browser;
 try {
  // Launched inside try, so a failed launch still closes the database connection below.
  browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Kolkata' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const [slug, spec] of Object.entries(HUBS)) {
   const response = await page.goto(`${base}/online-degree-guides/${slug}`, { waitUntil: 'load' });
   check([slug, response.status()], [slug, 200]);
   for (const id of spec.sections) check([slug, id, await page.locator(`#${id}`).count()], [slug, id, 1]);
   if (spec.degrees) { const shown = await page.locator('.uv-family-degree h3').allTextContents(); check([slug, spec.degrees.every(name => shown.includes(name))], [slug, true]); }
   check([slug, RANKING.test(await page.locator('main').innerText())], [slug, false]);
   check([slug, await page.locator('script[type="application/ld+json"]').evaluateAll(els => els.some(el => el.textContent.includes('"FAQPage"')))], [slug, true]);
   check([slug, await page.locator('.uv-read-byline').first().innerText().then(text => text.includes('Content Team, Unnati Vidya'))], [slug, true]);
   const links = [...new Set(await page.locator('main a[href^="/"]').evaluateAll(els => els.map(el => el.getAttribute('href').split('#')[0])))].filter(href => !href.startsWith('/lead'));
   for (const href of links) { const r = await page.request.get(base + href); check([slug, href, r.status()], [slug, href, 200]); }
   for (const width of [320, 390]) { await page.setViewportSize({ width, height: 900 }); check([slug, width, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)], [slug, width, true]); }
   await page.setViewportSize({ width: 1280, height: 900 });
  }
  // The guides hub links to every cluster hub.
  await page.goto(`${base}/online-degree-guides`, { waitUntil: 'load' });
  const cards = await page.locator('.uv-g-hublinks a').evaluateAll(els => els.map(el => el.getAttribute('href')));
  for (const slug of Object.keys(HUBS)) check(cards.includes(`/online-degree-guides/${slug}`), true);
  // International hub: "Confirm" with nothing published; the USD amount once a block is published.
  await page.goto(`${base}/online-degree-guides/international`, { waitUntil: 'load' });
  const mbaRow = () => page.locator('#intl-mba tbody tr').filter({ hasText: 'MUJ' });
  if (!original.data.categoryFees) check(await mbaRow().innerText().then(text => text.includes('Confirm with the university')), true);
  const fees = { checkedAt: '2026-10-24', sourceUrl: 'https://www.onlinemanipal.com/online-mba-manipal-university-jaipur', sourceLabel: 'Cluster hub smoke test data', rows: [{ category: 'Indian applicants', currency: 'INR', total: original.fee_inr, perSemester: original.fee_inr / 4, semesters: 4 }, { category: 'NRI applicants', currency: 'USD', total: 2772, perSemester: 693, semesters: 4 }, { category: 'Foreign nationals', currency: 'USD', total: 3200, perSemester: 800, semesters: 4 }] };
  await db.query("update course set data=jsonb_set(data,'{categoryFees}',$1::jsonb), updated_at=now() where id='mba-muj'", [JSON.stringify(fees)]);
  await page.goto(`${base}/online-degree-guides/international`, { waitUntil: 'load' });
  const row = await mbaRow().innerText();
  check([row.includes('US$2,772'), row.includes('US$3,200'), row.includes('NRI applicants'), row.includes('Foreign nationals')], [true, true, true, true]);
  check(await page.locator('#intl-fees .uv-read-prose').innerText().then(text => /\d+ of the \d+ programs have a published fee/.test(text)), true);
  check(await page.locator('a[href="/tools/document-checklist?category=nri"]').count() > 0, true);
  // The checklist opens on the category the link names.
  await page.goto(`${base}/tools/document-checklist?category=foreign`, { waitUntil: 'load' });
  check(await page.getByRole('radio', { name: /Foreign/ }).isChecked(), true);
  check(errors, []);
  console.log(`PASS ${checks} cluster hub checks; course record restored.`);
 } finally {
  await db.query('update course set data=$2, updated_at=$3 where id=$1', ['mba-muj', original.data, original.updated_at]).catch(error => console.error('RESTORE FAILED', error.message));
  await browser?.close(); await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exitCode = 1; });

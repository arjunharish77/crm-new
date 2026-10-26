// Fees by visitor location (Wave 5 E2–E3, decisions V11–V13). Local only. Runs the browser in an
// India and a London time zone; for the USD paths it gives two local course records a category fee
// block (MUJ MBA: Indian, NRI, foreign; SMU MBA: Indian, international) and restores them exactly.
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![dbUrl, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
let checks = 0; const check = (a, b) => { assert.deepEqual(a, b); checks++; };
const SOURCE = { checkedAt: '2026-10-24', sourceUrl: 'https://www.onlinemanipal.com/online-mba-manipal-university-jaipur', sourceLabel: 'Fee-group smoke test data' };

(async () => {
 const db = new Client({ connectionString: dbUrl }); await db.connect();
 const originals = (await db.query("select id, data, updated_at, fee_inr from course where id in ('mba-muj','mba-smu') order by id")).rows;
 check(originals.length, 2);
 const muj = originals.find(row => row.id === 'mba-muj'), smu = originals.find(row => row.id === 'mba-smu');
 const browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
 try {
  // The server HTML is always the Indian fee, whatever the visitor's location.
  const html = await (await fetch(base + '/courses/mba-muj')).text();
  check(html.includes(`₹${muj.fee_inr.toLocaleString('en-IN')}`), true);
  // India: Indian fees, the switch says so and offers to change.
  const india = await browser.newContext({ timezoneId: 'Asia/Kolkata', viewport: { width: 1280, height: 900 } });
  let page = await india.newPage();
  await page.goto(base + '/courses', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#course-fee-group')?.value === 'indian' && document.readyState === 'complete');
  check(await page.getByLabel('Showing fees for').inputValue(), 'indian');
  check(await page.locator('.uvc-fee-group small').innerText().then(t => t.includes('time zone')), true);
  check(await page.locator('.uv-card-stats').first().innerText().then(t => /₹/.test(t)), true);
  // Desktop layout: the filters span every row, so the switch and results sit straight under the
  // count instead of below the full height of the filter panel.
  const layout = await page.evaluate(() => Object.fromEntries(['.uvc-filters', '.uvc-count', '.uvc-fee-group', '.uvc-results'].map(s => [s, document.querySelector(s).getBoundingClientRect().top])));
  check([layout['.uvc-fee-group'] - layout['.uvc-count'] < 120, layout['.uvc-results'] - layout['.uvc-filters'] < 250], [true, true]);
  await india.close();
  // London, before any category fees exist: no rupee tuition is passed off as an international fee.
  const london = await browser.newContext({ timezoneId: 'Europe/London', viewport: { width: 1280, height: 900 } });
  page = await london.newPage();
  await page.goto(base + '/courses', { waitUntil: 'load' });
  // The server renders "indian"; the browser switches after hydration.
  await page.waitForFunction(() => document.querySelector('#course-fee-group')?.value === 'nri');
  const firstCard = page.locator('.uv-card-stats').first();
  await firstCard.getByText('Ask for the international fee').waitFor();
  check(await firstCard.innerText().then(t => t.includes('Indian applicants only')), true);
  // Publish test category fees (the INR rows equal the course fee, as the validator requires).
  const mujFees = { ...SOURCE, rows: [{ category: 'Indian applicants', currency: 'INR', total: muj.fee_inr, perSemester: muj.fee_inr / 4, semesters: 4 }, { category: 'NRI applicants', currency: 'USD', total: 2772, perSemester: 693, semesters: 4 }, { category: 'Foreign nationals', currency: 'USD', total: 3200, perSemester: 800, semesters: 4 }] };
  const smuFees = { ...SOURCE, rows: [{ category: 'Indian applicants', currency: 'INR', total: smu.fee_inr, perSemester: smu.fee_inr / 4, semesters: 4 }, { category: 'International applicants', currency: 'USD', total: 2400, perSemester: 600, semesters: 4 }] };
  await db.query('update course set data=jsonb_set(data,\'{categoryFees}\',$2::jsonb), updated_at=now() where id=$1', ['mba-muj', JSON.stringify(mujFees)]);
  await db.query('update course set data=jsonb_set(data,\'{categoryFees}\',$2::jsonb), updated_at=now() where id=$1', ['mba-smu', JSON.stringify(smuFees)]);
  // Course page: the selector starts on NRI; the headline and enquiry card follow; EMI pill hidden.
  await page.goto(base + '/courses/mba-muj', { waitUntil: 'load' });
  await page.getByRole('radio', { name: 'NRI applicants' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.uvcd-fee-result')?.textContent.includes('US$2,772'));
  check(await page.getByRole('radio', { name: 'NRI applicants' }).isChecked(), true);
  check(await page.locator('.uvcd-stats').innerText().then(t => t.includes('US$2,772')), true);
  check(await page.locator('.uvcd-rail-fee').innerText(), 'US$2,772');
  check(await page.locator('.uvcd-emi-pill').count(), 0);
  check(await page.locator('#sec-fees .uv-fee-note').innerText().then(t => t.startsWith('The payment plans below are for Indian applicants')), true);
  // Choosing "Foreign nationals" there updates the group for the whole site, and survives a reload.
  await page.getByRole('radio', { name: 'Foreign nationals' }).check();
  check(await page.locator('#course-fee-group').inputValue(), 'foreign');
  check(await page.locator('.uvcd-rail-fee').innerText(), 'US$3,200');
  await page.goto(base + '/online-degree-guides/mba-fees', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#guide-fee-group')?.value === 'foreign');
  const row = name => page.locator('#guide-fees tbody tr').filter({ hasText: name });
  await page.waitForFunction(() => document.querySelector('#guide-fees')?.textContent.includes('US$3,200'));
  check(await row('Manipal University Jaipur').locator('td').first().innerText(), 'US$3,200');
  check(await row('Sikkim Manipal University').locator('td').first().innerText(), 'US$2,400');
  check(await row('Amity University Online').locator('td').first().innerText().then(t => t.startsWith('Confirm the fee for international applicants')), true);
  // The wide table (with its outside-India column) scrolls inside its region on a phone.
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 900 }); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
  await page.setViewportSize({ width: 1280, height: 900 });
  // The switch itself: back to NRI; SMU's single international row stays.
  await page.getByLabel('Showing fees for').selectOption('nri');
  check(await row('Manipal University Jaipur').locator('td').first().innerText(), 'US$2,772');
  check(await row('Sikkim Manipal University').locator('td').first().innerText(), 'US$2,400');
  // Fees hub, homepage teaser, university page, compare picker and the planner follow the group.
  await page.goto(base + '/online-degree-guides/fees', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#fees-mba')?.textContent.includes('US$2,772'));
  check(await page.locator('#fees-mba').innerText().then(t => t.includes('US$2,772') && t.includes('US$2,400')), true);
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('.uv-table td')].some(td => td.textContent === 'US$2,772'));
  // The switch sits in the table's column, directly above the table, beside the teaser copy.
  check(await page.evaluate(() => { const s = document.querySelector('.uv-home-fee-group').getBoundingClientRect(), t = document.querySelector('.uv-teaser .uv-table-region').getBoundingClientRect(), c = document.querySelector('#compare-title').getBoundingClientRect(); return Math.abs(s.left - t.left) < 2 && t.top - s.bottom < 40 && s.left > c.right; }), true);
  await page.goto(base + '/universities/manipal-university-jaipur', { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('.uvu-prog-grid')].some(grid => grid.textContent.includes('US$2,772')));
  check(true, true);
  await page.goto(base + '/compare?add=mba-muj,mba-smu', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.uv-cmp-slots')?.textContent.includes('US$2,772'));
  check(await page.locator('.uv-cmp-slots').innerText().then(t => t.includes('US$2,400')), true);
  await page.goto(base + '/tools/total-cost?course=mba-muj,mba-smu', { waitUntil: 'load' });
  await page.locator('#cost-category-mba-muj').waitFor();
  await page.waitForFunction(() => document.querySelector('#cost-category-mba-muj')?.selectedOptions[0]?.textContent === 'NRI applicants');
  check(await page.locator('#cost-category-mba-smu option:checked').innerText(), 'International applicants');
  // EMI calculator stays INR.
  await page.goto(base + '/tools/emi-calculator?course=mba-muj', { waitUntil: 'load' });
  check(Number(await page.getByLabel('Total program fee (₹)', { exact: true }).inputValue()) > 0, true);
  // A saved choice beats the time zone: India with "foreign" saved shows foreign fees.
  const state = await london.storageState();
  await london.close();
  const saved = await browser.newContext({ timezoneId: 'Asia/Kolkata', storageState: { cookies: [], origins: state.origins.map(origin => ({ ...origin, localStorage: origin.localStorage.map(item => item.name === 'uv_fee_group' ? { ...item, value: 'foreign' } : item) })) } });
  page = await saved.newPage();
  await page.goto(base + '/courses/mba-muj', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.uvcd-rail-fee')?.textContent === 'US$3,200');
  check(await page.locator('.uvcd-fee-group small').count(), 0);
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 900 }); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
  await saved.close();
  console.log(`PASS ${checks} fee-group checks; course records restored.`);
 } finally {
  for (const original of originals) await db.query('update course set data=$2, updated_at=$3 where id=$1', [original.id, original.data, original.updated_at]).catch(error => console.error('RESTORE FAILED', original.id, error.message));
  await browser.close(); await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exitCode = 1; });

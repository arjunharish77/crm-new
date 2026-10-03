// Local-only disposable source/user fixtures. Catalog mutations are never performed.
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
const importId = randomUUID(), itemId = randomUUID(), referenceId = randomUUID();
const users = [];
let browser, checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
  try {
    await db.connect();
    await db.query('insert into source_import(id,source_name,source_url,metadata) values($1,$2,$3,$4)', [importId, 'Disposable source UI check', 'https://example.invalid/source', { fixture: true }]);
    for (const [id, type, mode] of [[itemId, 'course', 'OFFICIAL'], [referenceId, 'reference_taxonomy', 'REFERENCE_TAXONOMY_ONLY']]) {
      await db.query('insert into source_import_item(id,source_import_id,entity_type,entity_key,source_url,source_hash,raw_data) values($1,$2,$3,$4,$5,$6,$7)', [id, importId, type, 'fixture-only-no-catalog-target', 'https://example.invalid/source', 'f'.repeat(64), { mode, parsed: { title: 'Captured program evidence', facts: { tuition: 'Confirm fee category', long_source_note: 'x'.repeat(250), extra: { pending: true } } } }]);
    }
    browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
    for (const role of ['ADMIN', 'EDITOR', 'VIEWER']) {
      const id = randomUUID(), email = `source-ui-${id}@example.invalid`;
      await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id, email, 'Disposable source reviewer', 'not-a-login-password', role]); users.push(id);
      const iat = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({ userId: id, email, role, iat, exp: iat + 600 })).toString('base64url');
      const token = payload + '.' + createHmac('sha256', process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url');
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: 'uv_admin_session', value: token, url: base }]);
      const page = await context.newPage();
      await page.goto(`${base}/admin/source-imports/${importId}`, { waitUntil: 'networkidle' });
      check(await page.locator('.source-review-item').count(), 2);
      check(await page.getByRole('button', { name: 'Attach source notes', exact: true }).count(), role === 'ADMIN' ? 1 : 0);
      check(await page.getByRole('button', { name: 'Mark reviewed', exact: true }).count(), role === 'VIEWER' ? 0 : 2);
      check(await page.locator('.source-review-item details[open]').count(), 0);
      const disclosure = page.locator('.source-review-item summary').first(); await disclosure.focus(); await page.keyboard.press('Enter');
      check(await page.locator('.source-review-item details[open]').count(), 1);
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        check(await page.locator('.source-review-actions button').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)), true);
      }
      if (role !== 'ADMIN') {
        const response = await context.request.patch(`${base}/api/admin/source-import-items/${itemId}`, { headers: { Origin: base }, data: { action: 'APPLY_TO_CATALOG' } });
        check(response.status(), 403);
      } else {
        const button = page.getByRole('button', { name: 'Attach source notes', exact: true });
        await page.route('**/api/admin/source-import-items/*', route => route.abort());
        await button.click(); await page.locator('.source-action-box').getByRole('alert').waitFor();
        check(await button.isEnabled(), true);
        check(await page.locator('.source-action-box').getByRole('alert').innerText(), 'Connection interrupted. Check the item status before retrying.');
        await page.unroute('**/api/admin/source-import-items/*');
        await page.route('**/api/admin/source-import-items/*', async route => { check(route.request().postDataJSON().action, 'APPLY_TO_CATALOG'); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ message: 'Attached' }) }); });
        await button.click(); await page.getByText('Source notes attached. Public course and university facts have not been replaced.', { exact: true }).waitFor();
        check(await button.isEnabled(), true);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.source-review-item').first().scrollIntoViewIfNeeded();
        if (process.env.UV_SCREENSHOT_PATH) await page.screenshot({ path: process.env.UV_SCREENSHOT_PATH });
      }
      await context.close();
    }
    check((await db.query('select count(*)::int as n from source_import_item where source_import_id=$1 and review_status=\'DRAFT\'', [importId])).rows[0].n, 2);
    console.log(`PASS ${checks} source-review checks; role-denial requests real, successful writes mocked, catalog untouched.`);
  } finally {
    if (browser) await browser.close();
    await db.query('delete from source_import where id=$1', [importId]);
    for (const id of users) await db.query('delete from cms_user where id=$1', [id]);
    await db.end();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

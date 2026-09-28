/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser runner. */
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
async function main() {
 const browser = await chromium.launch({ executablePath: process.env.CRM_CHROMIUM_PATH, headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const out = 'ui-audit-2026-09/phase-g-platform-marketplace'; fs.mkdirSync(out, { recursive: true });
  const results = [], writes = []; let fail = true;
  const long = 'LongMarketplaceValue'.repeat(10), date = '2026-09-12T00:00:00Z';
  await page.route('**/api/**', route => {
   const path = new URL(route.request().url()).pathname;
   if (route.request().method() !== 'GET') { writes.push(path); return route.abort(); }
   let data = {};
   if (path === '/api/auth/me') data = { id: 'fixture-admin', name: 'Fixture admin', tenantId: null, isPlatformAdmin: true, role: { name: 'Platform admin', permissions: {} } };
   if (path.endsWith('/apps')) data = [{ id: 'app', name: long, ownerTenantId: 'owner', ownerTenantName: long, tenantId: 'tenant', tenantName: long, category: 'Sales', isActive: true, publishStatus: 'PUBLISHED', trustLevel: 'VERIFIED', createdAt: date }];
   if (path.endsWith('/tenants')) data = [{ id: 'tenant', name: 'Test tenant' }];
   if (path.endsWith('/pending-versions')) data = [{ id: 'version', appName: long, ownerTenantName: long, version: 2, changeNotes: long, createdAt: date, publishStatus: 'PENDING_REVIEW' }];
   if (path.endsWith('/pending-platform-permission-changes')) data = [{ id: 'change', appName: long, tenantId: long, pendingPlatformPermissions: { [long]: 'WRITE' }, updatedAt: date }];
   if (path.endsWith('/blocks')) data = [{ id: 'block', appId: 'app', appName: long, tenantId: 'tenant', tenantName: long, reason: long, createdAt: date }];
   if (path.endsWith('/health-overview')) data = { OK: 2, ERROR: 1 };
   if (path.endsWith('/suspected-outages')) data = [{ hostname: long, affectedAppCount: 3 }];
   const failed = fail && path.endsWith('/health-overview');
   return route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failed ? { message: 'Fixture unavailable' } : data) });
  });
  await page.goto('http://localhost:3000/platform-admin/marketplace');
  await page.getByRole('alert').filter({ hasText: 'Marketplace could not be loaded.' }).waitFor();
  assert.equal(await page.getByText('Nothing awaiting review.', { exact: true }).count(), 0);
  fail = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('combobox', { name: 'Marketplace section', exact: true }).waitFor();
  results.push({ name: 'load-error-and-retry-without-false-empty-queues', status: 'passed' });
  async function section(id) {
   await page.setViewportSize({ width: 390, height: 800 });
   await page.getByRole('combobox', { name: 'Marketplace section', exact: true }).selectOption(id);
  }
  for (const id of ['reviews', 'blocks', 'health', 'apps']) {
   await section(id);
   for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 }); await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, id + ' overflow ' + width);
    await page.screenshot({ path: `${out}/${id}-${width}.png`, fullPage: true });
    results.push({ name: id, width, status: 'passed', source: 'fixture' });
   }
  }
  await section('apps'); await page.getByLabel('Search registered apps').fill('no matching application');
  await page.getByText('No apps match your search.', { exact: true }).waitFor();
  await section('health'); await section('apps');
  assert.equal(await page.getByLabel('Search registered apps').inputValue(), 'no matching application');
  await page.getByLabel('Search registered apps').fill('Sales');
  await page.getByRole('button', { name: 'Suspend', exact: true }).waitFor();
  results.push({ name: 'app-search-and-retention', status: 'passed' });
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  for (const name of ['Suspend', 'Unpublish', 'Rotate']) {
   const before = dialogs; await page.getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(150);
   assert.equal(dialogs, before + 1, name + ' cancel should end action');
   results.push({ name: name + '-cancel', status: 'passed' });
  }
  await section('reviews'); const before = dialogs;
  await page.getByRole('button', { name: 'Reject', exact: true }).first().click(); await page.waitForTimeout(150);
  assert.equal(dialogs, before + 1); results.push({ name: 'reject-cancel', status: 'passed' });
  assert.deepEqual(writes, []); results.push({ name: 'zero-platform-writes', status: 'passed' });
  fs.writeFileSync(out + '/results.json', JSON.stringify(results, null, 2)); console.log(JSON.stringify({ passed: results.length }));
 } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser runner. */
// Read-only navigation and unsaved drafts; response fixtures never modify the server.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CRM_CHROMIUM_PATH || undefined });
  const output = process.env.CRM_UI_OUTPUT || path.resolve('ui-audit-2026-09/phase-e-admin-interactions');
  const base = process.env.CRM_UI_BASE_URL || 'http://localhost:3000';
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    const context = await browser.newContext({ storageState: process.env.CRM_AUDIT_AUTH_STATE, viewport: { width: 390, height: 720 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    async function fit(name, scope, fixture = false) {
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        await page.waitForTimeout(300);
        const doc = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(doc <= width + 1, name + ': document width ' + doc);
        const controls = await scope.locator('input:visible,button:visible,select:visible,textarea:visible').evaluateAll(els => els.filter(el => !el.closest("table")).map(el => ({ name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0,60), x: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, client: el.clientWidth, scroll: el.scrollWidth })));
        assert.ok(controls.every(el => el.x >= 0 && el.right <= width + 1), name + ': clipped controls ' + JSON.stringify(controls.filter(el => el.x < 0 || el.right > width + 1)));
        await page.screenshot({ path: path.join(output, name + '-' + width + '.png') });
        results.push({ scenario: name, width, fixture, result: 'passed' });
      }
    }
    await page.goto(base + '/dashboard/settings/roles');
    await page.getByRole('button', { name: 'Create Role', exact: true }).first().waitFor();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Create Role', exact: true }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Role Name', { exact: true }).fill('Unsaved role draft');
    await dialog.getByLabel('Leads', { exact: true }).click();
    await page.getByRole('option', { name: /Write - Create & Edit/ }).click();
    assert.equal(await dialog.getByLabel('Role Name', { exact: true }).inputValue(), 'Unsaved role draft');
    assert.equal(await dialog.getByLabel('Leads', { exact: true }).innerText(), 'Write - Create & Edit');
    await fit('role-editor', dialog);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto(base + '/dashboard/settings/users');
    await page.getByRole('button', { name: 'Invite User', exact: true }).first().click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Full Name', { exact: true }).fill('Unsaved invitation');
    await fit('invite-user-editor', dialog);
    assert.equal(await dialog.getByLabel('Full Name', { exact: true }).inputValue(), 'Unsaved invitation');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.goto(base + '/dashboard/settings/assignment-rules');
    await page.getByRole('button', { name: 'Create Rule', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Rule Name', { exact: true }).fill('Unsaved assignment rule');
    await fit('assignment-rule-editor', dialog);
    assert.equal(await dialog.getByLabel('Rule Name', { exact: true }).inputValue(), 'Unsaved assignment rule');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    for (const [routePath, endpoint, message] of [
      ['roles', '/roles', 'Unable to load roles.'],
      ['users', '/users', 'Unable to load users.'],
      ['assignment-rules', '/assignment/rules', 'Unable to load assignment rules.'],
      ['governance/audit-logs', '/governance/audit-logs', 'Unable to load audit logs.'],
      ['governance/gdpr', '/governance/gdpr/requests', 'Unable to load privacy requests.'],
    ]) {
      let unavailable = true;
      const pattern = '**/api' + endpoint + '{,?*}';
      const handler = route => route.fulfill({ status: unavailable ? 503 : 200, contentType: 'application/json', body: JSON.stringify(unavailable ? { message: 'UI fixture: unavailable' } : []) });
      await page.route(pattern, handler);
      await page.goto(base + '/dashboard/settings/' + routePath);
      const alert = page.getByRole('alert').filter({ hasText: message });
      await alert.waitFor();
      unavailable = false;
      await alert.getByRole('button', { name: 'Retry', exact: true }).click();
      await alert.waitFor({ state: 'detached' });
      results.push({ scenario: routePath + ' load failure and Retry', fixture: true, result: 'passed' });
      await page.unroute(pattern, handler);
      console.log('PASS Retry', routePath);
    }
    await page.goto(base + '/dashboard/settings/governance/audit-logs');
    await page.setViewportSize({ width: 390, height: 720 });
    await page.screenshot({ path: path.join(output, 'audit-navigation.png') });
    console.log('Navigation URL', page.url());
    assert.equal(await page.getByRole('combobox', { name: /^Settings section/ }).inputValue(), '/dashboard/settings/governance/audit-logs');
    await fit('audit-filter-controls', page.locator('[data-slot="settings-content"]'));
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + results.length + ' admin settings checks');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

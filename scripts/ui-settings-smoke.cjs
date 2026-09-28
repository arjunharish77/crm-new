/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser runner. */
// Uses the local test account. Drafts are deliberately never saved.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  if (!process.env.CRM_AUDIT_AUTH_STATE) throw new Error('Set CRM_AUDIT_AUTH_STATE.');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CRM_CHROMIUM_PATH || undefined });
  const output = process.env.CRM_UI_OUTPUT || path.resolve('ui-audit-2026-09/phase-e-settings-interactions');
  const base = process.env.CRM_UI_BASE_URL || 'http://localhost:3000';
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    const context = await browser.newContext({ storageState: process.env.CRM_AUDIT_AUTH_STATE, viewport: { width: 390, height: 720 } });
    const page = await context.newPage();
    await page.goto(base + '/dashboard/settings/service-desk');
    const section = page.getByRole('combobox', { name: 'Service Desk section', exact: true });
    await section.waitFor();
    await page.getByRole('textbox', { name: 'New case type name', exact: true }).fill('Unsaved type draft');
    await section.selectOption('statuses');
    await page.getByRole('textbox', { name: 'New status name', exact: true }).fill('Unsaved status draft');
    await section.selectOption('types');
    assert.equal(await page.getByRole('textbox', { name: 'New case type name', exact: true }).inputValue(), 'Unsaved type draft');
    await section.selectOption('statuses');
    assert.equal(await page.getByRole('textbox', { name: 'New status name', exact: true }).inputValue(), 'Unsaved status draft');
    results.push({ scenario: 'Service Desk drafts survive section switches', result: 'passed', fixture: false });
    for (const value of ['types', 'statuses', 'priorities', 'queues', 'sla', 'macros', 'kb', 'inbound']) {
      await page.setViewportSize({ width: 390, height: 720 });
      await section.selectOption(value);
      await page.waitForTimeout(600);
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        await page.waitForTimeout(300);
        const geometry = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, width: innerWidth }));
        assert.ok(geometry.document <= width + 1, value + ' document overflow: ' + JSON.stringify(geometry));
        const controls = await page.locator('[data-slot="settings-content"]').locator('input:visible,button:visible,select:visible,textarea:visible').evaluateAll(elements => elements.map(element => ({ label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0,60), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })));
        assert.ok(controls.every(control => control.left >= 0 && control.right <= width + 1), value + ' clipped controls: ' + JSON.stringify(controls.filter(control => control.left < 0 || control.right > width + 1)));
        await page.screenshot({ path: path.join(output, 'service-' + value + '-' + width + '.png') });
        results.push({ scenario: 'Service Desk ' + value + ' containment', width, result: 'passed', fixture: false });
      }
    }
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto(base + '/dashboard/settings/permission-templates');
    await page.getByRole('button', { name: 'Create Template', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Template Name', { exact: true }).fill('Unsaved permissions draft');
    const options = await dialog.getByLabel('Module or type', { exact: true }).locator('option').evaluateAll(elements => elements.map(element => element.value));
    if (options.length > 1) {
      await dialog.getByLabel('Module or type', { exact: true }).selectOption(options[1]);
      await dialog.getByLabel('Module or type', { exact: true }).selectOption(options[0]);
    }
    assert.equal(await dialog.getByLabel('Template Name', { exact: true }).inputValue(), 'Unsaved permissions draft');
    await dialog.getByRole('button', { name: 'Save Template', exact: true }).scrollIntoViewIfNeeded();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.x >= 15 && bounds.x + bounds.width <= 376 && bounds.y >= 15 && bounds.y + bounds.height <= 653);
    await page.screenshot({ path: path.join(output, 'permission-template-dialog.png') });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    results.push({ scenario: 'Permission scope switch preserves draft; dialog fits; Escape closes', result: 'passed', fixture: false });
    await page.close();
    // Unavailable policy data must never turn into editable default policies.
    const failed = await context.newPage();
    let unavailable = true;
    await failed.route('**/api/settings/task-sla-policies', route => route.fulfill({ status: unavailable ? 503 : 200, contentType: 'application/json', body: JSON.stringify(unavailable ? { message: 'UI fixture: unavailable' } : []) }));
    await failed.goto(base + '/dashboard/settings/task-sla-policies');
    const error = failed.getByRole('alert').filter({ hasText: 'Failed to load SLA policies.' });
    await error.waitFor();
    await failed.waitForTimeout(1500);
    assert.equal(await failed.getByRole('button', { name: 'Save', exact: true }).count(), 0);
    unavailable = false;
    await error.getByRole('button', { name: 'Try again' }).click();
    await failed.getByLabel('Urgent SLA enabled', { exact: true }).waitFor();
    results.push({ scenario: 'SLA load failure blocks editing; Retry recovers', result: 'passed', fixture: true });
    await failed.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`PASS: ${results.length} settings section, draft, dialog and error-state checks.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

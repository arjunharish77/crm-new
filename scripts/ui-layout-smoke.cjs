/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS runner with an optional external Playwright installation. */
/* Local browser regression checks. Provide a test-account storage state; never commit it. */
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  if (!process.env.CRM_AUDIT_AUTH_STATE) throw new Error('Set CRM_AUDIT_AUTH_STATE to a local Playwright storage-state file.');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CRM_CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ storageState: process.env.CRM_AUDIT_AUTH_STATE, viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem('sidebar-open', 'true'));
    const page = await context.newPage();
    const base = process.env.CRM_UI_BASE_URL || 'http://localhost:3000';
    const output = process.env.CRM_UI_OUTPUT || path.resolve('ui-audit-2026-09/implementation');
    fs.mkdirSync(output, { recursive: true });
    const failures = [];
    const captures = [];
    page.on('response', response => { if (response.status() === 429) failures.push('Rate limited: stop and retry this run after recovery.'); });
    await page.goto(base + '/dashboard/leads');
    await page.getByRole('heading', { name: 'Leads', exact: true }).waitFor();
    await page.waitForTimeout(2000); // Let account/module bootstrap and dev hydration settle.
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    await menu.click();
    const navigation = page.getByRole('dialog', { name: 'Main navigation' });
    try { await navigation.waitFor(); } catch (error) {
      await page.screenshot({ path: path.join(output, 'navigation-failure.png') });
      console.error('Navigation state', await page.locator('#mobile-navigation-trigger').getAttribute('aria-expanded'), await page.locator('[role="dialog"]').allTextContents());
      throw error;
    }
    const workGroup = navigation.getByRole('button', { name: 'My work', exact: true });
    if (await workGroup.count()) {
      await workGroup.click();
      assert.equal(await workGroup.getAttribute('aria-expanded'), 'false', 'The active navigation group must still be collapsible.');
      await workGroup.click();
      assert.equal(await workGroup.getAttribute('aria-expanded'), 'true');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'mobile-navigation-trigger');
    assert.equal(await navigation.count(), 0, 'Closed navigation must be unmounted.');
    const routes = (process.env.CRM_UI_ROUTES || '/dashboard/leads,/dashboard/opportunities,/dashboard/tasks,/dashboard/activities').split(',');
    for (const route of routes) {
      if (failures.some(x => x.includes('Rate limited'))) break;
      await page.goto(base + route);
      await page.waitForTimeout(2000);
      assert.equal(new URL(page.url()).pathname, route, `Route redirected: ${route}. Refresh the test session or check role access.`);
      for (const width of (process.env.CRM_UI_WIDTHS || '390,768,1280').split(',').map(Number)) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
        await page.waitForTimeout(400);
        const size = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
        if (size.document > width + 1) failures.push(`${route}: ${width}px viewport, ${size.document}px document`);
        const name = route.replaceAll('/', '_').slice(1) + '-' + width + '.png';
        await page.screenshot({ path: path.join(output, name) });
        captures.push({ route, ...size, screenshot: name });
      }
    }
    if (process.env.CRM_UI_FORM_ROUTE) {
      assert.equal(failures.length, 0, failures.join('\n'));
      await page.setViewportSize({ width: 390, height: 844 });
      if (new URL(page.url()).pathname !== process.env.CRM_UI_FORM_ROUTE) await page.goto(base + process.env.CRM_UI_FORM_ROUTE);
      const save = page.getByRole('button', { name: 'Save Form', exact: true });
      await save.waitFor();
      const panels = page.getByRole('group', { name: 'Editor panels' });
      await panels.getByRole('button', { name: 'Fields', exact: true }).click();
      const textField = page.locator('.builder-library').getByRole('button', { name: 'Short Text', exact: true });
      await textField.focus();
      await page.keyboard.press('Enter');
      assert.equal(await panels.getByRole('button', { name: 'Properties', exact: true }).getAttribute('aria-pressed'), 'true');
      await panels.getByRole('button', { name: 'Canvas', exact: true }).click();
      assert.ok(await page.locator('.builder-canvas').getByText('New text', { exact: true }).count(), 'Keyboard-added field must survive panel switching.');
      await panels.getByRole('button', { name: 'Fields', exact: true }).click();
      await page.locator('.builder-library').getByRole('button', { name: 'Long Text', exact: true }).click();
      await panels.getByRole('button', { name: 'Canvas', exact: true }).click();
      assert.ok(await page.locator('.builder-canvas').getByText('New textarea', { exact: true }).count(), 'Click-added field must survive panel switching.');
      const rect = await save.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 390 && rect.y >= 0 && rect.y + rect.height <= 844, 'Save must remain in the viewport.');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(output, 'form-unsaved-keyboard-click.png') });
      // Deliberately leave this draft unsaved; this check must not mutate the test form.
      console.log('PASS: keyboard/click field creation, draft panel retention and Save visibility (unsaved).');
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ captures, failures }, null, 2));
    assert.equal(failures.length, 0, failures.join('\n'));
    console.log(`PASS: navigation focus/Escape and containment of ${captures.length} route/viewport combinations.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

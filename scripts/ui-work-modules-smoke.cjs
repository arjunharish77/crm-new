/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser runner. */
// Uses browser-only response fixtures. Does not create records, send calls or submit approvals.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const emptyWorkspace = { myLiveCalls: [], myMissedCallsToday: [], myCallbacksDue: [], myOpenLeads: [], myOpenOpportunities: [], myRecentDispositions: [], team: null };
async function main() {
  if (!process.env.CRM_AUDIT_AUTH_STATE) throw new Error('Set CRM_AUDIT_AUTH_STATE to a local test-account storage state.');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CRM_CHROMIUM_PATH || undefined });
  const output = process.env.CRM_UI_OUTPUT || path.resolve('ui-audit-2026-09/phase-d-interactions');
  fs.mkdirSync(output, { recursive: true });
  const base = process.env.CRM_UI_BASE_URL || 'http://localhost:3000';
  const results = [];
  try {
    const context = await browser.newContext({ storageState: process.env.CRM_AUDIT_AUTH_STATE, viewport: { width: 390, height: 667 } });
    const cases = [
      ['lists', '/lead-lists', [], 'Failed to load lists.', 'No lists found'],
      ['exports', '/exports', [], 'Could not load export history.', 'No export requests yet.'],
      ['approvals', '/approvals', [], 'Failed to load the approval inbox.', 'Nothing waiting on you'],
      ['views', '/saved-views', [], 'Failed to load Smart Views.', 'No Smart Views assigned yet'],
      ['cases', '/cases', { data: [], meta: { total: 0 } }, 'Failed to load cases.', 'No cases found'],
      ['call-center', '/call-center/workspace', emptyWorkspace, 'Could not refresh the call center workspace.', 'Loading call center workspace...'],
    ];
    for (const [module, endpoint, success, message, emptyMessage] of (process.env.CRM_UI_ONLY_LONG_CONTENT ? [] : cases)) {
      const page = await context.newPage();
      let failed = true;
      let requests = 0;
      await page.route('**/api/**', route => {
        if (new URL(route.request().url()).pathname !== '/api' + endpoint) return route.continue();
        requests++;
        return route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failed ? { message: 'UI test: unavailable' } : success) });
      });
      await page.goto(base + '/dashboard/' + module);
      const alert = page.getByRole('alert').filter({ hasText: message });
      await alert.waitFor();
      await page.waitForTimeout(2000); // Finish account bootstrap and development effects before recovery.
      assert.equal(await page.getByText(emptyMessage, { exact: true }).count(), 0, module + ' must not show empty/loading after failure');
      await page.screenshot({ path: path.join(output, module + '-error.png') });
      const before = requests;
      failed = false;
      await alert.getByRole('button', { name: 'Try again' }).click();
      await alert.waitFor({ state: 'detached' });
      assert.ok(requests > before, module + ' retry must request data again');
      results.push({ module, test: 'failed load is distinct; retry recovers', result: 'passed', fixture: true });
      // Create dialogs are inspected but deliberately never submitted.
      if (module === 'cases' || module === 'lists') {
        const trigger = page.getByRole('button', { name: module === 'cases' ? 'Create Case' : 'New List', exact: true }).first();
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        await dialog.getByLabel(module === 'cases' ? 'Subject' : 'Name', { exact: true }).fill('Unsaved UI verification');
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 15 && bounds.x + bounds.width <= 376 && bounds.y >= 15 && bounds.y + bounds.height <= 653, module + ' dialog must fit');
        const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
        assert.ok(await cancel.isVisible());
        await page.screenshot({ path: path.join(output, module + '-dialog.png') });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        results.push({ module, test: 'labeled create form, viewport bounds, Escape', result: 'passed', fixture: true });
      }
      await page.close();
    }
    // Long, populated fixtures exercise controls that an empty live workspace cannot cover.
    const longName = 'A very long customer record name ' + 'UnbrokenIdentifier'.repeat(12);
    const callback = { id: 'fixture-callback', callbackAt: '2026-09-01T10:00:00Z', nextAction: longName, leadId: 'fixture-lead', leadName: longName, leadPhone: '+91 99999 99999' };
    const fixtures = [
      ['call-center', '/call-center/workspace', { ...emptyWorkspace, myCallbacksDue: [callback], myOpenLeads: [{ id: 'fixture-lead', name: longName, status: 'NEW' }], team: { liveCalls: [], missedCallsToday: [], callbacksDue: [], recentDispositions: [], agentAvailability: [{ userId: 'fixture-agent', name: longName, status: 'ONLINE', callsToday: 12, openTaskWorkload: 25 }], queueHealth: [] } }],
      ['approvals', '/approvals', [{ entityType: 'EXPORT_REQUEST', entityId: 'fixture-export', title: longName, summary: longName, requestedByName: longName, requestedAt: '2026-09-01T10:00:00Z', canReject: true }]],
    ];
    for (const [module, endpoint, data] of fixtures) {
      const page = await context.newPage();
      await page.route('**/api/**', route => new URL(route.request().url()).pathname === '/api' + endpoint ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }) : route.continue());
      await page.goto(base + '/dashboard/' + module);
      await page.getByRole('heading', { name: module === 'approvals' ? 'Approval Inbox' : 'Call Center', exact: true }).waitFor();
      await page.waitForTimeout(2000);
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        await page.waitForTimeout(400);
        const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(documentWidth <= width + 1, module + ' long content must fit');
        if (module === 'approvals') {
          const titleBounds = await page.locator('[data-slot="approval-title"]').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth, right: element.getBoundingClientRect().right }));
          assert.ok(titleBounds.content <= titleBounds.width + 1 && titleBounds.right <= width, 'The approval title must wrap inside its card, not be clipped by it.');
        }
        const action = page.getByRole('button', { name: module === 'approvals' ? 'Approve' : 'Log Outcome', exact: true }).first();
        await action.scrollIntoViewIfNeeded();
        const bounds = await action.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, module + ' action must not be clipped');
        await page.screenshot({ path: path.join(output, module + '-long-' + width + '.png') });
        results.push({ module, test: 'long populated content and action bounds', width, result: 'passed', fixture: true });
      }
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`PASS: ${results.length} work-module error/retry and dialog checks (browser response fixtures).`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

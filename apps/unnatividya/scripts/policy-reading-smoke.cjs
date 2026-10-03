// Local-only layout and keyboard checks; never submit lead or OTP requests.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local website required');
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/leads{,/**}', route => route.abort());
    await page.route('**/api/otp/**', route => route.abort());
    for (const [path, count] of [['/privacy', 4], ['/terms', 5], ['/refund-policy', 5], ['/about', 4], ['/authors/content-team', 3], ['/how-we-verify', 5]]) {
      check((await page.goto(base + path, { waitUntil: 'networkidle' })).status(), 200);
      check(await page.getByRole('heading', { level: 1 }).count(), 1);
      check(await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).count(), 1);
      check(await page.locator('.policy-updated').textContent(), `Last updated ${['/about', '/authors/content-team', '/how-we-verify'].includes(path) ? '3 October 2026' : '12 August 2026'} · Unnati Vidya`);
      if (count) {
        const summary = page.locator('.policy-contents summary');
        await summary.focus(); await page.keyboard.press('Enter');
        check(await page.locator('.policy-contents details').getAttribute('open'), '');
        check(await page.locator('.policy-contents a').count(), count);
        const last = page.locator('.policy-contents a').last();
        const id = (await last.getAttribute('href')).slice(1);
        await last.focus(); await page.keyboard.press('Enter');
        check(await page.locator(`#${id}`).evaluate(el => document.activeElement === el), true);
        check(await page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().top >= 68), true);
        await page.getByRole('link', { name: 'Back to top', exact: true }).click();
        check(await page.locator('#policy-start').evaluate(el => document.activeElement === el), true);
      }
      const related = page.getByRole('navigation', { name: 'Policies and resources' });
      check(await related.getByRole('link').count(), 6);
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        check(await page.locator('.policy-reading-layout .uv-rail').evaluate(el => getComputedStyle(el).position), 'static');
        check(await related.getByRole('link').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)), true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/privacy', { waitUntil: 'networkidle' });
    await page.locator('.policy-contents summary').click();
    if (process.env.UV_SCREENSHOT_PATH) await page.screenshot({ path: process.env.UV_SCREENSHOT_PATH });
    check(errors, []);
    console.log(`PASS ${checks} policy-reading checks; no form submissions.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

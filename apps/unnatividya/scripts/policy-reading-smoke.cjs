// Local-only layout and keyboard checks; never submit lead or OTP requests.
// UI redesign 2026-10 (D §6–§8): the three policies share LegalPageLayout (link tabs, sticky section nav on
// wide screens, collapsible section list on phones); About and How we verify have their own layouts.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local website required');
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/leads{,/**}', route => route.abort());
    await page.route('**/api/otp/**', route => route.abort());

    // Policies: separate SEO URLs, per-page dates, link tabs with aria-current, section navigation.
    for (const [path, tab, updated, count] of [['/privacy', 'Privacy', '8 October 2026', 5], ['/terms', 'Terms', '12 August 2026', 5], ['/refund-policy', 'Refund policy', '12 August 2026', 5]]) {
      await page.setViewportSize({ width: 390, height: 844 });
      check((await page.goto(base + path, { waitUntil: 'networkidle' })).status(), 200);
      check(await page.getByRole('heading', { level: 1 }).count(), 1);
      check(await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).count(), 1);
      check(await page.locator('.uv-legal-updated').textContent(), `Last updated ${updated} · Unnati Vidya`);
      const tabs = page.getByRole('navigation', { name: 'Policies', exact: true });
      check(await tabs.getByRole('link').evaluateAll(els => els.map(el => el.getAttribute('href'))), ['/privacy', '/terms', '/refund-policy']);
      check(await tabs.locator('[aria-current="page"]').evaluateAll(els => els.map(el => el.textContent)), [tab]);
      check(await tabs.getByRole('link').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)), true);
      check(await page.locator('a[href^="tel:"]').count(), 0);
      check(await page.locator('.uv-legal-help a[href="mailto:admin@unnatividya.com"]').count(), 1);
      if (path === '/privacy') check(await page.locator('#marketing').textContent(), 'Newsletter and WhatsApp updates');

      // Phones: one collapsible "On this page" list above the text, never sticky over it.
      check(await page.getByRole('navigation', { name: 'On this page', exact: true }).count(), 1);
      check(await page.locator('.uv-legal-toc').isVisible(), false);
      check(await page.locator('.uv-legal-toc-mobile').evaluate(el => getComputedStyle(el).position), 'static');
      const summary = page.locator('.uv-legal-toc-mobile summary');
      await summary.focus(); await page.keyboard.press('Enter');
      check(await page.locator('.uv-legal-toc-mobile details').getAttribute('open'), '');
      const mobileLinks = page.locator('.uv-legal-toc-mobile a');
      check(await mobileLinks.count(), count);
      check(await mobileLinks.evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)), true);
      const last = mobileLinks.last();
      const id = (await last.getAttribute('href')).slice(1);
      await last.focus(); await page.keyboard.press('Enter');
      check(await page.locator(`#${id}`).evaluate(el => document.activeElement === el), true);
      check(await page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().top >= 68), true);
      await page.getByRole('link', { name: 'Back to top', exact: true }).click();
      check(await page.locator('#policy-start').evaluate(el => document.activeElement === el), true);

      // Wide screens: the section nav sits beside the text and sticks below the header.
      for (const width of [768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        check(await page.getByRole('navigation', { name: 'On this page', exact: true }).count(), 1);
        check(await page.locator('.uv-legal-toc-mobile').isVisible(), false);
        const toc = page.locator('.uv-legal-toc');
        check(await toc.evaluate(el => getComputedStyle(el).position), 'sticky');
        check(await toc.locator('a').count(), count);
        check(await toc.locator('a').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)), true);
        check(await toc.evaluate(el => el.getBoundingClientRect().right <= document.querySelector('.uv-legal-content').getBoundingClientRect().left), true);
        const first = toc.locator('a').first();
        const firstId = (await first.getAttribute('href')).slice(1);
        await first.focus(); await page.keyboard.press('Enter');
        check(await page.locator(`#${firstId}`).evaluate(el => document.activeElement === el && el.getBoundingClientRect().top >= 68), true);
      }
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        check(await noOverflow(page), true);
      }
    }

    // About: design layout plus the kept informational sections and the required Contact us block.
    await page.setViewportSize({ width: 390, height: 844 });
    check((await page.goto(base + '/about', { waitUntil: 'networkidle' })).status(), 200);
    check(await page.getByRole('heading', { level: 1 }).count(), 1);
    check(await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).count(), 1);
    check(await page.locator('.uv-company-updated').textContent(), 'Last updated 5 October 2026 · Unnati Vidya');
    for (const id of ['explore-options', 'application-enquiry', 'check-information', 'your-information', 'contact']) check(await page.locator(`#${id}`).count(), 1);
    const address = page.locator('address');
    check(await address.count(), 1);
    check((await address.textContent()).includes('A-116, URBTECH Trade Centre'), true);
    check(await address.locator('a[href="mailto:admin@unnatividya.com"]').count(), 1);
    const aboutApply = page.locator('main').getByRole('link', { name: 'Apply now', exact: true });
    check(await aboutApply.count(), 1);
    check([await aboutApply.getAttribute('href'), await aboutApply.getAttribute('data-open-lead'), await aboutApply.getAttribute('rel')], ['/lead?intent=about', 'true', 'nofollow']);
    check(await page.locator('a[href^="tel:"]').count(), 0);
    const aboutText = await page.locator('main').innerText();
    for (const banned of ['Request a callback', 'till graduation', '30+', 'Community', 'Jobs', 'Unbiased by design', 'every university pays']) check(aboutText.includes(banned), false);
    check(await page.locator('.uv-about-stats > div').count(), 6);
    for (const width of [320, 390, 768, 1280]) { await page.setViewportSize({ width, height: 900 }); check(await noOverflow(page), true); }

    // How we verify: honest status note, the three site labels, email corrections, sourced links, FAQ.
    await page.setViewportSize({ width: 390, height: 844 });
    check((await page.goto(base + '/how-we-verify', { waitUntil: 'networkidle' })).status(), 200);
    check(await page.getByRole('heading', { level: 1 }).count(), 1);
    check(await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).count(), 1);
    check(await page.locator('.uv-verify .uv-company-updated').textContent(), 'Last updated 3 October 2026 · Unnati Vidya');
    check(await page.getByText('Catalog verification is ongoing.').isVisible(), true);
    check(await page.locator('.uv-verify-steps > li').count(), 4);
    check(await page.locator('.uv-verify-labels tbody th').evaluateAll(els => els.map(el => el.textContent.trim())), ['Source verified', 'Confirm with the university', 'Being re-checked']);
    const report = page.getByRole('link', { name: 'Report an error', exact: true });
    check((await report.getAttribute('href')).startsWith('mailto:admin@unnatividya.com'), true);
    check(await report.getAttribute('data-open-lead'), null);
    check(await page.locator('.uv-verify-sources a').evaluateAll(els => els.every(el => el.target === '_blank' && el.rel.includes('noopener') && el.textContent.includes('(opens in a new tab)'))), true);
    check(await page.locator('details[name="verify-faq"]').count(), 5);
    const verifyText = await page.locator('main').innerText();
    for (const banned of ['CONFIRM WITH COUNSELLOR', 'We check every fee', 'every admission cycle']) check(verifyText.includes(banned), false);
    for (const width of [320, 390, 768, 1280]) { await page.setViewportSize({ width, height: 900 }); check(await noOverflow(page), true); }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/privacy', { waitUntil: 'networkidle' });
    await page.locator('.uv-legal-toc-mobile summary').click();
    if (process.env.UV_SCREENSHOT_PATH) await page.screenshot({ path: process.env.UV_SCREENSHOT_PATH });
    check(errors, []);
    console.log(`PASS ${checks} policy-reading checks; no form submissions.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

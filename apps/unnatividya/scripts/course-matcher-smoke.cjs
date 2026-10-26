// Local browser check. Mock AI so it never spends credits or creates leads.
// UI redesign 2026-10: option cards are buttons that auto-advance on an explicit choice; the journey
// sidebar edits answers; result cards carry the Q9a match ring and breakdown.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local website required');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  let checks = 0;
  const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/leads{,/**}', route => route.abort());
    await page.route('**/api/otp/**', route => route.abort());
    await page.route('**/api/recommender', route => route.fulfill({ json: { mode: 'standard', suggestions: [] } }));
    await page.route('**/api/recommender/follow-up', route => route.fulfill({ json: { answer: 'The published course listing gives the current tuition; check its university source.', sources: [], context: { intent: 'fees', focusCourseId: null }, mode: 'standard' } }));
    await page.goto(base + '/recommender', { waitUntil: 'networkidle' });
    const option = name => page.locator('.uvt-option').filter({ has: page.locator('.uvt-option-label', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
    const step = async () => (await page.locator('.uvt-quiz-eyebrow').innerText()).replace(/\s+/g, ' ');
    // Stable page H1, five progress bars, step 1 has no Back and no Next until an answer exists.
    check(await page.getByRole('heading', { level: 1, name: 'Find my course' }).count(), 1);
    check(await page.locator('.uvt-quiz-bars span').count(), 5);
    check(await page.locator('.uvt-quiz-bars span[data-done]').count(), 1);
    check(/step 1 of 5/i.test(await step()), true);
    check(await page.getByRole('button', { name: 'Back', exact: true }).count(), 0);
    check(await page.getByRole('button', { name: 'Next', exact: true }).count(), 0);
    check(await option('Postgraduate').getAttribute('aria-pressed'), 'false');
    check(await option('Postgraduate').evaluate(el => el.tagName === 'BUTTON' && el.getBoundingClientRect().height >= 44), true);
    // Choosing an option advances and moves focus to the next question heading.
    await option('Postgraduate').click();
    check(/step 2 of 5/i.test(await step()), true);
    check(await page.locator('.uvt-quiz-bars span[data-done]').count(), 2);
    check(await page.locator('#matcher-question-title').evaluate(el => el === document.activeElement), true);
    // Back keeps the answer; Next continues without re-choosing.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    check(await option('Postgraduate').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    check(/step 2 of 5/i.test(await step()), true);
    await option('Not yet').click();
    await option('Management & business').click();
    await option('No budget limit yet').click();
    await option('Lower listed tuition').click();
    check(await page.getByRole('heading', { name: 'No programs pass all five answers' }).isVisible(), true);
    check(await page.locator('.uvt-rec-card').count(), 0);
    check((await page.locator('.uvt-empty').innerText()).includes('A postgraduate choice conflicts'), true);
    // The journey sidebar lists all five answers, each with Edit.
    check(await page.locator('.uvt-journey-list li').count(), 5);
    await page.getByRole('button', { name: /^Edit bachelor's degree:/ }).click();
    check(/step 2 of 5/i.test(await step()), true);
    await option('Yes').click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^(Next|Show matches)$/ }).click();
    const cards = page.locator('.uvt-rec-card'); check(await cards.count() > 0, true);
    // Q23: the five answers are in the URL, and the link reopens the same results.
    const sharedUrl = page.url();
    check(['level', 'qualification', 'stream', 'budget', 'priority'].every(key => new URL(sharedUrl).searchParams.has(key)), true);
    const shared = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await shared.route('**/api/recommender', route => route.fulfill({ json: { mode: 'standard', suggestions: [] } }));
    await shared.goto(sharedUrl, { waitUntil: 'networkidle' });
    check(await shared.locator('.uvt-rec-card').count(), await cards.count());
    await shared.close();
    check((await cards.allTextContents()).every(text => text.includes('Postgraduate') && text.includes('Management')), true);
    check(await page.locator('.uvt-rec-source a').count() > 0, true);
    // Wave 4 A3: every result shows its listed eligibility, with the checker or a "confirm" note.
    check(await page.locator('.uvt-rec-elig').count(), await cards.count());
    check((await page.locator('.uvt-rec-elig').allInnerTexts()).every(text => text.startsWith('Listed eligibility:') && (/Check your eligibility/.test(text) || /Confirm with the university/i.test(text))), true);
    // Q9a: every result has a match ring, its breakdown and reason pills; standard order follows the score.
    const percents = await page.locator('.uvt-ring strong').allInnerTexts();
    check(percents.length, await cards.count());
    check(percents.every(text => /^\d{1,3}%$/.test(text)), true);
    const values = percents.map(text => Number(text.replace('%', '')));
    check(values.every((value, i) => i === 0 || values[i - 1] >= value), true);
    check((await page.locator('.uvt-score-how').first().locator('dt').allTextContents()).map(text => text.trim()), ['Subject', 'Degree level and qualification', 'Budget headroom', 'Your priority']);
    check((await page.locator('.uvt-pills').first().innerText()).includes('Subject ✓'), true);
    check((await page.locator('.uvt-rec-list').evaluateAll(els => els.map(el => [...el.querySelectorAll('.uvt-pills, .uvt-score-how')].map(n => n.textContent).join(' ')).join(' '))).match(/rating|review|placement|salary|package/gi), null);
    check((await page.locator('.uvt-disclaimer').innerText()).includes('Preference-based suggestions are a starting point, not an admission decision.'), true);
    // Apply now opens the lead modal (never a call), Save toggles, Compare goes to the gated tool.
    const apply = cards.first().getByRole('link', { name: 'Apply now', exact: true });
    check(await apply.getAttribute('data-open-lead'), 'true');
    check((await apply.getAttribute('href')).includes('intent=recommender'), true);
    const save = cards.first().getByRole('button', { name: /^Save:/ });
    await save.click(); check(await cards.first().getByRole('button', { name: /^Saved:/ }).getAttribute('aria-pressed'), 'true');
    await cards.first().getByRole('button', { name: /^Saved:/ }).click();
    if (await cards.count() >= 2) check((await page.getByRole('link', { name: /^Compare these/ }).getAttribute('href')).startsWith('/compare?add='), true);
    check(await page.locator('.uvt-help').getByRole('link', { name: 'Apply now', exact: true }).getAttribute('data-open-lead'), 'true');
    check(await page.locator('a[href^="tel:"]').count(), 0);
    await page.getByRole('button', { name: 'How do the fees compare?' }).click();
    await page.getByText('The published course listing gives the current tuition; check its university source.').waitFor({ timeout: 5000 });
    check(await page.getByText('The published course listing gives the current tuition; check its university source.').isVisible(), true);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    check(await page.locator('.uvt-journey').evaluate(el => getComputedStyle(el).position), 'sticky');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.locator('.uvt-journey').evaluate(el => getComputedStyle(el).position), 'static');
    // Start again clears every answer.
    await page.getByRole('button', { name: 'Start again' }).click();
    check(/step 1 of 5/i.test(await step()), true);
    check(await page.locator('.uvt-option[aria-pressed="true"]').count(), 0);
    check(await page.getByRole('button', { name: 'Next', exact: true }).count(), 0);
    check(new URL(page.url()).searchParams.has('level'), false);
    check(errors, []);
    console.log(`PASS ${checks} recommender browser checks; no leads or external AI calls.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

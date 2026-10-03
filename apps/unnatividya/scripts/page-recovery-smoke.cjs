// Isolated browser fixture: renders the actual error component without disrupting the app or DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const globalMode = process.env.UV_GLOBAL_RECOVERY === "1";
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import PageError from '${globalMode ? './src/app/global-error' : './src/app/error'}';
      let failing = true;
      class Boundary extends React.Component {
        state = {error: null};
        static getDerivedStateFromError(error) {return {error};}
        render() {
          if (this.state.error) return <PageError error={this.state.error} reset={() => {failing = false; this.setState({error: null});}}/>;
          return this.props.children;
        }
      }
      function Content() {
        if (failing) throw new Error('PRIVATE_DATABASE_ERROR_SENTINEL');
        return ${globalMode ? '<html lang="en"><head><title>Recovered</title></head><body><h1>Page recovered</h1></body></html>' : '<h1>Page recovered</h1>'};
      }
      createRoot(${globalMode ? 'document' : "document.getElementById('root')"}).render(<Boundary><Content/></Boundary>);
    `, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    loader: { ".css": "empty" }, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
  });
  const browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    // All requests are fulfilled locally; there is no live fault-injection endpoint.
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>' }));
    await page.goto('http://localhost/__isolated_recovery_fixture');
    if (!globalMode) await page.addStyleTag({ content: fs.readFileSync(path.resolve(__dirname, '../src/styles/globals.css'), 'utf8') });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const heading = page.getByRole('heading', { name: 'We couldn’t load this page' });
    await heading.waitFor();
    await page.addStyleTag({ content: fs.readFileSync(path.resolve(__dirname, '../src/styles/page-recovery.css'), 'utf8') });
    if (globalMode) {
      check(await page.title(), 'Page unavailable | Unnati Vidya');
      check(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
      check(await page.locator('html').getAttribute('lang'), 'en-IN');
      check(await page.getByRole('main').count(), 1);
    }
    check(await heading.evaluate(el => el === document.activeElement), true);
    check(await page.locator('body').innerText().then(text => text.includes('PRIVATE_DATABASE_ERROR_SENTINEL')), false);
    check(await page.getByRole('link', { name: 'Go to homepage' }).getAttribute('href'), '/');
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      check(await page.locator('.page-recovery-actions :is(a,button)').evaluateAll(els => els.every(el => { const r = el.getBoundingClientRect(); return r.height >= 44 && r.left >= 0 && r.right <= innerWidth; })), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.UV_SCREENSHOT_PATH) await page.screenshot({ path: process.env.UV_SCREENSHOT_PATH });
    await heading.focus();
    await page.keyboard.press('Tab');
    check(await page.getByRole('button', { name: 'Try again' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Page recovered', exact: true }).waitFor();
    check(await page.locator('.page-recovery').count(), 0);
    console.log(`PASS ${checks} ${globalMode ? "root-layout" : "page"} simulated recovery checks; no live app or database failure induced.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

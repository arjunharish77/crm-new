// Local browser checks. All lead and OTP requests are mocked: no records or emails.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local website required');
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH ? {executablePath:process.env.UV_CHROMIUM_PATH} : {})});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const calls = [];
    await page.route('**/api/leads{,/**}', async route => { calls.push(route.request().method()); await route.fulfill({json:{ok:true,leadId:'mock-ui-lead'}}); });
    await page.route('**/api/otp/**', async route => { calls.push(new URL(route.request().url()).pathname); await route.fulfill({json:{ok:true}}); });
    await page.goto(base, {waitUntil:'networkidle'});
    const cards = page.locator('.uv-stream-tile'); check(await cards.count(),4);
    for (let i=0;i<4;i++) {
      const img = cards.nth(i).locator('img'); await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle()); await img.evaluate(el => el.decode()); check(await img.evaluate(el=>el.naturalWidth>0),true);
      check(await img.getAttribute('alt'),''); check((await cards.nth(i).getAttribute('href')).startsWith('/courses?stream='),true);
    }
    if(process.env.UV_SCREENSHOT_PATH) await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
    await page.goto(base+'/shortlist',{waitUntil:'networkidle'});
    // The saved-courses empty state uses the design's CSS illustration (decorative, hidden from assistive tech).
    const empty = page.locator('.uv-sl-empty .uv-empty-art'); await empty.scrollIntoViewIfNeeded();
    check(await empty.isVisible(),true); check(await empty.getAttribute('aria-hidden'),'true');
    check(await page.getByRole('heading',{name:'Your shortlist is empty'}).isVisible(),true);
    await page.goto(base+'/courses?q=zzzz-no-matches',{waitUntil:'networkidle'});
    // UI redesign: the courses empty state is the decorative CSS illustration (.uv-empty-art), not an image.
    await page.locator('.uv-empty-art').scrollIntoViewIfNeeded();
    check(await page.locator('.uv-empty-art').getAttribute('aria-hidden'),'true');
    check(await page.locator('.uv-empty-art').evaluate(el=>el.getBoundingClientRect().width>0),true);
    check(await page.getByRole('button',{name:'Clear filters'}).isVisible(),true);
    for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
      await page.setViewportSize({width,height});
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      // Program cards have no Apply now (UI redesign Q5); the course hero's Apply now opens the dialog.
      await page.goto(base+'/courses/mba-muj',{waitUntil:'networkidle'});
      const trigger=page.locator('.uvcd-hero [data-open-lead]').first();
      await trigger.click();
      const dialog=page.getByRole('dialog'); await dialog.waitFor();
      await dialog.getByLabel('Name',{exact:true}).waitFor();
      check(await dialog.evaluate(el=>el.parentElement.parentElement===document.body),true);
      check(await page.locator('main').evaluate(el=>el.inert),true);
      check(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.width<=innerWidth;}),true);
      const close=dialog.getByRole('button',{name:'Close',exact:true});
      await close.focus(); await page.keyboard.press('Shift+Tab');
      check(await dialog.evaluate(el=>el.contains(document.activeElement)&&document.activeElement!==el.querySelector('button')),true);
      await page.keyboard.press('Tab'); check(await close.evaluate(el=>el===document.activeElement),true);
      const privacy=dialog.getByRole('link',{name:'Privacy policy'});await privacy.focus();
      check(await privacy.evaluate(el=>{const r=el.getBoundingClientRect(),body=el.closest('.uv-lead-dialog-body').getBoundingClientRect();return r.top>=body.top&&r.bottom<=body.bottom+1;}),true);
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
      check(await trigger.evaluate(el=>el===document.activeElement),true);
      check(await page.locator('main').evaluate(el=>el.inert),false);
      check(await page.evaluate(()=>document.body.style.overflow),'');
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.uvcd-hero [data-open-lead]').first().click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Name',{exact:true}).fill('UI test');
    await dialog.getByLabel('Email',{exact:true}).fill('ui@example.invalid');
    await dialog.getByLabel('Country code').selectOption('+91');
    await dialog.getByLabel('Phone',{exact:true}).fill('9999999999');
    // Apply now has one contact-consent choice; newsletter sign-up is separate.
    check(await dialog.getByRole('checkbox').count(),1);
    const contactConsent=dialog.getByRole('checkbox',{name:/^I authorize Unnati Vidya and its authorised counselling associates/});
    check(await contactConsent.isChecked(),false);
    check(await dialog.getByRole('button',{name:'Continue',exact:true}).isDisabled(),true);
    check(await dialog.locator('a[href^="tel:"]').count(),0);
    await contactConsent.check(); await dialog.getByRole('button',{name:'Continue',exact:true}).click();
    await dialog.getByLabel('Course',{exact:true}).selectOption({label:'Online MBA'});
    await dialog.getByRole('button',{name:'Save and verify email'}).click();
    await dialog.getByLabel('Email verification code').fill('1234');
    await dialog.getByRole('button',{name:'Verify email',exact:true}).click();
    await dialog.getByRole('heading',{name:'Your details are received'}).waitFor();
    const confirmation=dialog.locator('.state-illustration'); await confirmation.scrollIntoViewIfNeeded(); await page.waitForFunction(el=>el.complete&&el.naturalWidth>0,await confirmation.elementHandle()); await confirmation.evaluate(el=>el.decode());
    check(await confirmation.evaluate(el=>el.naturalWidth>0),true);
    check(await dialog.getByText(/not confirmation of university admission/).isVisible(),true);
    // The success panel's next steps reflect the real flow: no call promise or response-time claim.
    const done=await dialog.innerText();
    check(await dialog.getByRole('heading',{name:'What happens next'}).isVisible(),true);
    check([/call you/i,/working day/i,/1800/].some(re=>re.test(done)),false);
    check(calls,['POST','PATCH','/api/otp/send','/api/otp/verify']);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();check(await dialog.count(),0);
    check(errors,[]);
    console.log(`PASS ${checks} illustration/dialog checks; lead and OTP requests mocked, no records changed.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

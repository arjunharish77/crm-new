// Read-only public browser checks. No enquiry, OTP or external delivery is triggered.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local website required');
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/courses',{waitUntil:'networkidle'});
    const cards=page.locator('.uv-course-list-card'); const total=await cards.count();check(total>0,true);
    check(await page.getByLabel('Search courses',{exact:true}).count(),1);
    check(await page.getByLabel('Sort courses',{exact:true}).count(),1);
    check(await page.getByLabel('Maximum total tuition',{exact:true}).count(),1);
    check((await page.locator('body').innerText()).includes('fees verified for the July 2026 cycle'),false);
    const quick=page.getByText('Quick comparisons',{exact:true});
    check(await page.getByRole('link',{name:'MBA: MUJ vs Amity',exact:true}).isVisible(),false);
    await quick.click();check(await page.getByRole('link',{name:'MBA: MUJ vs Amity',exact:true}).isVisible(),true);
    await quick.click();
    await page.getByRole('checkbox',{name:/Undergraduate/}).check();
    await page.waitForURL('**/courses?level=UG');
    check(await cards.count()<total,true);
    const ugCount=await cards.count();
    await page.getByLabel('Sort courses',{exact:true}).selectOption('feeAsc');
    await page.waitForURL('**sort=feeAsc');
    await page.goBack();
    check(await page.getByLabel('Sort courses',{exact:true}).inputValue(),'relevance');
    check(await page.getByRole('checkbox',{name:/Undergraduate/}).isChecked(),true);
    await page.goForward();check(await page.getByLabel('Sort courses',{exact:true}).inputValue(),'feeAsc');
    await page.reload({waitUntil:'networkidle'});check(await cards.count(),ugCount);
    await page.getByRole('button',{name:'Remove Undergraduate filter',exact:true}).click();
    check(new URL(page.url()).searchParams.has('level'),false);
    await page.getByRole('button',{name:'Clear all',exact:true}).click();
    await page.getByLabel('Search courses',{exact:true}).fill('no-matching-course-fixture');
    await page.getByRole('button',{name:'Reset search and filters',exact:true}).waitFor();check(await cards.count(),0);
    check(new URL(page.url()).searchParams.get('q'),'no-matching-course-fixture');
    await page.getByRole('button',{name:'Reset search and filters',exact:true}).click();
    check(await cards.count(),total);
    await page.goto(base+'/courses?university=muj&university=amity&level=PG&sort=feeDesc',{waitUntil:'networkidle'});
    check(await page.getByRole('checkbox',{name:/^MUJ/}).isChecked(),true);
    check(await page.getByRole('checkbox',{name:/^Amity/}).isChecked(),true);
    check(await page.getByRole('checkbox',{name:/Postgraduate/}).isChecked(),true);
    check(await page.getByLabel('Sort courses',{exact:true}).inputValue(),'feeDesc');
    await page.goto(base+'/courses?university=MUJ&q=MBA&q=BBA&maxFee=invalid&sort=unknown',{waitUntil:'networkidle'});
    check(await page.getByRole('checkbox',{name:/^MUJ/}).isChecked(),true);
    check(await page.getByLabel('Search courses',{exact:true}).inputValue(),'MBA');
    check(await page.getByLabel('Sort courses',{exact:true}).inputValue(),'relevance');
    check(await cards.count()>0,true);
    await page.goto(base+'/courses?maxFee=0',{waitUntil:'networkidle'});check(await cards.count(),0);
    await page.getByRole('button',{name:'Reset search and filters',exact:true}).click();
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({width,height:900});
      if(width<=900) {
        const toggle=page.getByRole('button',{name:/^Filters/});
        check(await page.locator('#uv-course-filters').isVisible(),false);
        await toggle.click();check(await page.locator('#uv-course-filters').isVisible(),true);
        check(await page.locator('#uv-course-filters').evaluate(el=>getComputedStyle(el).position),'static');
        await page.getByRole('checkbox',{name:/Undergraduate/}).focus();await page.keyboard.press('Escape');
        check(await page.locator('#uv-course-filters').isVisible(),false);
        check(await toggle.evaluate(el=>el===document.activeElement),true);
        await toggle.click();
        await page.getByRole('button',{name:/^Show \d+ results$/}).click();
        check(await toggle.evaluate(el=>el===document.activeElement),true);
      }
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/courses?level=PG&university=muj',{waitUntil:'networkidle'});
    if(process.env.UV_SCREENSHOT_PATH) await page.screenshot({path:process.env.UV_SCREENSHOT_PATH,fullPage:false});
    check(errors,[]);
    console.log(`PASS ${checks} public course-discovery browser checks; no records changed.`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

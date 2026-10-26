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
    // UI redesign (B §1): shared CourseCard grid, hero search box, always-visible quick-compare chips.
    const cards=page.locator('.uv-card'); const total=await cards.count();check(total>0,true);
    const search=page.getByRole('searchbox',{name:'Search courses',exact:true});
    check(await search.count(),1);check(await search.getAttribute('id'),'course-search');check(await search.getAttribute('maxlength'),'200');
    // Fast typing never drops characters while the URL and results catch up (increment 90).
    await search.fill('');await search.pressSequentially('online mba finance',{delay:0});await page.waitForTimeout(400);check(await search.inputValue(),'online mba finance');await search.fill('');await page.waitForTimeout(200);
    check(await page.getByRole('search').count()>=1,true);
    check(await page.getByLabel('Sort courses',{exact:true}).count(),1);
    check(await page.getByLabel('Sort courses',{exact:true}).locator('option').allInnerTexts(),['Sort: relevance','Fee: low to high','Fee: high to low']); // no rating sort
    check(await page.getByLabel('Maximum total tuition',{exact:true}).count(),1);
    check((await page.getByLabel('Maximum total tuition',{exact:true}).getAttribute('aria-valuetext')).startsWith('Up to ₹'),true);
    check((await page.locator('body').innerText()).includes('fees verified for the July 2026 cycle'),false);
    check((await page.locator('.uvc-count').innerText()).includes(`${total} of ${total} programs`),true);
    check((await page.locator('.uvc-count').innerText()).includes('Tuition shown.'),true);
    check(await page.locator('.uv-card [data-open-lead]').count(),0); // UI redesign Q5: no Apply now on cards
    const quick=page.getByRole('link',{name:'MBA: MUJ vs Amity',exact:true});
    check(await quick.isVisible(),true);check((await quick.getAttribute('href')).startsWith('/compare/mba/'),true); // public editorial page, not the gated tool
    check(await page.getByRole('link',{name:'Not sure? Find my course',exact:true}).getAttribute('href'),'/recommender');
    for(const group of ['Degree level','Degree','Stream','University'])check(await page.getByRole('group',{name:group,exact:true}).count(),1);
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
    await search.fill('no-matching-course-fixture');
    await page.getByRole('button',{name:'Clear filters',exact:true}).waitFor();check(await cards.count(),0);
    check(await page.getByRole('heading',{name:'No programs match these filters',exact:true}).isVisible(),true);
    check(await page.locator('.uv-empty-art').getAttribute('aria-hidden'),'true');
    check(await page.getByRole('link',{name:'Find my course',exact:true}).last().getAttribute('href'),'/recommender');
    check(new URL(page.url()).searchParams.get('q'),'no-matching-course-fixture');
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    check(await cards.count(),total);
    await page.goto(base+'/courses?university=muj&university=amity&level=PG&sort=feeDesc',{waitUntil:'networkidle'});
    check(await page.getByRole('checkbox',{name:/^Manipal University Jaipur/}).isChecked(),true);
    check(await page.getByRole('checkbox',{name:/^Amity/}).isChecked(),true);
    check(await page.getByRole('checkbox',{name:/Postgraduate/}).isChecked(),true);
    check(await page.getByLabel('Sort courses',{exact:true}).inputValue(),'feeDesc');
    await page.goto(base+'/courses?university=MUJ&q=MBA&q=BBA&maxFee=invalid&sort=unknown',{waitUntil:'networkidle'});
    check(await page.getByRole('checkbox',{name:/^Manipal University Jaipur/}).isChecked(),true);
    check(await search.inputValue(),'MBA');
    check(await page.getByLabel('Sort courses',{exact:true}).inputValue(),'relevance');
    check(await cards.count()>0,true);
    // Degree filter (Home "Popular" chips link to ?degree=MBA) and the design's lvl/uni aliases.
    await page.goto(base+'/courses?degree=MBA',{waitUntil:'networkidle'});
    check(await page.getByRole('checkbox',{name:/^Online MBA/}).isChecked(),true);
    const mbaCount=await cards.count();check(mbaCount>0,true);
    check(await page.locator('.uv-card-title').allInnerTexts().then(titles=>titles.every(title=>title==='Online MBA')),true);
    await page.goto(base+'/courses?degree=mba&lvl=PG&uni=muj',{waitUntil:'networkidle'});
    check(await cards.count(),1);check(await page.getByRole('checkbox',{name:/Postgraduate/}).isChecked(),true);
    await page.getByRole('checkbox',{name:/^Online MCA/}).check();
    await page.waitForURL(url=>new URL(url).searchParams.getAll('degree').length===2);
    check(['lvl','uni'].some(key=>new URL(page.url()).searchParams.has(key)),false);
    check(new URL(page.url()).searchParams.get('level'),'PG');
    await page.goto(base+'/courses?maxFee=0',{waitUntil:'networkidle'});check(await cards.count(),0);
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({width,height:900});
      if(width<860) {
        const toggle=page.getByRole('button',{name:/^Filters/});
        check(await page.locator('#uv-course-filters').isVisible(),false);
        check(await page.getByLabel('Sort courses',{exact:true}).isVisible(),true); // sort sits beside the Filters button
        await toggle.click();check(await page.locator('#uv-course-filters').isVisible(),true);
        check(await page.locator('#uv-course-filters').evaluate(el=>getComputedStyle(el).position),'static');
        check(await page.getByRole('checkbox',{name:/Undergraduate/}).evaluate(el=>el.closest('label').getBoundingClientRect().height>=44),true);
        await page.getByRole('checkbox',{name:/Undergraduate/}).focus();await page.keyboard.press('Escape');
        check(await page.locator('#uv-course-filters').isVisible(),false);
        check(await toggle.evaluate(el=>el===document.activeElement),true);
        await toggle.click();
        const apply=page.getByRole('button',{name:/^Show \d+ results$/});
        check(await apply.evaluate(el=>el.getBoundingClientRect().height>=44),true);
        await apply.click();
        check(await toggle.evaluate(el=>el===document.activeElement),true);
      } else {
        check(await page.getByRole('button',{name:/^Filters/}).isVisible(),false);
        check(await page.locator('#uv-course-filters').isVisible(),true);
        check(await page.getByRole('checkbox',{name:/Undergraduate/}).evaluate(el=>el.closest('label').getBoundingClientRect().height>=44),true); // 44px option rows
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

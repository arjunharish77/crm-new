// Read-only local article navigation checks (UI redesign 2026-10: hub layout with category pills,
// featured card and card grid; plan §10 Q11).
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/blog?utm_source=ui-test',{waitUntil:'networkidle'});
 const cards=page.locator('.uv-g-card.is-article'),search=page.getByRole('searchbox',{name:'Search articles'}),sort=page.getByLabel('Sort articles'),pills=page.getByRole('group',{name:'Article categories'});const total=await cards.count();check(total>0,true);
 check(await cards.locator('h3').count(),total);check((await cards.locator('.uv-g-card-byline').allTextContents()).every(t=>t.includes('Content Team, Unnati Vidya')),true);
 const dates=await cards.locator('time').evaluateAll(els=>els.map(el=>el.dateTime));check(dates,[...dates].sort().reverse());
 // Featured card: the newest article, one heading-labelled link, shown only on the unfiltered view.
 const featured=page.locator('.uv-g-featured');check(await featured.count(),1);check(await featured.getAttribute('href'),await cards.first().locator('h3 a').getAttribute('href'));check(await featured.locator('h2').count(),1);check(await featured.locator('time').first().getAttribute('datetime'),dates[0]);
 check(await pills.getByRole('button').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 await pills.getByRole('button',{name:'Fees & EMI',exact:true}).click();await pills.getByRole('button',{name:'Fees & EMI',exact:true,pressed:true}).waitFor();check(await pills.getByRole('button',{name:'Fees & EMI',exact:true}).getAttribute('aria-pressed'),'true');check((await cards.locator('.uv-g-card-meta').allTextContents()).every(t=>t.includes('Fees & EMI')),true);check(await featured.count(),0);check(await page.getByRole('heading',{name:'Fees & EMI articles'}).isVisible(),true);
 // Fast typing never drops characters while the URL and results catch up (increment 90).
 await search.fill('');await search.pressSequentially('online mba fees',{delay:0});await page.waitForTimeout(400);check(await search.inputValue(),'online mba fees');check(new URL(page.url()).searchParams.get('q'),'online mba fees');
 await search.fill('zzzzz-no-results');check(await cards.count(),0);check(await page.getByRole('heading',{name:'No articles match'}).isVisible(),true);
 await page.getByRole('button',{name:'Reset search and filters'}).click();await page.waitForFunction(n=>document.querySelectorAll('.uv-g-card.is-article').length===n,total,{timeout:5000});check(await cards.count(),total);check(await featured.count(),1);check(new URL(page.url()).searchParams.get('utm_source'),'ui-test');
 await sort.selectOption('title');const titles=await cards.locator('h3').allTextContents();check(titles,[...titles].sort((a,b)=>a.localeCompare(b)));
 await pills.getByRole('button',{name:'Admissions',exact:true}).click();await page.reload({waitUntil:'networkidle'});check(await sort.inputValue(),'title');await pills.getByRole('button',{name:'Admissions',exact:true,pressed:true}).waitFor();check(await pills.getByRole('button',{name:'Admissions',exact:true}).getAttribute('aria-pressed'),'true');
 await pills.getByRole('button',{name:'All',exact:true}).click();await page.goBack();await pills.getByRole('button',{name:'Admissions',exact:true,pressed:true}).waitFor();check(await pills.getByRole('button',{name:'Admissions',exact:true}).getAttribute('aria-pressed'),'true');await page.goForward();check(await cards.count(),total);
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
 await page.setViewportSize({width:390,height:844});await cards.first().scrollIntoViewIfNeeded();const img=cards.first().locator('img');await page.waitForFunction(el=>el.complete&&el.naturalWidth>0,await img.elementHandle());check(await img.getAttribute('alt'),'');if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 const href=await cards.first().locator('h3 a').getAttribute('href');await cards.first().locator('h3 a').click();await page.waitForURL(base+href);check(await page.getByRole('heading',{level:1}).count(),1);
 await page.goto(base+'/blog?category=invalid&sort=invalid&q=zzzzz&q=ignored',{waitUntil:'networkidle'});check(await sort.inputValue(),'newest');check(await search.inputValue(),'zzzzz');await pills.getByRole('button',{name:'All',exact:true,pressed:true}).waitFor();check(await pills.getByRole('button',{name:'All',exact:true}).getAttribute('aria-pressed'),'true');
 check(errors,[]);console.log(`PASS ${checks} article discovery browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

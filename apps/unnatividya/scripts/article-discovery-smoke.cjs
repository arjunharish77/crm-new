// Read-only local article navigation checks.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/blog?utm_source=ui-test',{waitUntil:'networkidle'});
 const cards=page.locator('.article-discovery-card'),search=page.getByRole('searchbox',{name:'Search articles'}),sort=page.getByLabel('Sort articles');const total=await cards.count();check(total>0,true);
 check(await cards.locator('h2').count(),total);check((await cards.locator('.article-card-byline').allTextContents()).every(t=>t.includes('Content Team, Unnati Vidya')),true);
 const dates=await cards.locator('time').evaluateAll(els=>els.map(el=>el.dateTime));check(dates,[...dates].sort().reverse());
 await page.getByRole('button',{name:'Fees & EMI',exact:true}).click();check(await page.getByRole('button',{name:'Fees & EMI',exact:true}).getAttribute('aria-pressed'),'true');check((await cards.locator('.article-card-meta').allTextContents()).every(t=>t.includes('Fees & EMI')),true);
 await search.fill('zzzzz-no-results');check(await cards.count(),0);check(await page.getByRole('heading',{name:'No articles match'}).isVisible(),true);
 await page.getByRole('button',{name:'Reset search and filters'}).click();check(await cards.count(),total);check(new URL(page.url()).searchParams.get('utm_source'),'ui-test');
 await sort.selectOption('title');const titles=await cards.locator('h2').allTextContents();check(titles,[...titles].sort((a,b)=>a.localeCompare(b)));
 await page.getByRole('button',{name:'Admissions',exact:true}).click();await page.reload({waitUntil:'networkidle'});check(await sort.inputValue(),'title');check(await page.getByRole('button',{name:'Admissions',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'All topics',exact:true}).click();await page.goBack();check(await page.getByRole('button',{name:'Admissions',exact:true}).getAttribute('aria-pressed'),'true');await page.goForward();check(await cards.count(),total);
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
 await page.setViewportSize({width:390,height:844});await cards.first().scrollIntoViewIfNeeded();const img=cards.first().locator('img');await page.waitForFunction(el=>el.complete&&el.naturalWidth>0,await img.elementHandle());check(await img.getAttribute('alt'),'');if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 const href=await cards.first().locator('h2 a').getAttribute('href');await cards.first().locator('h2 a').click();await page.waitForURL(base+href);check(await page.getByRole('heading',{level:1}).count(),1);
 await page.goto(base+'/blog?category=invalid&sort=invalid&q=zzzzz&q=ignored',{waitUntil:'networkidle'});check(await sort.inputValue(),'newest');check(await search.inputValue(),'zzzzz');check(await page.getByRole('button',{name:'All topics',exact:true}).getAttribute('aria-pressed'),'true');
 check(errors,[]);console.log(`PASS ${checks} article discovery browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

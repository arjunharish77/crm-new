// Read-only local article reading checks.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const category of ['Validity','Fees & EMI','Admissions']){
 await page.goto(base+'/blog?category='+encodeURIComponent(category),{waitUntil:'networkidle'});const href=await page.locator('.article-discovery-card h2 a').first().getAttribute('href');await page.goto(base+href,{waitUntil:'networkidle'});
 check(await page.locator('.author-row').innerText().then(t=>t.includes('Content Team, Unnati Vidya')),true);check(await page.locator('.course-meta').innerText().then(t=>t.includes('Published')),true);
 const summary=page.locator('.article-contents summary');await summary.focus();await page.keyboard.press('Enter');check(await page.locator('.article-contents').getAttribute('open'),'');
 const links=page.getByRole('navigation',{name:'Article sections'}).getByRole('link');check(await links.count()>1,true);const target=await links.first().getAttribute('href');await links.first().click();await page.waitForURL('**'+target);
 check(await page.locator(target).evaluate(el=>el===document.activeElement),true);check(await page.locator(target).evaluate(el=>el.getBoundingClientRect().top>=68),true);
 await page.getByRole('link',{name:'Back to article start ↑'}).click();await page.waitForURL('**#article-top');await page.waitForFunction(()=>document.getElementById('article-top').getBoundingClientRect().top>=68);check(await page.locator('#article-top').evaluate(el=>el.getBoundingClientRect().top>=68),true);
 const faq=page.locator('#article-faq details').first();if(await faq.count()){await faq.locator('summary').click();check(await faq.getAttribute('open'),'');}
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
}
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});check(await page.locator('.article-cover').evaluate(el=>el.getBoundingClientRect().height),190);check(errors,[]);console.log(`PASS ${checks} article-reading browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

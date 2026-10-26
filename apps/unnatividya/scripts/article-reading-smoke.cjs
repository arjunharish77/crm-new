// Read-only local article reading checks (UI redesign 2026-10: 880px reading column, always-open
// contents box, in-flow sources and related rows), plus the author profile the byline links to.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const category of ['Validity','Fees & EMI','Admissions']){
 await page.goto(base+'/blog?category='+encodeURIComponent(category),{waitUntil:'networkidle'});const href=await page.locator('.uv-g-card.is-article h3 a').first().getAttribute('href');await page.goto(base+href,{waitUntil:'networkidle'});
 // Byline exactly "Content Team, Unnati Vidya", linked to the author page; real dates (no "Source-verified").
 const meta=page.locator('.uv-read-meta');check(await meta.getByRole('link',{name:'Content Team, Unnati Vidya',exact:true}).getAttribute('href'),'/authors/content-team');check(await meta.innerText().then(t=>t.includes('Published')&&/\d+ min read/.test(t)&&!t.includes('Source-verified')),true);check(await meta.locator('time').first().getAttribute('datetime').then(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)),true);
 check(await page.locator('.uv-read-tag').innerText(),category);
 const contents=page.getByRole('navigation',{name:'Article sections'});check(await contents.isVisible(),true);
 const links=contents.getByRole('link');check(await links.count()>1,true);check(await links.evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 for(const hash of await links.evaluateAll(els=>els.map(el=>el.getAttribute('href'))))check(await page.locator(hash).count(),1);
 const target=await links.first().getAttribute('href');await links.first().click();await page.waitForURL('**'+target);
 check(await page.locator(target).evaluate(el=>el===document.activeElement),true);check(await page.locator(target).evaluate(el=>el.getBoundingClientRect().top>=68),true);
 await page.getByRole('link',{name:'Back to article start ↑'}).click();await page.waitForURL('**#article-top');await page.waitForFunction(()=>document.getElementById('article-top').getBoundingClientRect().top>=68);check(await page.locator('#article-top').evaluate(el=>el.getBoundingClientRect().top>=68),true);
 const faq=page.locator('#article-faq details').first();if(await faq.count()){await faq.locator('summary').click();check(await faq.getAttribute('open'),'');}
 // Sources with checked dates (or the default UGC-DEB list), newsletter, Apply now and related articles stay.
 check(await page.locator('#article-sources a[target="_blank"]').count()>0,true);check(await page.locator('.newsletter-signup.is-article').count(),1);
 const apply=page.locator('.uv-read-cta a[data-open-lead]');check(await apply.innerText(),'Apply now');check(await apply.getAttribute('rel'),'nofollow');
 check(await page.locator('#article-related a[href^="/blog/"]').count()>0,true);
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:1280,height:900});check(await page.locator('.uv-read-body').evaluate(el=>el.getBoundingClientRect().width<=880),true);await page.setViewportSize({width:390,height:844});
}
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
check(await page.locator('.uv-read-cover').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.height-r.width*8/15)<=1&&r.width>300;}),true);

// Author page (/authors/content-team), restyled in the reading language.
check((await page.goto(base+'/authors/content-team',{waitUntil:'networkidle'})).status(),200);
check(await page.getByRole('heading',{level:1}).innerText(),'Content Team, Unnati Vidya');check(await page.getByRole('navigation',{name:'Breadcrumb',exact:true}).count(),1);
check(await page.locator('.uv-author-updated').textContent(),'Last updated 3 October 2026 · Unnati Vidya');
const authorContents=page.getByRole('navigation',{name:'On this page',exact:true});check(await authorContents.getByRole('link').count(),4); // includes "Follow Unnati Vidya" (26 October 2026)
const last=authorContents.getByRole('link').last();const id=(await last.getAttribute('href')).slice(1);await last.focus();await page.keyboard.press('Enter');check(await page.locator(`#${id}`).evaluate(el=>document.activeElement===el),true);check(await page.locator(`#${id}`).evaluate(el=>el.getBoundingClientRect().top>=68),true);
await page.getByRole('link',{name:'Back to top',exact:true}).click();check(await page.locator('#author-start').evaluate(el=>document.activeElement===el),true);
const related=page.getByRole('navigation',{name:'Policies and resources'});check(await related.getByRole('link').count(),6);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await related.getByRole('link').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);}
check(errors,[]);console.log(`PASS ${checks} article-reading browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

// Wave 4 hub C2: the fees hub, the rebuilt fee guides and the planner's multi-course prefill.
// Read-only public checks, with no lead or OTP submissions. Waits for 'load' (see editorial-comparison-smoke).
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
const RANKING=/\b(best|cheapest|winner|recommended|top pick)\b/i;
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
// The guides hub links to the fees hub.
await page.goto(base+'/online-degree-guides',{waitUntil:'load'});const hubLink=page.locator('a.uv-g-hublink[href="/online-degree-guides/fees"]');check(await hubLink.count(),1);check(await hubLink.getAttribute('href'),'/online-degree-guides/fees');check(await hubLink.evaluate(el=>el.getBoundingClientRect().height>=44),true);
// Fees hub: every program once, grouped by degree, each row linking to its course page.
await hubLink.click();await page.waitForURL('**/online-degree-guides/fees');
check(await page.getByRole('heading',{level:1}).innerText(),'Online degree fees 2026-27 at MUJ, SMU and Amity');
const courseLinks=await page.locator('#fees-by-degree tbody th a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));check(courseLinks.length,30);check(new Set(courseLinks).size,30);check(courseLinks.every(href=>/^\/courses\/[a-z0-9-]+$/.test(href)),true);
const degrees=await page.locator('.uv-fees-degree').count();check(degrees>1,true);check(await page.locator('.uv-fees-jump a').count(),degrees);check(await page.locator('.uv-fees-guide-link a').count(),degrees);
check(await page.locator('.uv-fees-guide-link a').evaluateAll(els=>els.every(el=>/^\/online-degree-guides\/[a-z0-9-]+-fees$/.test(el.getAttribute('href'))&&el.getBoundingClientRect().height>=44)),true);
check(await page.locator('.uv-fees-glance dt').allTextContents(),['Programs','Listed tuition','Application fee','Fees checked']);
check(RANKING.test(await page.locator('#fees-glance, #fees-by-degree').allInnerTexts().then(t=>t.join(' '))),false);
check(await page.locator('.uv-read-byline, .uv-read-meta').first().innerText().then(t=>t.includes('Content Team, Unnati Vidya')),true);
check(await page.locator('script[type="application/ld+json"]').evaluateAll(els=>els.some(el=>el.textContent.includes('"FAQPage"'))),true);
const jump=page.locator('.uv-fees-jump a[href="#fees-mba"]');await jump.click();await page.waitForURL('**#fees-mba');check(await page.locator('#fees-mba').evaluate(el=>el.getBoundingClientRect().top>=0),true);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
await page.setViewportSize({width:390,height:844});
// A degree fee guide: sources for every program, dated where reviewed; planner link carries the whole degree.
await page.goto(base+'/online-degree-guides/mba-fees',{waitUntil:'load'});
const programs=await page.locator('#guide-fees tbody th a').evaluateAll(els=>els.map(el=>el.getAttribute('href').replace('/courses/','')));check(programs.length,3);
const heads=await page.locator('#guide-fees thead th').allTextContents();check(['University','Listed total tuition','Application fee','EMI from','Duration'].every(h=>heads.includes(h)),true);
const sources=await page.locator('#guide-sources .uv-read-source-list a').evaluateAll(els=>els.map(el=>[el.textContent,el.getAttribute('href'),el.target,el.rel]));
check(['SMU','MUJ','Amity'].every(name=>sources.some(([text])=>text.startsWith(name+' · '))),true);check(sources.every(([,url,target,rel])=>url.startsWith('https://')&&!/api-otp\.|Notices_Upload/.test(url)&&target==='_blank'&&rel.includes('noopener')),true);
const planner=page.locator('#guide-cost a.guide-cost-link');const plannerHref=await planner.getAttribute('href');check(new URL(base+plannerHref).searchParams.get('course').split(',').length,3);
const faqText=await page.locator('#guide-faq').innerText();check(/LMS access|proctored|specialization doesn't change|verified against its individual/i.test(faqText),false);
check(await page.locator('#guide-related a[href="/online-degree-guides/fees"]').count(),1);
for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
await page.setViewportSize({width:390,height:844});
// The planner opens with all three programs; the UGC notice table is never shown as a fee source.
await planner.click();await page.waitForURL('**/tools/total-cost?course=*');await page.locator('.uvt-cost-grid > *').nth(2).waitFor();check(await page.locator('.uvt-cost-grid > *').count(),3);
check(await page.locator('.uvt-source a').evaluateAll(els=>els.every(el=>!/Notices_Upload/.test(el.getAttribute('href')))),true);
await page.goto(base+'/tools/total-cost?course=mba-muj,not-a-course,mba-muj',{waitUntil:'load'});await page.locator('.uvt-cost-grid > *').first().waitFor();check(await page.locator('.uvt-cost-grid > *').count(),1);
check(errors,[]);console.log(`PASS ${checks} fees hub, fee guide and planner prefill checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

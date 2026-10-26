// Read-only local guide/university checks (UI redesign 2026-10: guides hub with topic pills,
// featured guide and card grid; search and degree filter kept in the URL).
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/universities',{waitUntil:'networkidle'});const universityLinks=await page.locator('.university-details-link').evaluateAll(els=>els.map(el=>el.getAttribute('href')));check(universityLinks.length,3);
 for(const href of universityLinks){await page.goto(base+href,{waitUntil:'networkidle'});check(await page.getByRole('heading',{name:'Campus & learner moments'}).count(),0);check(await page.getByRole('heading',{name:'Admission process',exact:true}).isVisible(),true);}
 await page.goto(base+'/online-degree-guides?utm_source=ui-test',{waitUntil:'networkidle'});
 const cards=page.locator('.uv-g-card'),search=page.getByRole('searchbox',{name:'Search guides'}),degree=page.getByLabel('Degree',{exact:true}),pills=page.getByRole('group',{name:'Guide topics'});
 const pill=name=>pills.getByRole('button',{name,exact:true});const pressed=name=>pill(name).getAttribute('aria-pressed');
 const total=await cards.count();check(total>0,true);check(await page.locator('.uv-g-group').count(),4);
 check(await pills.getByRole('button').allTextContents(),['All','Fees','Eligibility','Careers','Approvals']);check(await pills.getByRole('button').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 check(await cards.locator('h3').count(),total);check(await cards.evaluateAll(els=>els.every(el=>el.getAttribute('aria-labelledby')&&document.getElementById(el.getAttribute('aria-labelledby')).tagName==='H3')),true);
 // Featured guide: one heading-labelled link, no invented read time or "Updated" date, unfiltered view only.
 const featured=page.locator('.uv-g-featured');check(await featured.count(),1);check(await featured.getAttribute('href'),'/online-degree-guides/mba-fees');check(await featured.innerText().then(t=>!/min read|Updated October/.test(t)),true);
 const sampleLinks=await page.locator('.uv-g-group').evaluateAll(els=>els.map(el=>el.querySelector('a').getAttribute('href')));
 const json=await page.locator('script[type="application/ld+json"]').allTextContents();check(json.some(text=>text.includes('ItemList')),true);
 await search.fill('zzzzz-no-guide');check(await cards.count(),0);check(await featured.count(),0);check(await page.getByRole('heading',{name:'No guides match'}).isVisible(),true);await page.getByRole('button',{name:'Reset search and filters'}).click();check(await cards.count(),total);check(new URL(page.url()).searchParams.get('utm_source'),'ui-test');
 await pill('Eligibility').click();await degree.selectOption('Online MBA');check(await cards.count(),1);check(new URL(page.url()).searchParams.get('topic'),'Eligibility & admission');await page.reload({waitUntil:'networkidle'});await pills.getByRole('button',{name:'Eligibility',exact:true,pressed:true}).waitFor();check(await pressed('Eligibility'),'true');check(await degree.inputValue(),'Online MBA');
 await pill('Fees').click();check(await cards.count(),1);await page.goBack();await pills.getByRole('button',{name:'Eligibility',exact:true,pressed:true}).waitFor();check(await pressed('Eligibility'),'true');await page.goForward();await pills.getByRole('button',{name:'Fees',exact:true,pressed:true}).waitFor();check(await pressed('Fees'),'true');
 await page.getByRole('button',{name:'Reset search and filters'}).click();await pills.getByRole('button',{name:'All',exact:true,pressed:true}).waitFor();check(await pressed('All'),'true');
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
 await page.setViewportSize({width:390,height:844});if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 for(const href of sampleLinks){const response=await page.goto(base+href,{waitUntil:'networkidle'});check(response.status(),200);check(await page.getByRole('heading',{level:1}).count(),1);}
 await page.goto(base+'/online-degree-guides?topic=invalid&degree=invalid&q=MBA&q=ignored',{waitUntil:'networkidle'});await pills.getByRole('button',{name:'All',exact:true,pressed:true}).waitFor();check(await pressed('All'),'true');check(await degree.inputValue(),'');check(await search.inputValue(),'MBA');check(await cards.count(),4);
 check(errors,[]);console.log(`PASS ${checks} guide/university browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

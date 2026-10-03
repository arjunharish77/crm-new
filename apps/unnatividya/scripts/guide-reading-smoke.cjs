// Read-only local detail checks, no lead or OTP submissions.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/online-degree-guides',{waitUntil:'networkidle'});const routes=await page.locator('.guide-topic-group').evaluateAll(els=>els.map(el=>el.querySelector('a').getAttribute('href')));
 for(const href of routes){await page.goto(base+href,{waitUntil:'networkidle'});const nav=page.getByRole('navigation',{name:'Guide sections'});check(await nav.count(),1);const links=await nav.locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));
  for(const hash of links){check(await page.locator(hash).count(),1);await nav.locator(`a[href="${hash}"]`).click();await page.waitForURL('**'+hash);check(await page.locator(hash).evaluate(el=>el===document.activeElement),true);check(await page.locator(hash).evaluate(el=>el.getBoundingClientRect().top>=68),true);}
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 }
 await page.goto(base+'/online-degree-guides/mba-fees',{waitUntil:'networkidle'});check(await page.locator('#guide-fees .guide-fee-card').count(),3);check(await page.locator('#guide-fees dt').count(),9);
 const compare=page.locator('.guide-compare-link');const target=await compare.getAttribute('href');check(new URL(base+target).searchParams.get('add').split(',').length,3);
 await page.setViewportSize({width:390,height:844});await page.getByRole('link',{name:'Fees by university',exact:true}).click();if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 await compare.click();await page.waitForURL('**/compare?add=*');check(await page.locator('.comparison-slot').count(),3);
 // A single-university fee guide exercises scholarship cards.
 await page.goto(base+'/online-degree-guides',{waitUntil:'networkidle'});const fees=await page.getByRole('region',{name:'Fees & payments',exact:true}).locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));
 let scholarshipChecked=false;
 for(const href of fees){await page.goto(base+href,{waitUntil:'networkidle'});if(await page.getByRole('heading',{name:'Scholarships available'}).count()){check(await page.getByText('Proof required',{exact:true}).count()>0,true);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);scholarshipChecked=true;break;}}
 check(scholarshipChecked,true);check(errors,[]);console.log(`PASS ${checks} guide-detail browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

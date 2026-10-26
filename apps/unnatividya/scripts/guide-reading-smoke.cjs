// Read-only local detail checks, no lead or OTP submissions (UI redesign 2026-10: guide pages in the
// article reading layout, "In this guide" box, real fee tables, in-flow Apply now).
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/online-degree-guides',{waitUntil:'networkidle'});const routes=await page.locator('.uv-g-group').evaluateAll(els=>els.map(el=>el.querySelector('a').getAttribute('href')));
 for(const href of routes){await page.goto(base+href,{waitUntil:'networkidle'});const nav=page.getByRole('navigation',{name:'Guide sections'});check(await nav.count(),1);const links=await nav.locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));
  check(await nav.locator('a').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
  // Byline exactly "Content Team, Unnati Vidya" (no "research team"), FAQ with FAQPage data, one Apply now.
  check(await page.locator('.uv-read-meta').getByRole('link',{name:'Content Team, Unnati Vidya',exact:true}).getAttribute('href'),'/authors/content-team');check(await page.getByText(/research team|Source-verified|Updated October 2026/).count(),0);
  check(await page.locator('#guide-faq details').count()>0,true);check((await page.locator('script[type="application/ld+json"]').allTextContents()).some(t=>t.includes('FAQPage')),true);
  const apply=page.locator('.uv-read-cta a[data-open-lead]');check(await apply.count(),1);check(await apply.innerText(),'Apply now');check(new URL(base+await apply.getAttribute('href')).searchParams.get('intent').endsWith('-guide'),true);
  for(const hash of links){check(await page.locator(hash).count(),1);await nav.locator(`a[href="${hash}"]`).click();await page.waitForURL('**'+hash);check(await page.locator(hash).evaluate(el=>el===document.activeElement),true);check(await page.locator(hash).evaluate(el=>el.getBoundingClientRect().top>=68),true);}
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.setViewportSize({width:390,height:844});
 }
 await page.goto(base+'/online-degree-guides/mba-fees',{waitUntil:'networkidle'});
 const feeTable=page.getByRole('region',{name:'Online MBA fees by university',exact:true});check(await feeTable.locator('tbody tr').count(),3);check(await feeTable.locator('tbody th[scope="row"]').count(),3);
 const heads=await feeTable.locator('thead th').allTextContents();check(['University','Listed total tuition','EMI from','Duration'].every(h=>heads.includes(h)),true);check(await feeTable.getByRole('link',{name:/^View program/}).count(),3);
 const compare=page.locator('.guide-compare-link');const target=await compare.getAttribute('href');check(new URL(base+target).searchParams.get('add').split(',').length,3);
 await page.setViewportSize({width:390,height:844});await page.getByRole('link',{name:'Fees by university',exact:true}).click();if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 await compare.click();await page.waitForURL('**/compare?add=*');check(await page.locator('.comparison-slot').count(),3);
 // A single-university fee guide exercises the scholarship table.
 await page.goto(base+'/online-degree-guides',{waitUntil:'networkidle'});const fees=await page.getByRole('region',{name:'Fees & payments',exact:true}).locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));
 let scholarshipChecked=false;
 for(const href of fees){await page.goto(base+href,{waitUntil:'networkidle'});if(await page.getByRole('heading',{name:'Scholarships available'}).count()){const table=page.getByRole('region',{name:'Scholarships table',exact:true});check(await table.getByRole('columnheader',{name:'Proof required',exact:true}).count(),1);check(await table.locator('tbody tr').count()>0,true);check(await page.getByRole('main').getByRole('link',{name:'refund policy'}).count(),1);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);scholarshipChecked=true;break;}}
 check(scholarshipChecked,true);
 // UGC approval guide: per-program status badges and university-level NAAC/AICTE notes stay.
 await page.goto(base+'/online-degree-guides/mba-ugc-approval',{waitUntil:'networkidle'});check(await page.locator('#guide-overview .uv-read-card').count()>0,true);check(await page.locator('#guide-overview .uv-read-card .uv-tag').count(),await page.locator('#guide-overview .uv-read-card').count());check(await page.getByText('NAAC (university level)').count()>0,true);check(await page.locator('#guide-sources a[data-track-event="source_link_click"]').count()>0,true);
 // Career scope keeps the "What we could and couldn't verify" box.
 await page.goto(base+'/online-degree-guides/mba-career-scope',{waitUntil:'networkidle'});check(await page.getByRole('heading',{name:"What we could and couldn't verify"}).isVisible(),true);check(await page.locator('.uv-read-warning').count(),1);
 // Eligibility keeps the checker link.
 await page.goto(base+'/online-degree-guides/mba-eligibility',{waitUntil:'networkidle'});check(await page.getByRole('link',{name:'Use the free eligibility checker'}).getAttribute('href').then(h=>h.startsWith('/tools/eligibility-checker')),true);
 check(errors,[]);console.log(`PASS ${checks} guide-detail browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

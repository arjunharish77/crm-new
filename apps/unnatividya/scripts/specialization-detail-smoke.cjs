// Local read-only specialization checks.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/specializations',{waitUntil:'networkidle'});
 const cards=page.locator('.specialization-card');const many=await cards.filter({hasText:'Explore university options'}).first().getAttribute('href');const single=await cards.filter({hasText:'View specialization'}).first().getAttribute('href');
 for(const [href,multiple] of [[many,true],[single,false]]){
  await page.goto(base+href,{waitUntil:'networkidle'});const feeCards=page.locator('.guide-fee-card');const count=await feeCards.count();check(multiple?count>1:count===1,true);check(await feeCards.locator('dt').count(),count*3);
  const nav=page.getByRole('navigation',{name:'Specialization sections'});check(await nav.locator('a').count(),4);
  for(const hash of ['#specialization-fees','#specialization-careers','#specialization-guides','#specialization-faq']){await nav.locator(`a[href="${hash}"]`).click();await page.waitForURL('**'+hash);check(await page.locator(hash).evaluate(el=>el===document.activeElement),true);check(await page.locator(hash).evaluate(el=>el.getBoundingClientRect().top>=68),true);}
  const faq=page.locator('#specialization-faq details').first();await faq.locator('summary').click();check(await faq.getAttribute('open'),'');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await feeCards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
  const compare=page.getByRole('link',{name:/^Compare \d+ programs$/});check(await compare.count(),multiple?1:0);
  if(multiple){const link=await compare.getAttribute('href');check(new URL(base+link).searchParams.get('add').split(',').length,Math.min(count,3));await page.setViewportSize({width:390,height:844});await nav.getByRole('link',{name:'Fees & duration'}).click();if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});await compare.click();await page.waitForURL('**/compare?add=*');check(await page.locator('.comparison-slot').count(),Math.min(count,3));}
  else {await page.getByRole('link',{name:'Explore related specializations'}).click();await page.waitForURL('**/specializations?q=*');check(await page.getByRole('searchbox',{name:'Search specializations'}).inputValue().then(Boolean),true);}
 }
 check(errors,[]);console.log(`PASS ${checks} specialization-detail browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

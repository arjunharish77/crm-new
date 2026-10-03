// Read-only public UI checks; never submits an enquiry or OTP.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [query,university,level] of [['MBA','muj','PG'],['BBA','smu','UG'],['JMC','amity','PG']]){
  await page.goto(`${base}/courses?q=${query}&university=${university}&level=${level}`,{waitUntil:'networkidle'});
  const href=await page.locator('.uv-course-list-card a[href^="/courses/"]').first().getAttribute('href');check(Boolean(href),true);
  await page.goto(base+href,{waitUntil:'networkidle'});
  const nav=page.getByRole('navigation',{name:'Course sections',exact:true});const picker=nav.getByLabel('Jump to section',{exact:true});
  check(await picker.isVisible(),true);check(await picker.locator('option').count(),10);
  await picker.selectOption('#sec-fees');await page.waitForURL('**#sec-fees');
  await page.waitForFunction(()=>document.getElementById('sec-fees').getBoundingClientRect().top<170);
  await page.waitForFunction(()=>document.querySelector('nav[aria-label="Course sections"] select').value==='#sec-fees');
  check(await picker.inputValue(),'#sec-fees');
  check(await page.locator('#sec-fees').evaluate(el=>el===document.activeElement),true);
  check(await page.locator('#sec-fees').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.pill-nav').getBoundingClientRect().bottom-2),true);
  const plans=page.locator('.course-payment-plan');check(await plans.count()>0,true);
  check(await plans.first().getByText('You pay',{exact:true}).isVisible(),true);check(await plans.first().getByText('Payment terms',{exact:true}).isVisible(),true);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(query==='MBA'&&process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH,fullPage:false});
  await picker.selectOption('#sec-eligibility');await page.waitForURL('**#sec-eligibility');
  check(await page.locator('#sec-eligibility').evaluate(el=>el===document.activeElement),true);
  check(await page.locator('#sec-specialisations').innerText().then(text=>text.includes('Chosen in semester 3')),false);
  await picker.selectOption('#sec-curriculum');await page.waitForURL('**#sec-curriculum');
  const terms=page.locator('.curriculum-item');if(await terms.count()>1){await terms.nth(1).locator('summary').click();check(await terms.nth(1).getAttribute('open'),'');}
 }
 for(const width of [320,768,1280]){
  await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const nav=page.getByRole('navigation',{name:'Course sections',exact:true});
  check(await nav.getByLabel('Jump to section',{exact:true}).isVisible(),width<=640);
  if(width>640){await nav.getByRole('link',{name:'Fees & EMI',exact:true}).click();await page.waitForURL('**#sec-fees');check(await nav.getByRole('link',{name:'Fees & EMI',exact:true}).isVisible(),true);}
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/universities',{waitUntil:'networkidle'});
 const universityHref=await page.locator('a[href^="/universities/"]').first().getAttribute('href');await page.goto(base+universityHref,{waitUntil:'networkidle'});
 const universityPicker=page.getByLabel('Jump to section',{exact:true});check(await universityPicker.isVisible(),true);
 const target=await universityPicker.locator('option').nth(1).getAttribute('value');await universityPicker.selectOption(target);
 check(new URL(page.url()).hash,target);check(errors,[]);
 console.log(`PASS ${checks} course/university detail browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

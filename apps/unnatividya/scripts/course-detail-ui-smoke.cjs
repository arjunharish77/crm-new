// Read-only public UI checks; never submits an enquiry or OTP.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // UI redesign (B §2): sticky SectionTabs (anchor links with scroll-spy) replace the pill nav and the
 // mobile "Jump to section" picker; the tab row scrolls sideways on phones.
 const TABS=['Overview','Eligibility','Admission','Specialisations','Study','Fees & EMI','Recognition','Careers','FAQ'];
 const tabsBottom=()=>page.locator('.uv-tabs').evaluate(el=>el.getBoundingClientRect().bottom);
 for(const [query,university,level] of [['MBA','muj','PG'],['BBA','smu','UG'],['JMC','amity','PG']]){
  await page.goto(`${base}/courses?q=${query}&university=${university}&level=${level}`,{waitUntil:'networkidle'});
  const href=await page.locator('.uv-card .uv-card-title a[href^="/courses/"]').first().getAttribute('href');check(Boolean(href),true);
  await page.goto(base+href,{waitUntil:'networkidle'});
  const nav=page.getByRole('navigation',{name:'Course sections',exact:true});
  check(await nav.isVisible(),true);check(await nav.getByRole('link').allInnerTexts(),TABS);
  for(const target of await nav.getByRole('link').evaluateAll(els=>els.map(el=>el.getAttribute('href'))))check(await page.locator(target).count(),1);
  check(await nav.getByRole('link',{name:'Reviews'}).count(),0);
  check(await page.getByRole('heading',{name:'Four checks before you apply'}).isVisible(),true);
  check(await page.getByRole('heading',{name:'Classes and assessments'}).isVisible(),true);
  check(await page.getByRole('heading',{name:'Check the total payable'}).isVisible(),true);
  check(await page.locator('.uvcd-check').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<0.001),true);
  await nav.getByRole('link',{name:'Fees & EMI',exact:true}).click();await page.waitForURL('**#sec-fees');
  await page.waitForFunction(()=>document.getElementById('sec-fees').getBoundingClientRect().top<170);
  await page.waitForFunction(()=>document.querySelector('nav[aria-label="Course sections"] a[aria-current="true"]')?.getAttribute('href')==='#sec-fees');
  check(await page.locator('#sec-fees').evaluate(el=>el===document.activeElement),true);
  check(await page.locator('#sec-fees').evaluate(el=>el.getBoundingClientRect().top)>=await tabsBottom()-2,true);
  const plans=page.locator('.uvcd-plan');check(await plans.count()>0,true);
  check(await plans.first().locator('dt').evaluateAll(els=>els.map(el=>el.textContent)),['You pay','Payment terms']);
  check((await page.locator('#sec-fees').innerText()).includes('Save 2%'),false);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(query==='MBA'&&process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH,fullPage:false});
  await nav.getByRole('link',{name:'Eligibility',exact:true}).click();await page.waitForURL('**#sec-eligibility');
  check(await page.locator('#sec-eligibility').evaluate(el=>el===document.activeElement),true);
  check(await page.locator('#sec-eligibility .uv-tag').count(),1); // SOURCE VERIFIED or CONFIRM WITH THE UNIVERSITY, never both
  check(await page.locator('#sec-specialisations').innerText().then(text=>text.includes('Chosen in semester 3')),false);
  await nav.getByRole('link',{name:'Study',exact:true}).click();await page.waitForURL('**#sec-curriculum');
  const terms=page.locator('.uvcd-term');if(await terms.count()>1){await terms.nth(1).locator('summary').click();check(await terms.nth(1).getAttribute('open'),'');}
 }
 for(const width of [320,768,1280]){
  await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const nav=page.getByRole('navigation',{name:'Course sections',exact:true});
  check(await nav.isVisible(),true);
  check(await nav.locator('.uv-tabs-inner').evaluate(el=>getComputedStyle(el).overflowX),'auto');
  await nav.getByRole('link',{name:'Fees & EMI',exact:true}).click();await page.waitForURL('**#sec-fees');
  check(await nav.getByRole('link',{name:'Fees & EMI',exact:true}).isVisible(),true);
  check(await nav.getByRole('link',{name:'Fees & EMI',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44),true);
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/universities',{waitUntil:'networkidle'});
 const universityHref=await page.locator('a[href^="/universities/"]').first().getAttribute('href');await page.goto(base+universityHref,{waitUntil:'networkidle'});
 const universityTabs=page.getByRole('navigation',{name:'University sections'});check(await universityTabs.isVisible(),true);
 check(await universityTabs.getByRole('link').count(),7);
 check(await page.getByRole('heading',{name:'Undergraduate degrees'}).isVisible(),true);
 check(await page.getByRole('heading',{name:'Postgraduate degrees'}).isVisible(),true);
 check(await page.locator('.uvu-outcomes').isVisible(),true);
 const target=await universityTabs.getByRole('link').nth(1).getAttribute('href');await universityTabs.getByRole('link').nth(1).click();await page.waitForURL('**'+target);
 check(new URL(page.url()).hash,target);check(errors,[]);
 console.log(`PASS ${checks} course/university detail browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

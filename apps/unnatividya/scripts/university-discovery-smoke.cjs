// Read-only checks: never submit an enquiry or send an OTP.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/universities',{waitUntil:'networkidle'});
 const cards=page.locator('.uvu-card');check(await cards.count(),3);
 check(await page.getByRole('heading',{level:1}).count(),1);
 check((await page.locator('main').innerText()).includes('VERIFIED THIS CYCLE'),false);
 check(await page.getByRole('link',{name:'Find my course',exact:true}).last().getAttribute('href'),'/recommender');
 // At-a-glance table: real table semantics, no best-value highlighting, university-wide labels.
 const table=page.locator('table');check(await table.count(),1);check(await table.locator('thead th[scope="col"]').count(),3);check(await table.locator('tbody th[scope="row"]').count(),7);
 check(/best value/i.test(await page.locator('main').innerText()),false);check(await table.getByText('Placement assistance (university-wide)',{exact:true}).count(),1);
 check(await page.locator('details[name="universities-faq"]').count()>=3,true);check((await page.locator('script[type="application/ld+json"]').allTextContents()).some(text=>text.includes('FAQPage')),true);
 const links=[];
 for(let i=0;i<3;i++){
  const card=cards.nth(i);check(await card.getByRole('heading',{level:2}).count(),1);
  const browse=card.getByRole('link',{name:/^Browse all \d+ courses$/});const count=Number((await browse.innerText()).match(/\d+/)[0]);
  check(Number(await card.locator('dd').first().innerText()),count);
  check(await card.getByRole('link',{name:'Apply now',exact:true}).getAttribute('data-open-lead'),'true');
  links.push({href:await browse.getAttribute('href'),count});
  check(await card.getByText('Placement assistance, university-wide',{exact:true}).isVisible(),true);
  check(await card.getByText('Average package, university-wide',{exact:true}).isVisible(),true);
  check(await card.locator('.uvu-card-media').innerText(),''); // no rating badge on the campus image
  check(await card.getByRole('link',{name:/^View \S+ programs$/}).getAttribute('href'),await card.locator('.university-details-link').getAttribute('href')+'#sec-programs');
 }
 for(const width of [320,390,768,900,1024,1280]){
  await page.setViewportSize({width,height:900});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);
  check(await page.locator('.uvu-card-actions .btn').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 }
 await page.setViewportSize({width:390,height:844});await cards.first().scrollIntoViewIfNeeded();
 if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 for(const {href,count} of links){
  await page.goto(base+href,{waitUntil:'networkidle'});
  check(await page.locator('.uvc-results .uv-card').count(),count);
  const university=new URL(base+href).searchParams.get('university');check(await page.locator('.uvc-chips button').count()>0,true);
  check(new URL(page.url()).searchParams.get('university'),university);
 }
 check(errors,[]);console.log(`PASS ${checks} university discovery browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

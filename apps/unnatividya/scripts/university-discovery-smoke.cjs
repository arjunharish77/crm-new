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
 const cards=page.locator('.university-discovery-card');check(await cards.count(),3);
 check(await page.getByRole('heading',{level:1}).count(),1);
 check((await page.locator('main').innerText()).includes('VERIFIED THIS CYCLE'),false);
 check(await page.getByRole('link',{name:'Find my course',exact:true}).last().getAttribute('href'),'/recommender');
 const links=[];
 for(let i=0;i<3;i++){
  const card=cards.nth(i);check(await card.getByRole('heading',{level:2}).count(),1);
  const browse=card.getByRole('link',{name:/Browse \d+ courses/});const count=Number((await browse.innerText()).match(/\d+/)[0]);
  check(Number(await card.locator('dd').first().innerText()),count);
  check(await card.getByRole('link',{name:'Apply now',exact:true}).getAttribute('data-open-lead'),'true');
  links.push({href:await browse.getAttribute('href'),count});
  const summary=card.locator('summary');await summary.focus();await page.keyboard.press('Enter');
  check(await card.locator('details').getAttribute('open'),'');
  check(await card.getByText(/Average package/).isVisible(),true);
  await page.keyboard.press('Enter');check(await card.locator('details').getAttribute('open'),null);
 }
 for(const width of [320,390,768,900,1024,1280]){
  await page.setViewportSize({width,height:900});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);
  check(await page.locator('.university-discovery-actions .btn').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 }
 await page.setViewportSize({width:390,height:844});await cards.first().scrollIntoViewIfNeeded();
 if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 for(const {href,count} of links){
  await page.goto(base+href,{waitUntil:'networkidle'});
  check(await page.locator('.uv-course-list-card').count(),count);
  const university=new URL(base+href).searchParams.get('university');check(await page.locator('.uv-filter-chips button').count()>0,true);
  check(new URL(page.url()).searchParams.get('university'),university);
 }
 check(errors,[]);console.log(`PASS ${checks} university discovery browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

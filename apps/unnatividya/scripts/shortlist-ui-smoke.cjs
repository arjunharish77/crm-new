// Local browser-only shortlist fixtures. No catalog writes or lead/OTP sends.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/leads{,/**}',route=>route.abort());await context.route('**/api/otp/**',route=>route.abort());
 await page.goto(base+'/shortlist',{waitUntil:'networkidle'});check(await page.getByRole('heading',{name:'Nothing saved yet'}).isVisible(),true);
 for(const raw of ['null','{}','42','"bad"','not-json']){
  await page.evaluate(raw=>localStorage.setItem('uv_shortlist',raw),raw);await page.reload({waitUntil:'networkidle'});
  check(await page.getByRole('heading',{name:'Nothing saved yet'}).isVisible(),true);
 }
 await page.evaluate(()=>{localStorage.setItem('uv_shortlist',JSON.stringify(['mba-muj','mba-smu','mba-amity','bca-muj','mba-muj',null,7,'missing-course']));window.dispatchEvent(new Event('uv-shortlist-changed'));});
 const cards=page.locator('.shortlist-card');await cards.first().waitFor();check(await cards.count(),4);
 check(await page.getByRole('button',{name:'Compare selected',exact:true}).isDisabled(),true);
 const boxes=page.getByRole('checkbox');await boxes.nth(0).check();await boxes.nth(1).check();
 check(await page.getByRole('link',{name:'Compare selected (2)'}).isVisible(),true);
 await boxes.nth(2).check();check(await boxes.nth(3).isDisabled(),true);
 const href=await page.getByRole('link',{name:'Compare selected (3)'}).getAttribute('href');check(new URL(base+href).searchParams.get('add').split(',').length,3);
 await boxes.nth(1).uncheck();check(await boxes.nth(3).isEnabled(),true);
 const removedName=await cards.first().getByRole('heading').innerText();
 await cards.first().getByRole('button',{name:/Remove /}).click();check(await cards.count(),3);
 check(await page.locator('#shortlist-summary').evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Undo removal'}).click();check(await cards.count(),4);check(await cards.first().getByRole('heading').innerText(),removedName);
 check(await page.getByRole('button',{name:'Compare selected',exact:true}).isDisabled(),true);
 // Separate tab changes use the real browser storage event.
 const other=await context.newPage();await other.goto(base+'/shortlist',{waitUntil:'networkidle'});
 await other.evaluate(()=>localStorage.setItem('uv_shortlist',JSON.stringify(['mba-muj'])));
 await page.waitForFunction(()=>document.querySelectorAll('.shortlist-card').length===1);check(await cards.count(),1);
 await other.close();await cards.first().getByRole('button',{name:/Remove /}).click();check(await page.getByRole('heading',{name:'Nothing saved yet'}).isVisible(),true);
 await page.getByRole('button',{name:'Undo removal'}).click();check(await cards.count(),1);
 await page.reload({waitUntil:'networkidle'});check(await cards.count(),1);
 await page.evaluate(()=>{localStorage.setItem('uv_shortlist',JSON.stringify(['mba-muj','mba-smu','mba-amity','bca-muj']));window.dispatchEvent(new Event('uv-shortlist-changed'));});
 await page.waitForFunction(()=>document.querySelectorAll('.shortlist-card').length===4);
 for(const width of [320,390,768,1024,1280]){
  await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);
  check(await page.locator('.shortlist-card .btn').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 }
 await page.setViewportSize({width:390,height:844});await cards.first().scrollIntoViewIfNeeded();if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(3).check();
 const compare=page.getByRole('link',{name:'Compare selected (2)'});const expected=new URL(base+await compare.getAttribute('href')).searchParams.get('add');await compare.click();await page.waitForURL('**/compare?add=*');
 check(await page.locator('.comparison-slot').count(),2);check(new URL(page.url()).searchParams.get('add'),expected);
 check(errors,[]);console.log(`PASS ${checks} shortlist UI/storage checks; browser fixtures only, no server records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

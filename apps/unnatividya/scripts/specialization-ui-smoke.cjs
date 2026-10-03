// Read-only local browser checks; no form submissions.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/specializations?utm_source=ui-test',{waitUntil:'networkidle'});
 const search=page.getByRole('searchbox',{name:'Search specializations'}),subject=page.getByLabel('Subject area',{exact:true}),degree=page.getByLabel('Degree',{exact:true});
 const cards=page.locator('.specialization-card');const total=await cards.count();check(total>0,true);
 await search.fill('zzzzz-no-match');check(await cards.count(),0);check(await page.getByRole('heading',{name:'No specializations match'}).isVisible(),true);
 await page.getByRole('button',{name:'Reset search and filters'}).click();check(await cards.count(),total);check(new URL(page.url()).searchParams.get('utm_source'),'ui-test');
 await subject.selectOption('Management');check(await page.locator('.specialization-group').count(),1);check(await page.locator('.specialization-group h2').innerText(),'Management');
 const degreeValues=await degree.locator('option').evaluateAll(els=>els.map(el=>el.value));const mba=degreeValues.find(value=>value.includes('MBA'));check(Boolean(mba),true);await degree.selectOption(mba);
 check((await cards.allTextContents()).every(text=>text.includes(mba)),true);const count=await cards.count();check(count>0,true);
 await page.reload({waitUntil:'networkidle'});check(await degree.inputValue(),mba);check(await subject.inputValue(),'Management');check(await cards.count(),count);
 await degree.selectOption('');await page.goBack();check(await degree.inputValue(),mba);await page.goForward();check(await degree.inputValue(),'');
 await search.fill('Finance');check(new URL(page.url()).searchParams.get('q'),'Finance');check((await cards.allTextContents()).every(text=>text.toLowerCase().includes('finance')),true);
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
 await page.setViewportSize({width:390,height:844});if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 const href=await cards.first().getAttribute('href');await cards.first().click();await page.waitForURL(base+href);check(await page.getByRole('heading',{level:1}).count(),1);
 await page.goto(base+'/specializations?stream=invalid&degree=invalid&q=Finance&q=ignored',{waitUntil:'networkidle'});check(await subject.inputValue(),'');check(await degree.inputValue(),'');check(await search.inputValue(),'Finance');check(await cards.count()>0,true);
 check(errors,[]);console.log(`PASS ${checks} specialization browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

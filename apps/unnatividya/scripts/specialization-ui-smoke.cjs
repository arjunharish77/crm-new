// Read-only local browser checks; no form submissions.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/specializations?utm_source=ui-test',{waitUntil:'networkidle'});
 const search=page.getByRole('searchbox',{name:'Search specializations'}),subject=page.getByLabel('Subject area',{exact:true}),pills=page.getByRole('group',{name:'Filter by degree'});
 const pill=name=>pills.getByRole('button',{name,exact:true});const pressed=async name=>pill(name).getAttribute('aria-pressed');
 const cards=page.locator('.specialization-card');const total=await cards.count();check(total>0,true);
 await search.fill('zzzzz-no-match');check(await cards.count(),0);check(await page.getByRole('heading',{name:'No specializations match'}).isVisible(),true);check(await page.getByRole('button',{name:'Show all specializations',exact:true}).isVisible(),true);
 await page.getByRole('button',{name:'Reset search and filters'}).click();check(await cards.count(),total);check(new URL(page.url()).searchParams.get('utm_source'),'ui-test');
 await subject.selectOption('Management');const groups=page.locator('.uvs-group');check(await groups.count()>0,true);const headings=await groups.locator('h2').allInnerTexts();check(headings.includes('Online MBA'),true);check(headings.includes('Online BCA'),false);
 const mba='Online MBA';await pills.getByRole('button',{name:'All',exact:true,pressed:true}).waitFor();check(await pressed('All'),'true');await pill(mba).click();check(await pressed(mba),'true');check(await pressed('All'),'false');check(await groups.count(),1);check(await groups.locator('h2').innerText(),mba);
 check((await cards.allTextContents()).every(text=>text.includes(mba)),true);const count=await cards.count();check(count>0,true);
 await page.reload({waitUntil:'networkidle'});check(await pressed(mba),'true');check(await subject.inputValue(),'Management');check(await cards.count(),count);
 check(await pills.getByRole('button').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 await pill('All').click();await page.goBack();check(await pressed(mba),'true');await page.goForward();await pills.getByRole('button',{name:'All',exact:true,pressed:true}).waitFor();check(await pressed('All'),'true');
 await search.fill('Finance');await page.waitForURL(url=>new URL(url).searchParams.get('q')==='Finance');check(new URL(page.url()).searchParams.get('q'),'Finance'); // the URL update is debounced
 check((await cards.allTextContents()).every(text=>text.toLowerCase().includes('finance')),true);
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
 await page.setViewportSize({width:390,height:844});if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 const href=await cards.first().getAttribute('href');await cards.first().click();await page.waitForURL(base+href);check(await page.getByRole('heading',{level:1}).count(),1);
 await page.goto(base+'/specializations?stream=invalid&degree=invalid&q=Finance&q=ignored',{waitUntil:'networkidle'});check(await subject.inputValue(),'');await pills.getByRole('button',{name:'All',exact:true,pressed:true}).waitFor();check(await pressed('All'),'true');check(await search.inputValue(),'Finance');check(await cards.count()>0,true);
 check(errors,[]);console.log(`PASS ${checks} specialization browser checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

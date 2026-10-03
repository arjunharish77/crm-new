// Browser-only preference matching checks. No AI, lead or OTP requests.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3001';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/leads{,/**}',route=>route.abort());await page.route('**/api/otp/**',route=>route.abort());
 await page.goto(base+'/recommender',{waitUntil:'networkidle'});
 const next=()=>page.getByRole('button',{name:'Continue',exact:true});
 check(await next().isDisabled(),true);
 await page.getByRole('radio',{name:'Postgraduate',exact:true}).check();check(await next().isEnabled(),true);
 await next().click();check(await page.locator('#matcher-question-title').evaluate(el=>el===document.activeElement),true);
 await page.getByRole('radio',{name:'Management & business',exact:true}).check();await next().click();
 await page.getByRole('button',{name:'Back',exact:true}).click();check(await page.getByRole('radio',{name:'Management & business',exact:true}).isChecked(),true);await next().click();
 await page.getByRole('radio',{name:'Up to ₹1,00,000',exact:true}).check();await page.getByRole('button',{name:'Show matches',exact:true}).click();
 check(await page.getByRole('heading',{name:'No courses match all three preferences'}).isVisible(),true);check(await page.locator('.matcher-course').count(),0);
 await page.getByRole('button',{name:/Edit budget:/}).click();check(await page.getByRole('radio',{name:'Up to ₹1,00,000',exact:true}).isChecked(),true);
 await page.getByRole('radio',{name:'Up to ₹1,80,000',exact:true}).check();await page.getByRole('button',{name:'Show matches',exact:true}).click();
 const cards=page.locator('.matcher-course');check(await cards.count()>0,true);
 const texts=await cards.allTextContents();check(texts.every(t=>t.includes('Postgraduate')&&t.includes('Management')),true);
 const amounts=await cards.locator('strong').allTextContents();const fees=amounts.map(t=>Number(t.replace(/\D/g,'')));check(fees.every(v=>v<=180000),true);check(fees,[...fees].sort((a,b)=>a-b));
 check((await page.locator('.matcher-results').innerText()).includes('% MATCH'),false);
 const link=page.getByRole('link',{name:/View all \d+ matches/});check(new URL(base+await link.getAttribute('href')).searchParams.get('maxFee'),'180000');
 check(await page.getByRole('heading',{name:'Your course matches'}).evaluate(el=>el===document.activeElement),true);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
 await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'Your course matches'}).scrollIntoViewIfNeeded();if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 await link.click();await page.waitForURL('**/courses?*');check(await page.locator('.uv-course-list-card').count(),fees.length);
 await page.goto(base+'/recommender',{waitUntil:'networkidle'});
 await page.getByRole('radio',{name:'Show both levels'}).check();await next().click();await page.getByRole('radio',{name:'Explore all subjects'}).check();await next().click();await page.getByRole('radio',{name:'No budget limit yet'}).check();await page.getByRole('button',{name:'Show matches'}).click();check(await cards.count(),3);
 check(await page.getByRole('link',{name:'Compare these 3'}).isVisible(),true);
 await page.getByRole('button',{name:'Start again'}).click();check(await next().isDisabled(),true);check(await page.getByRole('radio',{checked:true}).count(),0);
 check(errors,[]);console.log(`PASS ${checks} course-matching browser checks; no records or messages created.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

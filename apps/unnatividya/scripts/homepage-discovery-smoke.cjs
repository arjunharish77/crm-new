// Public read-only checks; submits only the GET course-search form, never lead/OTP forms.
// Home redesign (docs/UI_REDESIGN_PLAN_2026-10.md): navy hero search card, data-driven facts,
// owner-confirmed perks only, the three retained testimonials and the Course + Home mobile bar.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/',{waitUntil:'load'});
 const hero=page.locator('.uv-hero');check(await page.getByRole('heading',{level:1}).count(),1);
 const text=await page.locator('main').innerText();
 // Owner decisions: no phone, no equal-compensation claim, no unconfirmed perks or re-check promise.
 for(const banned of ['1800','compensate us equally','pay us the same','re-verified every admission cycle','Jobs','Community','till graduation','30+'])check(text.includes(banned),false);
 for(const kept of ['No hidden charges','Approvals you can check','Support till enrolment','10k+','lowest-fee guarantee'])check(text.includes(kept),true);
 check(await page.locator('.uv-quote').count(),3);
 check(await page.locator('.uv-quote').first().innerText().then(t=>t.includes('Priya Sharma')),true);
 check(await page.locator('.uv-home-faq-item').count(),5);
 for(const width of [320,390,768,1280,1440]){
  await page.setViewportSize({width,height:900});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const search=page.getByRole('search',{name:'Find a course',exact:true});
  check(await search.isVisible(),true);
  check(await search.evaluate(el=>el.getBoundingClientRect().bottom<innerHeight+260),true);
  check(await page.locator('.uv-hero-fact').count(),2);
  const bar=page.locator('.uv-mobile-bar');
  if(width<860){
   check(await bar.isVisible(),true);
   check(await bar.getByRole('link',{name:'Apply now',exact:true}).getAttribute('data-open-lead'),'true');
   check(await bar.getByRole('link',{name:'Browse courses',exact:true}).getAttribute('href'),'/courses');
  }else check(await bar.isVisible(),false);
 }
 await page.setViewportSize({width:390,height:844});
 const metrics=await hero.evaluate(el=>({heroHeight:Math.round(el.getBoundingClientRect().height),searchBottom:Math.round(el.querySelector('form').getBoundingClientRect().bottom)}));
 if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH,fullPage:false});
 // Popular chip → degree filter.
 check(await hero.getByRole('link',{name:'Online MBA',exact:true}).getAttribute('href'),'/courses?degree=MBA');
 await hero.getByRole('link',{name:'Online MBA',exact:true}).click();await page.waitForURL('**/courses?degree=MBA');
 await page.locator('.uv-card').first().waitFor();
 const cards=await page.locator('.uv-card').allTextContents();
 check(cards.length>1,true);check(cards.every(t=>t.includes('MBA')),true);check(cards.some(t=>t.includes('Sikkim')),true);
 // Free-text search plus the two selects; empty selects are harmless.
 await page.goto(base+'/',{waitUntil:'load'});
 const form=page.getByRole('search',{name:'Find a course',exact:true});
 await form.getByLabel('Course or keyword',{exact:true}).fill('BCA');
 await form.getByRole('button',{name:'Show programs',exact:true}).click();await page.waitForURL(url=>new URL(url).pathname==='/courses'&&new URL(url).searchParams.get('q')==='BCA');
 check(await page.locator('#course-search').inputValue(),'BCA');await page.locator('.uv-card').first().waitFor();check(await page.locator('.uv-card').count()>0,true);
 await page.goto(base+'/',{waitUntil:'load'});
 await form.getByLabel('Degree level',{exact:true}).selectOption('PG');
 await form.getByRole('button',{name:'Show programs',exact:true}).click();await page.waitForURL(url=>new URL(url).searchParams.get('level')==='PG');
 await page.locator('.uv-card').first().waitFor();
 check((await page.locator('.uv-card .uv-level').allTextContents()).every(t=>t==='PG'),true);
 check(errors,[]);console.log(`PASS ${checks} homepage discovery browser checks; mobile metrics ${JSON.stringify(metrics)}; no lead/OTP submissions.`);
}finally{await browser.close();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});

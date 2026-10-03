// Public read-only checks; submits only the GET course-search form, never lead/OTP forms.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const hero=page.locator('.uv-home-hero-grid');check(await page.getByRole('heading',{level:1}).count(),1);
 check((await hero.innerText()).includes('re-verified every admission cycle'),false);
 for(const width of [320,390,768,1280,1440]){
  await page.setViewportSize({width,height:900});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const search=page.getByRole('search',{name:'Find a course',exact:true});
  check(await search.isVisible(),true);
  check(await search.evaluate(el=>el.getBoundingClientRect().bottom<innerHeight-64),true);
  check(await page.locator('.uv-home-visual-fact').count(),2);
  if(width<=900){
   check(await page.locator('.uv-home-image').evaluate(el=>el.getBoundingClientRect().height),190);
  }
  if(width<=640){
   const bar=page.locator('.uv-mobile-action-bar');
   check(await bar.getByRole('link',{name:'Apply now',exact:true}).getAttribute('data-open-lead'),'true');
   check(await bar.getByRole('link',{name:'Browse courses',exact:true}).getAttribute('href'),'/courses');
  }
 }
 await page.setViewportSize({width:390,height:844});
 const metrics=await hero.evaluate(el=>({heroHeight:Math.round(el.getBoundingClientRect().height),searchBottom:Math.round(el.querySelector('form').getBoundingClientRect().bottom)}));
 if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH,fullPage:false});
 await hero.getByRole('link',{name:'Online MBA',exact:true}).click();await page.waitForURL('**/courses?q=MBA');
 check(await page.locator('.uv-course-list-card').count()>1,true);
 check((await page.locator('.uv-course-list-card').allTextContents()).some(text=>text.includes('Sikkim')),true);
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.getByRole('search',{name:'Find a course',exact:true}).getByLabel('Search courses',{exact:true}).fill('BCA');
 await page.getByRole('search',{name:'Find a course',exact:true}).getByRole('button',{name:'Search',exact:true}).click();await page.waitForURL('**/courses?q=BCA');
 check(await page.getByLabel('Search courses',{exact:true}).inputValue(),'BCA');check(await page.locator('.uv-course-list-card').count()>0,true);
 check(errors,[]);console.log(`PASS ${checks} homepage discovery browser checks; mobile metrics ${JSON.stringify(metrics)}; no lead/OTP submissions.`);
}finally{await browser.close();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});

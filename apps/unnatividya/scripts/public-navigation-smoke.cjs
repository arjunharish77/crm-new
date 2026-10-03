// Read-only navigation checks: never submits lead or OTP forms.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/courses',{waitUntil:'networkidle'});
 const main=page.getByRole('navigation',{name:'Main navigation',exact:true});
 check(await main.getByRole('link',{name:'Courses',exact:true}).getAttribute('aria-current'),'page');
 const resources=main.getByRole('button',{name:'Resources',exact:true});await resources.click();
 check(await main.getByRole('link',{name:/^Degree guides/}).isVisible(),true);
 await page.keyboard.press('Tab');check(await main.getByRole('link',{name:/^Degree guides/}).evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Escape');check(await resources.getAttribute('aria-expanded'),'false');check(await resources.evaluate(el=>el===document.activeElement),true);
 await main.getByRole('button',{name:'Tools',exact:true}).click();
 check(await main.getByRole('link',{name:/^EMI calculator/}).getAttribute('href'),'/tools/emi-calculator');
 check(await main.getByRole('link',{name:/^Find my course/}).getAttribute('href'),'/recommender');
 await page.getByRole('heading',{level:1}).click();check(await main.getByRole('button',{name:'Tools',exact:true}).getAttribute('aria-expanded'),'false');
 await resources.click();await main.getByRole('link',{name:/^Articles/}).click();await page.waitForURL('**/blog');
 check(await page.getByRole('heading',{level:1}).innerText(),'Online learning articles');check((await page.title()).includes('Online Learning Articles'),true);
 check(await page.getByRole('link',{name:'Subscribe',exact:true}).count(),0);
 check(await main.getByRole('button',{name:'Resources',exact:true}).getAttribute('aria-expanded'),'false');
 for(const width of [320,390,768,1100]){
  await page.setViewportSize({width,height:844});
  const toggle=page.getByRole('button',{name:'Open menu',exact:true});await toggle.click();
  const mobile=page.getByRole('navigation',{name:'Mobile navigation',exact:true});check(await mobile.isVisible(),true);
  await mobile.getByRole('button',{name:'Resources',exact:true}).click();
  check(await mobile.getByRole('link',{name:/^Articles/}).getAttribute('aria-current'),'page');
  await mobile.getByRole('link',{name:/^Articles/}).focus();await page.keyboard.press('Escape');
  check(await mobile.getByRole('button',{name:'Resources',exact:true}).getAttribute('aria-expanded'),'false');
  await page.keyboard.press('Escape');check(await mobile.isVisible(),false);
  check(await page.getByRole('button',{name:'Open menu',exact:true}).evaluate(el=>el===document.activeElement),true);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open menu',exact:true}).click();
 const mobile=page.getByRole('navigation',{name:'Mobile navigation',exact:true});
 await mobile.getByRole('button',{name:'Tools',exact:true}).click();
 if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH,fullPage:false});
 await mobile.getByRole('link',{name:/^EMI calculator/}).click();await page.waitForURL('**/tools/emi-calculator');check(await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).isVisible(),false);
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.setViewportSize({width:1440,height:900});await page.setViewportSize({width:390,height:844});
 check(await page.getByRole('button',{name:'Open menu',exact:true}).getAttribute('aria-expanded'),'false');
 check(errors,[]);console.log(`PASS ${checks} public navigation browser checks; no forms submitted.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

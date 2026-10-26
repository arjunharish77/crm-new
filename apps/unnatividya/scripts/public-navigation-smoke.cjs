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
 // UI redesign Q3/Q4: flat links plus Guides/Tools, search icon, "Saved courses", no phone links.
 check(await main.getByRole('link',{name:'Specializations',exact:true}).getAttribute('href'),'/specializations');
 check(await page.getByRole('link',{name:'Search courses',exact:true}).getAttribute('href'),'/courses#course-search');
 check(await page.getByRole('link',{name:/^Saved courses/}).first().getAttribute('href'),'/shortlist');
 check(await page.locator('a[href^="tel:"]').count(),0);
 const resources=main.getByRole('button',{name:'Guides',exact:true});await resources.click();
 check(await main.getByRole('link',{name:/^Degree guides/}).isVisible(),true);
 // Owner decision 25 October 2026: the six Wave 5 hubs are in the Guides menu.
 check(await page.locator('#uvh-desktop-guides a').evaluateAll(els=>els.map(el=>el.getAttribute('href')).filter(href=>/^\/online-degree-guides\/[a-z-]+$/.test(href))),['/online-degree-guides/fees','/online-degree-guides/admissions','/online-degree-guides/international','/online-degree-guides/online-learning','/online-degree-guides/computing','/online-degree-guides/commerce-humanities']);
 await page.keyboard.press('Tab');check(await main.getByRole('link',{name:/^Degree guides/}).evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Escape');check(await resources.getAttribute('aria-expanded'),'false');check(await resources.evaluate(el=>el===document.activeElement),true);
 await main.getByRole('button',{name:'Tools',exact:true}).click();
 check(await main.getByRole('link',{name:/^EMI calculator/}).getAttribute('href'),'/tools/emi-calculator');
 check(await main.getByRole('link',{name:/^Find my course/}).getAttribute('href'),'/recommender');
 // Click outside the header and the (wide, sectioned) Tools panel: the bottom-left of the page.
 await page.mouse.click(8,(page.viewportSize()?.height||900)-8);check(await main.getByRole('button',{name:'Tools',exact:true}).getAttribute('aria-expanded'),'false');
 await resources.click();await main.getByRole('link',{name:/^Articles/}).click();await page.waitForURL('**/blog');
 check(await page.getByRole('heading',{level:1}).innerText(),'Online learning articles');check((await page.title()).includes('Online Learning Articles'),true);
 check(await page.getByRole('link',{name:'Subscribe',exact:true}).count(),0);
 check(await main.getByRole('button',{name:'Guides',exact:true}).getAttribute('aria-expanded'),'false');
 for(const width of [320,390,768,1079]){ // the header switches to the menu below 1080px (UI redesign)
  await page.setViewportSize({width,height:844});
  const toggle=page.getByRole('button',{name:'Open menu',exact:true});await toggle.click();
  const mobile=page.getByRole('navigation',{name:'Mobile navigation',exact:true});check(await mobile.isVisible(),true);
  await mobile.getByRole('button',{name:'Guides',exact:true}).click();
  check(await mobile.getByRole('link',{name:/^Articles/}).getAttribute('aria-current'),'page');
  await mobile.getByRole('link',{name:/^Articles/}).focus();await page.keyboard.press('Escape');
  check(await mobile.getByRole('button',{name:'Guides',exact:true}).getAttribute('aria-expanded'),'false');
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
 // Social profiles (owner, 26 October 2026): footer links that open in a new tab, and the Organization sameAs data.
 const SOCIAL=['https://www.youtube.com/@Unnati_Vidya','https://www.instagram.com/unnati_vidya','https://www.facebook.com/unnatividya'];
 check(await page.locator('footer .uv-social a').evaluateAll(els=>els.map(el=>[el.getAttribute('href'),el.target,el.rel.includes('noopener')])),SOCIAL.map(href=>[href,'_blank',true]));
 check(await page.locator('script[type="application/ld+json"]').evaluateAll(els=>els.map(el=>JSON.parse(el.textContent)).flat().find(item=>item['@type']==='Organization'&&item.url)?.sameAs),SOCIAL);
 // On a hub, only the hub is the current page in the Guides menu, not also "Degree guides".
 await page.goto(base+'/online-degree-guides/fees',{waitUntil:'load'});
 check(await page.locator('#uvh-desktop-guides a[aria-current="page"]').evaluateAll(els=>els.map(el=>el.getAttribute('href'))),['/online-degree-guides/fees']);
 check(errors,[]);console.log(`PASS ${checks} public navigation browser checks; no forms submitted.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

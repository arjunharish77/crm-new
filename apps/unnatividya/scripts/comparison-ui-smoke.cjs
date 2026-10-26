// Local UI-only checks. Access responses are mocked, never OTP or lead submissions.
// Waits for 'load', not 'networkidle': under Next.js 16.3 the comparison pages' link prefetches stay
// open in the browser (the server answers them at once), so the network never goes idle.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/compare-access',route=>route.fulfill({json:{unlocked:false}}));
 await page.route('**/api/leads{,/**}',route=>route.abort());await page.route('**/api/otp/**',route=>route.abort());
 // A first visit without ?add= shows the default pair but never pre-fills the shared compare list.
 await page.goto(base+'/compare',{waitUntil:'load'});check(await page.locator('.comparison-slot').count(),2);
 await page.waitForTimeout(300);check(await page.evaluate(()=>localStorage.getItem('uv_compare')),null);
 await page.goto(base+'/compare?add=mba-muj&add=mba-muj,invalid,mba-amity&utm_source=ui-test',{waitUntil:'load'});
 check(await page.locator('.comparison-slot').count(),2);
 check(await page.getByRole('table').count(),0);check(await page.getByRole('heading',{name:'Unlock the full comparison'}).isVisible(),true);
 // Locked: the skeleton holds no program values and nothing in it can be focused; Apply now opens the lead flow.
 const locked=page.locator('.uv-cmp-locked');check(await locked.locator('.uv-cmp-skeleton').getAttribute('aria-hidden'),'true');
 check(/₹|\d+%|LPA|tracks/.test(await locked.locator('.uv-cmp-skeleton').innerText()),false);
 check(await locked.locator('a,button,input,select,[tabindex]').count(),1);
 const unlock=locked.getByRole('link',{name:'Apply now',exact:true});check(await unlock.getAttribute('href'),'/lead?intent=compare-unlock');check(await unlock.getAttribute('data-open-lead')!==null,true);check(await unlock.getAttribute('rel'),'nofollow');
 check(await page.getByRole('button',{name:'Print / Save as PDF'}).count(),0);
 // An explicit ?add= is the learner's selection: the shared list (tray, card toggles) follows it.
 await page.waitForFunction(()=>localStorage.getItem('uv_compare')==='["mba-muj","mba-amity"]');check(await page.evaluate(()=>JSON.parse(localStorage.getItem('uv_compare'))),['mba-muj','mba-amity']);
 const add=page.getByRole('button',{name:'Add a program',exact:true});await add.click();
 const search=page.getByRole('searchbox',{name:'Search programs'});check(await search.evaluate(el=>el===document.activeElement),true);
 await search.fill('zzzzz-no-course');check(await page.locator('.comparison-results li').count(),0);
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();check(await search.inputValue(),'');
 await page.getByLabel('Degree level',{exact:true}).selectOption('UG');await page.getByLabel('University',{exact:true}).selectOption('smu');
 check(await page.locator('.comparison-results li').count()>0,true);check((await page.locator('.comparison-results li').allTextContents()).every(t=>t.includes('SMU')),true);
 await page.keyboard.press('Escape');check(await add.evaluate(el=>el===document.activeElement),true);check(await page.locator('#comparison-picker').count(),0);
 await add.click();await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 await page.getByRole('button',{name:'Add Online MBA — SMU',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.comparison-slot').length===3,null,{timeout:5000});check(await page.locator('.comparison-slot').count(),3);check(await page.locator('#comparison-picker').count(),0);
 check(await page.locator('#comparison-selection-title').evaluate(el=>el===document.activeElement),true);
 check(new URL(page.url()).searchParams.get('utm_source'),'ui-test');
 await page.goBack();check(await page.locator('.comparison-slot').count(),2);await page.goForward();check(await page.locator('.comparison-slot').count(),3);
 await page.reload({waitUntil:'load'});check(await page.locator('.comparison-slot').count(),3);
 for(let i=0;i<3;i++)await page.locator('.comparison-remove').first().click();
 check(await page.locator('.comparison-slot').count(),0);await page.reload({waitUntil:'load'});check(await page.locator('.comparison-slot').count(),0);
 check(await page.getByText('Select at least two programs above to start comparing.').isVisible(),true);check(await page.evaluate(()=>localStorage.getItem('uv_compare')),'[]');
 // Mock unlocked UI only; does not change the server's access policy.
 await page.unroute('**/api/compare-access');await page.route('**/api/compare-access',route=>route.fulfill({json:{unlocked:true}}));
 await page.goto(base+'/compare?add=mba-muj,mba-smu,mba-amity',{waitUntil:'load'});
 // The table renders after the (mocked) access check resolves; wait for it instead of racing it.
 await page.getByRole('table').waitFor();check(await page.getByRole('table').count(),1);check(await page.locator('thead th').count(),4);check(await page.locator('tbody tr').count(),13); // + "Fee outside India" (wave 2)
 // No winner highlighting (plan §5 row 4); placement figures stay labelled university-wide.
 check(await page.locator('.uv-cmp-table').getByText(/^(Best|Lowest)$/).count(),0);check(await page.getByRole('rowheader',{name:'Placement rate (university-wide)'}).count(),1);
 // Share copies the ids-only link; Print appears once unlocked.
 await page.getByRole('button',{name:'Share',exact:true}).click();await page.getByRole('button',{name:'Link copied',exact:true}).waitFor();
 check(await page.evaluate(()=>navigator.clipboard.readText()),base+'/compare?add=mba-muj,mba-smu,mba-amity');
 check(await page.getByRole('button',{name:'Print / Save as PDF'}).isVisible(),true);
 // The differences-only toggle hides identical rows (Duration and Level are the same for the three MBAs).
 const diff=page.getByLabel('Show differences only');await diff.check();check(await page.getByRole('rowheader',{name:'Duration'}).isVisible(),false);await diff.uncheck();check(await page.getByRole('rowheader',{name:'Duration'}).isVisible(),true);
 for(const width of [320,390,768,1024,1280]){
  await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check(await page.locator('.uv-cmp-table-wrap').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  check(await page.locator('.uv-cmp-who').first().isVisible(),width<860);
  check(await page.locator('.comparison-remove').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().width>=44)),true);
 }
 // Desktop column headers stick under the 68px site header (no overflow:hidden ancestor).
 await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>scrollTo(0,document.querySelector('.uv-cmp-table tbody').getBoundingClientRect().bottom+scrollY-500));
 check(Math.round(await page.locator('.uv-cmp-table thead th').first().evaluate(el=>el.getBoundingClientRect().top)),68);
 await page.setViewportSize({width:390,height:844});await page.locator('.uv-cmp-table-wrap').scrollIntoViewIfNeeded();
 if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 await page.locator('.comparison-remove').first().click();await page.getByRole('button',{name:'Add a program',exact:true}).click();
 for(const width of [320,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 check(errors,[]);console.log(`PASS ${checks} comparison UI checks; access mocked, no records or OTP sends.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

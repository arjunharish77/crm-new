// Local calculator checks; no lead or OTP submissions.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3001';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/leads{,/**}',route=>route.abort());await page.route('**/api/otp/**',route=>route.abort());
 await page.goto(base+'/tools/emi-calculator',{waitUntil:'networkidle'});
 const amount=async key=>Number((await page.locator(`[data-emi="${key}"]`).innerText()).replace(/[^\d.-]/g,''));
 const fee=page.getByLabel('Total program fee (₹)',{exact:true}),down=page.getByLabel('Down payment (₹)',{exact:true}),months=page.getByLabel('Repayment period (months)',{exact:true}),rate=page.getByLabel('Annual interest rate (%)',{exact:true});
 check(await amount('monthly'),6667);check(await amount('overall'),180000);check(await amount('repayment'),160000);
 await fee.fill('120000');await down.fill('0');await months.fill('12');await rate.fill('12');
 check(await amount('monthly'),10662);check(await amount('repayment'),127942);check(await amount('interest'),7942);
 await down.fill('20000');await rate.fill('0');check(await amount('overall'),120000);check(await amount('principal'),100000);
 await down.fill('120000');check(await amount('monthly'),0);check(await amount('overall'),120000);check(await page.getByText('No loan needed for these inputs.').isVisible(),true);
 await down.fill('120001');check(await down.getAttribute('aria-invalid'),'true');check(await page.locator('[data-emi="monthly"]').count(),0);
 await down.fill('0');await months.fill('0');check(await months.getAttribute('aria-invalid'),'true');await months.fill('1.5');check(await months.getAttribute('aria-invalid'),'true');await months.fill('24');
 await rate.fill('-1');check(await rate.getAttribute('aria-invalid'),'true');await rate.fill('51');check(await rate.getAttribute('aria-invalid'),'true');await rate.fill('0');
 await fee.fill('');check(await fee.getAttribute('aria-invalid'),'true');check(await page.locator('[data-emi="monthly"]').count(),0);
 await fee.fill('0');check(await amount('overall'),0);
 await page.getByLabel('Choose a program (optional)',{exact:true}).selectOption('mba-muj');check(await months.inputValue(),'24');check(Number(await fee.inputValue())>0,true);
 check(await page.getByRole('link',{name:'View selected course'}).isVisible(),true);
 await fee.fill('123456');check(await page.getByLabel('Choose a program (optional)',{exact:true}).inputValue(),'');check(await page.getByRole('link',{name:'View selected course'}).count(),0);
 await down.fill('10000');await months.fill('120');await rate.fill('0.01');check(await amount('monthly')>0,true);
 for(const width of [320,390,768,1024,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check(await page.locator('.emi-result').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
 await page.setViewportSize({width:390,height:844});await page.locator('.emi-result').scrollIntoViewIfNeeded();if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 check(errors,[]);console.log(`PASS ${checks} EMI calculation/UI checks; no records or messages created.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

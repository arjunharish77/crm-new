// No real authentication or email delivery: login endpoints blocked before navigation.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.UV_TEST_URL || 'http://localhost:3001';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local endpoint required');
let checks=0;function check(a,b){assert.deepEqual(a,b);checks++;}
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const context=await browser.newContext();
 await context.route('**/*',r=>r.request().method()==='GET'?r.continue():r.abort());
 const page=await context.newPage();
 await page.route('**/api/admin/login/**',r=>r.abort());
 await page.goto(base+'/admin/login',{waitUntil:'networkidle'});
 const panel=page.locator('.admin-auth-panel');
 await page.getByLabel('Email',{exact:true}).fill('ui-login@example.invalid');await page.getByLabel('Password',{exact:true}).fill('fake-test-password');
 await page.getByRole('button',{name:'Show password',exact:true}).click();check(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');
 await page.getByRole('button',{name:'Hide password',exact:true}).click();check(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'password');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await panel.getByRole('alert').waitFor();
 check(await page.getByLabel('Email',{exact:true}).inputValue(),'ui-login@example.invalid');check(await page.getByLabel('Password',{exact:true}).inputValue(),'fake-test-password');
 check(await page.getByRole('button',{name:'Continue',exact:true}).isEnabled(),true);
 await page.route('**/api/admin/login/request',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Mock invalid credentials'})}));
 await page.getByRole('button',{name:'Continue',exact:true}).click();await panel.getByText('Mock invalid credentials',{exact:true}).waitFor();checks++;
 await page.route('**/api/admin/login/request',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({requiresOtp:true,email:'u***@example.invalid'})}));
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Email OTP',{exact:true}).waitFor();
 check(await page.getByLabel('Email OTP',{exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.getByLabel('Email OTP',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify and open CMS',exact:true}).click();await panel.getByRole('alert').waitFor();
 check(await page.getByLabel('Email OTP',{exact:true}).inputValue(),'123456');check(await page.getByRole('button',{name:'Verify and open CMS',exact:true}).isEnabled(),true);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.getByRole('button',{name:'Use a different login',exact:true}).click();await page.getByLabel('Email',{exact:true}).waitFor();
 check(await panel.getByRole('alert').count(),0);check(await page.getByLabel('Email',{exact:true}).inputValue(),'ui-login@example.invalid');check(await page.getByLabel('Password',{exact:true}).inputValue(),'');
 await page.setViewportSize({width:390,height:844});await page.getByLabel('Email',{exact:true}).blur();
 if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 console.log(`PASS ${checks} login UI checks; all authentication requests blocked or mocked.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

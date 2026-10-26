// Local browser-only shortlist fixtures. No catalog writes or lead/OTP sends.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/leads{,/**}',route=>route.abort());await context.route('**/api/otp/**',route=>route.abort());
 const empty=page.getByRole('heading',{name:'Your shortlist is empty'});
 await page.goto(base+'/shortlist',{waitUntil:'networkidle'});check(await empty.isVisible(),true);
 check(await page.getByRole('heading',{level:1,name:'Saved courses'}).isVisible(),true);
 check(await page.getByRole('main').getByRole('link',{name:'Browse programs'}).getAttribute('href'),'/courses');check(await page.getByRole('main').getByRole('link',{name:'Find my course'}).getAttribute('href'),'/recommender');
 check(await page.locator('.uv-sl-suggest .uv-card').count(),3);check(await page.getByRole('button',{name:'Clear all'}).count(),0);
 for(const raw of ['null','{}','42','"bad"','not-json']){
  await page.evaluate(raw=>localStorage.setItem('uv_shortlist',raw),raw);await page.reload({waitUntil:'networkidle'});
  check(await empty.isVisible(),true);
 }
 await page.evaluate(()=>{localStorage.setItem('uv_shortlist',JSON.stringify(['mba-muj','mba-smu','mba-amity','bca-muj','mba-muj',null,7,'missing-course']));window.dispatchEvent(new Event('uv-shortlist-changed'));});
 const cards=page.locator('.uv-sl-grid [data-course-id]');await cards.first().waitFor();check(await cards.count(),4);
 check(await page.getByText('4 saved programs · saved on this device').isVisible(),true);
 // With nothing marked for comparison, "Compare 3" opens the first three saved programs.
 const ids=await cards.evaluateAll(els=>els.map(el=>el.dataset.courseId));
 const compare3=page.getByRole('link',{name:'Compare 3',exact:true});check(new URL(base+await compare3.getAttribute('href')).searchParams.get('add'),ids.slice(0,3).join(','));
 // Choosing uses the shared compare list (the cards' Compare toggles).
 await cards.nth(0).getByRole('button',{name:/^Add to compare: /}).click();await cards.nth(3).getByRole('button',{name:/^Add to compare: /}).click();
 const compare2=page.getByRole('link',{name:'Compare 2',exact:true});await compare2.waitFor();check(new URL(base+await compare2.getAttribute('href')).searchParams.get('add'),[ids[0],ids[3]].join(','));
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('uv_compare'))),[ids[0],ids[3]]);
 await cards.nth(3).getByRole('button',{name:/^Remove from compare: /}).click();check(await page.getByRole('link',{name:'Compare 3',exact:true}).isVisible(),true);
 // The bookmark removes a saved course, with undo and focus kept on the page.
 const removedName=await cards.first().getByRole('heading').innerText();
 await cards.first().getByRole('button',{name:/^Remove from saved courses/}).click();await page.waitForFunction(()=>document.querySelectorAll('.uv-sl-grid [data-course-id]').length===3);check(await cards.count(),3);
 check(await page.locator('#shortlist-summary').evaluate(el=>el===document.activeElement),true);
 await page.getByRole('status').filter({hasText:/^Removed .+\.$/}).waitFor({timeout:5000});check(await page.getByRole('status').filter({hasText:/^Removed .+\.$/}).isVisible(),true);
 await page.getByRole('button',{name:'Undo removal'}).click();check(await cards.count(),4);check(await cards.first().getByRole('heading').innerText(),removedName);
 // Separate tab changes use the real browser storage event.
 const other=await context.newPage();await other.goto(base+'/shortlist',{waitUntil:'networkidle'});
 await other.evaluate(()=>localStorage.setItem('uv_shortlist',JSON.stringify(['mba-muj'])));
 await page.waitForFunction(()=>document.querySelectorAll('.uv-sl-grid [data-course-id]').length===1);check(await cards.count(),1);
 check(await page.getByRole('button',{name:'Compare',exact:true}).isDisabled(),true);
 await other.close();await cards.first().getByRole('button',{name:/^Remove from saved courses/}).click();await empty.waitFor();check(await empty.isVisible(),true);
 check(await page.locator('#shortlist-summary').evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Undo removal'}).click();await cards.first().waitFor();check(await cards.count(),1);
 await page.reload({waitUntil:'networkidle'});check(await cards.count(),1);
 // Clear all is reversible too.
 await page.evaluate(()=>{localStorage.setItem('uv_shortlist',JSON.stringify(['mba-muj','mba-smu','mba-amity','bca-muj']));window.dispatchEvent(new Event('uv-shortlist-changed'));});
 await page.waitForFunction(()=>document.querySelectorAll('.uv-sl-grid [data-course-id]').length===4);
 await page.getByRole('button',{name:'Clear all'}).click();await empty.waitFor();check(await page.getByText('Removed 4 saved programs.').isVisible(),true);
 check(await page.evaluate(()=>localStorage.getItem('uv_shortlist')),'[]');
 await page.getByRole('button',{name:'Undo removal'}).click();await page.waitForFunction(()=>document.querySelectorAll('.uv-sl-grid [data-course-id]').length===4);check(await cards.count(),4);
 const opinion=page.locator('.uv-sl-cta').getByRole('link',{name:'Apply now',exact:true});check(await opinion.getAttribute('href'),'/lead?intent=shortlist');check(await opinion.getAttribute('data-open-lead')!==null,true);
 for(const width of [320,390,768,1024,1280]){
  await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check(await cards.evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);
  check(await page.locator('.uv-sl-grid .btn, .uv-sl-hero-actions .btn, .uv-sl-cta .btn, .uv-sl-grid .uv-save').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
 }
 await page.setViewportSize({width:390,height:844});await cards.first().scrollIntoViewIfNeeded();if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 await page.evaluate(()=>{localStorage.setItem('uv_compare','[]');window.dispatchEvent(new Event('uv-compare-changed'));});
 await cards.nth(0).getByRole('button',{name:/^Add to compare: /}).click();await cards.nth(3).getByRole('button',{name:/^Add to compare: /}).click();
 const compare=page.getByRole('link',{name:'Compare 2',exact:true});const expected=new URL(base+await compare.getAttribute('href')).searchParams.get('add');await compare.click();await page.waitForURL('**/compare?add=*');
 check(await page.locator('.comparison-slot').count(),2);check(new URL(page.url()).searchParams.get('add'),expected);
 // Wave 4 A5: private notes, a shared link of ids, and a separate shared view for another visitor.
 const notesCtx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const np=await notesCtx.newPage();np.on('pageerror',e=>errors.push(e.message));
 await np.goto(base+'/courses',{waitUntil:'load'});await np.evaluate(()=>localStorage.setItem('uv_shortlist',JSON.stringify(['mba-muj','mca-smu'])));
 await np.goto(base+'/shortlist',{waitUntil:'networkidle'});const noteCard=np.locator('.uv-sl-grid [data-course-id="mba-muj"]');
 await noteCard.getByText('Add a note').click();await noteCard.getByLabel(/^Note for /).fill('Ask about the July intake');
 await np.reload({waitUntil:'networkidle'});check(await np.locator('.uv-sl-grid [data-course-id="mba-muj"] textarea').inputValue(),'Ask about the July intake');
 check(await np.evaluate(()=>JSON.parse(localStorage.getItem('uv_shortlist_notes'))),{'mba-muj':'Ask about the July intake'});
 check(await np.getByRole('button',{name:'Print',exact:true}).isVisible(),true);
 await np.getByRole('button',{name:'Copy link',exact:true}).click();await np.getByRole('button',{name:'Link copied',exact:true}).or(np.getByLabel('Copy this link to share your saved programs')).first().waitFor();
 await notesCtx.close();
 const sharedCtx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const sp=await sharedCtx.newPage();sp.on('pageerror',e=>errors.push(e.message));
 await sp.goto(base+'/shortlist?ids=mba-muj,not-a-course,bca-muj',{waitUntil:'networkidle'});
 const sharedSection=sp.getByRole('region',{name:'Shared with you'});check(await sharedSection.locator('.uv-card').count(),2);
 check(await sp.evaluate(()=>localStorage.getItem('uv_shortlist')),null);
 await sharedSection.getByRole('button',{name:'Save these 2',exact:true}).click();await sp.getByRole('heading',{name:'Your saved programs'}).waitFor();
 check(await sp.evaluate(()=>JSON.parse(localStorage.getItem('uv_shortlist'))),['mba-muj','bca-muj']);check(new URL(sp.url()).searchParams.has('ids'),false);
 await sharedCtx.close();
 check(errors,[]);console.log(`PASS ${checks} shortlist UI/storage checks; browser fixtures only, no server records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

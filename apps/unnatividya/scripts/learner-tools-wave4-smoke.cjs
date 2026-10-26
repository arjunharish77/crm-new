// Wave 4 tools: recognition check (A2) and admission document checklist (A1). Read-only browser checks;
// Apply now is inspected, never submitted. Only disposable browser storage changes.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3100';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/leads{,/**}',route=>route.abort());
 // Header Tools menu lists both new tools.
 await page.goto(base+'/',{waitUntil:'networkidle'});const main=page.getByRole('navigation',{name:'Main navigation'});
 await main.getByRole('button',{name:'Tools',exact:true}).click();
 check(await main.getByRole('link',{name:/Recognition check/}).getAttribute('href'),'/tools/recognition-check');
 check(await main.getByRole('link',{name:/Document checklist/}).getAttribute('href'),'/tools/document-checklist');

 // Recognition check: published results only; every program appears in the table; no personal verdict.
 const recog=await page.goto(base+'/tools/recognition-check?course=mba-muj',{waitUntil:'networkidle'});check(recog.status(),200);
 check(await page.getByRole('heading',{level:1}).count(),1);
 check(await page.locator('#recognition-course').inputValue(),'mba-muj');
 const status=(await page.locator('.uvt-recog-result .uvt-status').innerText()).toLowerCase();
 check(/listed for|being re-checked|confirm the awarding university/.test(status),true);
 if(status.includes('listed for'))check(await page.locator('.uvt-recog-facts dt').allTextContents().then(t=>t.includes('Source')&&t.includes('Checked')),true);
 const robots=await page.locator('meta[name="robots"]').getAttribute('content').catch(()=>null);
 if(status.includes('being re-checked')&&!(await page.locator('.uvt-recog-table .uv-tag-success').count()))check((robots||'').includes('noindex'),true);
 check(await page.locator('.uvt-recog-table tbody tr').count()>=30,true);
 check(await page.locator('.uvt-recog-steps li').count(),4);
 const recogApply=page.locator('.uvt-recog-result').getByRole('link',{name:'Apply now',exact:true});check(await recogApply.getAttribute('data-open-lead'),'true');check(await recogApply.getAttribute('rel'),'nofollow');

 // Document checklist: sourced items by category, ticks kept in this browser, sources listed, print.
 const docs=await page.goto(base+'/tools/document-checklist?course=mba-muj',{waitUntil:'networkidle'});check(docs.status(),200);
 const names=async()=>page.locator('.uvt-docs-list strong').allTextContents();
 check((await names()).includes('Proof of identity: Aadhaar card'),true);check((await names()).includes('Passport'),false);
 await page.getByLabel('Foreign applicant').check();check((await names()).includes('Passport'),true);check((await names()).includes('Proof of identity: Aadhaar card'),false);
 await page.getByLabel('Indian applicant').check();
 await page.locator('.uvt-docs-list input').first().check();await page.reload({waitUntil:'networkidle'});
 check(await page.locator('.uvt-docs-list input').first().isChecked(),true);check((await page.locator('.uvt-docs-progress').innerText()).startsWith('1 of'),true);
 check(await page.locator('.uvt-docs-sources a').count()>=1,true);
 check((await page.locator('.uvt-docs-sources a').evaluateAll(els=>els.map(el=>new URL(el.href).hostname))).every(host=>/onlinemanipal\.com$|amityonline\.com$/.test(host)),true);
 check(await page.getByRole('button',{name:'Print checklist'}).isVisible(),true);
 await page.locator('#documents-course').selectOption('mba-amity');await page.getByLabel('NRI applicant').check();
 check((await page.locator('.uvt-docs-note').innerText()).includes('Confirm with the university'),true);
 check(await page.locator('a[href^="tel:"]').count(),0);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 check(errors,[]);console.log(`PASS ${checks} wave 4 tool checks (recognition check, document checklist); no records created.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

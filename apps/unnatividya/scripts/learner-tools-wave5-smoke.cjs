// Wave 5 learner tools (plan docs/WAVE_5_PLAN_2026-10.md): the sectioned Tools menu (V9) and each
// new tool. Read-only public checks, with no lead or OTP submissions; answers stay in the page.
const assert=require('node:assert/strict');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');const base=process.env.UV_TEST_URL||'http://localhost:3001';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local website required');let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
const RANKING=/\b(best|top pick|winner|recommended for you)\b/i;
(async()=>{// Fake camera and microphone, granted without a prompt, for the exam device check (B1).
const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
// V9: the Tools menu lists every tool in labelled sections; each link is a real page.
await page.goto(base+'/tools/mode-helper',{waitUntil:'load'});
const main=page.getByRole('navigation',{name:'Main navigation'});
await main.getByRole('button',{name:'Tools',exact:true}).click();
const panel=main.locator('#uvh-desktop-tools');
check(await panel.locator('.uvh-panel-heading').allTextContents(),['Choose','Afford','Apply','Study']);
check(await panel.locator('[role="group"]').evaluateAll(els=>els.every(el=>el.getAttribute('aria-labelledby')&&document.getElementById(el.getAttribute('aria-labelledby')))),true);
const toolLinks=await panel.locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));check(new Set(toolLinks).size,toolLinks.length);check(toolLinks.includes('/tools/mode-helper'),true);
check(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),true);
check(await panel.locator('a[aria-current="page"]').getAttribute('href'),'/tools/mode-helper');
await page.keyboard.press('Escape');check(await panel.isVisible(),false);
for(const href of toolLinks){const r=await page.request.get(base+href);check([href,r.status()],[href,200]);}
// B2 mode helper: no result until all four questions are answered; deterministic fit groups.
const questions=page.locator('.uvt-mode-question');check(await questions.count(),4);
check(await page.locator('.uvt-mode-card').count(),0);
// Scroll each option to the middle first, so a click never lands on the sticky header.
const answer=async(picks)=>{for(let i=0;i<picks.length;i++){const option=questions.nth(i).getByRole('button',{name:new RegExp('^'+picks[i])});await option.evaluate(el=>el.scrollIntoView({block:'center'}));await option.click();}};
await answer(['No','Yes','I live outside India']);check(await page.locator('.uvt-mode-card').count(),0);check(await page.getByText('3 of 4 answered').count(),1);
await answer(['No','Yes','I live outside India','Mostly online']);
const fits=async()=>Object.fromEntries(await page.locator('.uvt-mode-card').evaluateAll(els=>els.map(el=>[el.querySelector('h3').textContent,el.dataset.fit])));
check(await fits(),{'Online mode':'fits','Regular (conventional) mode':'unlikely','Open and distance learning (ODL)':'unlikely'});
check(await page.locator('.uvt-mode-card').first().locator('h3').innerText(),'Online mode');
check(await questions.nth(0).getByRole('button',{name:/^No/}).getAttribute('aria-pressed'),'true');
await answer(['Yes','No','Yes','In a classroom']);
check(await fits(),{'Regular (conventional) mode':'fits','Open and distance learning (ODL)':'possible','Online mode':'unlikely'});
await answer(['Sometimes','Yes','Yes','A mix']);
check(await fits(),{'Open and distance learning (ODL)':'fits','Online mode':'fits','Regular (conventional) mode':'possible'});
check(await page.locator('.uvt-mode-card .uvt-source').allTextContents().then(t=>t.every(s=>/Regulation/.test(s))),true);
check(await page.locator('.uvt-mode-equal').innerText().then(t=>t.includes('regulation 22')),true);
check(RANKING.test(await page.locator('.uvt-mode-result').innerText()),false);
const src=page.locator('.uvt-mode-result a[href="https://deb.ugc.ac.in/pdf/20200906.pdf"]');check(await src.getAttribute('target'),'_blank');check(await src.evaluate(el=>el.getBoundingClientRect().height>=44),true);
check(await page.locator('.uvt-mode-result a[href^="/lead?intent=mode-helper"]').count(),1);
await page.getByRole('button',{name:'Start again'}).click();check(await page.locator('.uvt-mode-card').count(),0);check(await page.locator('.uvt-option[aria-pressed="true"]').count(),0);
check(await page.locator('.uvt-mode-options .uvt-option').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
check(await page.locator('script[type="application/ld+json"]').evaluateAll(els=>els.some(el=>el.textContent.includes('"FAQPage"'))),true);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
// B3 study-time planner: the learner's own numbers only; totals, validation and the daily plan.
await page.setViewportSize({width:1280,height:900});await page.goto(base+'/tools/study-planner',{waitUntil:'load'});
const result=page.locator('.uvt-plan-result');check(await result.locator('.uvt-plan-figures').count(),0);
const fill=async(label,value)=>page.getByLabel(label,{exact:true}).fill(String(value));
await fill('Work',45);check(await result.locator('.uvt-plan-figures').count(),0);
await fill('Sleep',49);await fill('Travel',7);
const figures=async()=>Object.fromEntries(await result.locator('.uvt-plan-figures > div').evaluateAll(els=>els.map(el=>[el.querySelector('dt').textContent,el.querySelector('dd').textContent])));
check(await figures(),{'Committed':'101 hours','Free in the week':'67 hours','Planned study':'0 hours','Free after study':'67 hours'});
await fill('Study goal for the week (hours)',12);for(const [day,h] of [['Monday',2],['Wednesday',2],['Saturday',3]])await fill(day,h);
check((await figures())['Planned study'],'7 hours');check(await result.locator('.uvt-plan-summary').innerText(),'Your daily plan is 5 hours short of your goal of 12 hours.');
await fill('Sunday',5);check(await result.locator('.uvt-plan-summary').innerText(),'Your daily plan covers your goal of 12 hours.');
check(await result.locator('.uvt-plan-table tbody tr').count(),7);
await fill('Everything else',57);check(await result.locator('.uvt-plan-summary').innerText().then(t=>t.startsWith('Your plan needs 2 hours more than your free time')),true);
await fill('Family and home',40);check(await result.locator('.uvt-error').first().innerText(),'Your commitments add up to 198 hours, more than the 168 hours in a week.');check(await result.locator('.uvt-plan-figures').count(),0);
await fill('Family and home','');await fill('Monday',30);check(await result.locator('.uvt-error').first().innerText(),'Monday: enter hours from 0 to 24.');
check(RANKING.test(await result.innerText()),false);check(/expects \d|hours a week (is|are) (needed|required)/i.test(await page.locator('main').innerText()),false);
check(await page.locator('.uvt-plan input').evaluateAll(els=>els.every(el=>el.labels&&el.labels.length===1)),true);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
// B5 specialization finder: matches by the universities' own names, filtered by level; links resolve.
await page.setViewportSize({width:1280,height:900});await page.goto(base+'/tools/specialization-finder',{waitUntil:'load'});
const finder=page.locator('.uvt-finder-result');check(await finder.locator('.uvt-finder-list').count(),0);
check(await page.locator('.uvt-finder-areas .uvt-option').count(),11);
await page.getByRole('button',{name:'Finance, banking and accounting'}).click();
const specs=async()=>finder.locator('.uvt-finder-list').first().locator('strong').allTextContents();
const all=await specs();check(all.length>5,true);check(all.every(name=>/financ|account|bank|bfsi|fintech|acca|tax|insurance/i.test(name)),true);
const progs=await finder.locator('.uvt-finder-list').nth(1).locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));check(progs.length>0&&progs.every(h=>/^\/courses\/[a-z0-9-]+#sec-careers$/.test(h)),true);
await page.getByLabel('2. Level (optional)').selectOption('UG');const ug=await specs();check(ug.length>0&&ug.length<all.length,true);
await page.getByLabel('2. Level (optional)').selectOption('');
await page.getByRole('button',{name:'Media, writing and languages'}).click();check((await specs()).some(n=>/medium$/i.test(n)),false);
check(await page.getByRole('button',{name:'Media, writing and languages'}).getAttribute('aria-pressed'),'true');
const specHrefs=await finder.locator('.uvt-finder-list').first().locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));
for(const href of specHrefs.slice(0,3)){const r=await page.request.get(base+href);check([href,r.status()],[href,200]);}
await page.getByRole('button',{name:'Healthcare management'}).click();check(await finder.getByText('No program at this level lists a role that matches this area.').count(),1);
check(await finder.locator('.uvt-source').innerText().then(t=>t.startsWith('Matched by the names')),true);check(RANKING.test(await finder.innerText()),false);
check(await page.locator('.uvt-finder-list a, .uvt-finder-areas .uvt-option').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
// B4 EMI v2: upfront (published full-payment plan or listed tuition, less only a discount the learner enters),
// the published semester schedule when one exists, and the loan plan; differences as numbers only.
await page.setViewportSize({width:1280,height:900});await page.goto(base+'/tools/emi-calculator?course=mba-muj',{waitUntil:'load'});
const ways=page.getByRole('region',{name:'Ways to pay: upfront, each semester or a loan'});await ways.waitFor();
const rupees=t=>Number(t.replace(/[^0-9]/g,''));
const listed=rupees(await page.getByLabel('Total program fee (₹)',{exact:true}).inputValue());
const upfrontTotal=async()=>rupees(await ways.locator('[data-emi="upfront-total"]').innerText());
check(await upfrontTotal(),listed);check((await ways.innerText()).includes('The listed tuition')||(await ways.innerText()).includes('published full-payment amount'),true);
await ways.getByLabel(/^One-time discount/).fill('5000');check(await upfrontTotal(),listed-5000);check((await ways.innerText()).includes('less your ₹5,000 discount'),true);
const plan=rupees(await ways.locator('[data-emi="plan-total"]').innerText());
check((await ways.locator('[data-emi="schedule-difference"]').innerText()).includes(`the loan plan totals ₹${Math.abs(plan-(listed-5000)).toLocaleString('en-IN')} ${plan-(listed-5000)>=0?'more':'less'}`),true);
await ways.getByLabel(/^One-time discount/).fill('-1');check(await ways.locator('.uvt-error').innerText(),'Enter a discount from ₹0 to ₹1,00,00,000.');check(await ways.locator('[data-emi="upfront-total"]').count(),0);
await ways.getByLabel(/^One-time discount/).fill('');check(await upfrontTotal(),listed);
check((await ways.innerText()).includes('Key Facts Statement'),true);check(RANKING.test(await ways.innerText()),false);
for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
// B1 exams and device check: sourced exam facts per university; checks from what the browser reports;
// camera and microphone only on this page (V10), started on click and stopped on Stop.
await page.setViewportSize({width:1280,height:900});
check(await page.evaluate(()=>document.featurePolicy?document.featurePolicy.allowsFeature('camera'):null),false);
await page.goto(base+'/tools/exam-check',{waitUntil:'load'});
check(await page.evaluate(()=>document.featurePolicy?[document.featurePolicy.allowsFeature('camera'),document.featurePolicy.allowsFeature('microphone')]:null),[true,true]);
check(await page.locator('.uvt-exam-checks').count(),0);
await page.getByRole('button',{name:'Manipal University Jaipur'}).click();
check(await page.locator('.uvt-exam-reqs dt').allTextContents(),['Computer','Operating system','Hardware','Camera and microphone','Internet','Browser']);
check(await page.locator('.uvt-exam-checks strong').allTextContents(),['Computer','Operating system','Browser','Memory','Processor','Internet']);
check(await page.locator('.uvt-exam-checks li').filter({hasText:'Processor'}).locator('.uvt-status').innerText(),'CHECK YOURSELF');
const examSource=page.locator('.uvt-exam a[href="https://www.onlinemanipal.com/blogs/what-is-the-examination-process-for-online-degree-students"]');check(await examSource.getAttribute('target'),'_blank');
check(await page.locator('.uvt-exam').innerText().then(t=>t.includes('updated 3 November 2025')),true);
await page.getByRole('button',{name:'Sikkim Manipal University'}).click();check(await page.locator('.uvt-exam-checks strong').allTextContents().then(t=>t.includes('Screen resolution')),true);
await page.getByRole('button',{name:'Amity University Online'}).click();
check(await page.locator('.uvt-exam-checks strong').allTextContents(),['Computer','Operating system','Internet']);
check(await page.locator('.uvt-exam a[href="https://amityonline.com/blog/amity-online-conduct-exams-for-bba-mba-students"]').count(),1);
await page.getByRole('button',{name:'Sikkim Manipal University'}).click();
check(await page.locator('video.uvt-exam-video').isVisible(),false);
await page.getByRole('button',{name:'Test camera and microphone'}).click();
await page.locator('video.uvt-exam-video').waitFor({state:'visible'});
check(await page.locator('.uvt-exam-media-result strong').allTextContents(),['Camera','Microphone']);
check(await page.locator('.uvt-exam-media-result').innerText().then(t=>/Your camera works \(\d+×\d+/.test(t)),true);
check(await page.getByRole('meter',{name:'Microphone level'}).count(),1);
check(await page.evaluate(()=>document.querySelector('video.uvt-exam-video').srcObject.getTracks().every(t=>t.readyState==='live')),true);
const tracks=await page.evaluateHandle(()=>document.querySelector('video.uvt-exam-video').srcObject.getTracks());
await page.getByRole('button',{name:'Stop camera and microphone'}).click();
check(await tracks.evaluate(list=>list.every(t=>t.readyState==='ended')),true);check(await page.locator('video.uvt-exam-video').isVisible(),false);
check(RANKING.test(await page.locator('.uvt-exam').innerText()),false);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
// The mobile menu shows the same sections.
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open menu',exact:true}).click();
const mobile=page.getByRole('navigation',{name:'Mobile navigation',exact:true});await mobile.getByRole('button',{name:'Tools',exact:true}).click();
check(await mobile.locator('#uvh-mobile-tools .uvh-panel-heading').allTextContents(),['Choose','Afford','Apply','Study']);
check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
check(errors,[]);console.log(`PASS ${checks} Wave 5 learner-tool checks; no records changed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

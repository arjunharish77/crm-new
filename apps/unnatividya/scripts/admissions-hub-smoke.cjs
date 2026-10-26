// Wave 4 hub C3 (decisions W8–W10): the admissions hub, the guides hub links and the eligibility
// guides' switch to published CMS eligibility. Local only. The last part writes the prepared MCA
// (SMU) eligibility correction straight into the local course record, checks the guide, then
// restores the original record. No lead or OTP submissions.
const assert=require('node:assert/strict');const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {Client}=require('pg');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UV_TEST_URL||'http://localhost:3001';const connectionString=process.env.UNNATIVIDYA_DATABASE_URL;
if(!connectionString||![connectionString,base].every(value=>['localhost','127.0.0.1'].includes(new URL(value).hostname)))throw Error('Local endpoints required');
const prepared=require('../src/data/prepared-eligibility-drafts.json').find(item=>item.courseId==='mca-smu');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{const db=new Client({connectionString});await db.connect();let original=null;
const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Guides hub: both hub cards, each at least 44px tall.
await page.goto(base+'/online-degree-guides',{waitUntil:'load'});
check(await page.locator('.uv-g-hublinks a').evaluateAll(els=>els.map(el=>el.getAttribute('href'))),['/online-degree-guides/fees','/online-degree-guides/admissions','/online-degree-guides/international','/online-degree-guides/computing','/online-degree-guides/commerce-humanities','/online-degree-guides/online-learning']);
check(await page.locator('.uv-g-hublinks a').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
// Admissions hub.
await page.locator('.uv-g-hublinks a[href="/online-degree-guides/admissions"]').click();await page.waitForURL('**/online-degree-guides/admissions');
check(await page.getByRole('heading',{level:1}).innerText().then(t=>t.startsWith('How to apply for an online degree at ')),true);
check(await page.locator('.uv-adm-order > li').count(),5);
for(const href of ['/tools/eligibility-checker','/tools/recognition-check','/tools/document-checklist'])check(await page.locator(`#adm-order a[href="${href}"]`).count(),1);
check(await page.locator('#adm-order a[href^="https://www.ugc.gov.in/"]').getAttribute('target'),'_blank');
const degreeLinks=await page.locator('.uv-adm-degrees a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));check(degreeLinks.length>=10,true);check(degreeLinks.every(href=>/^\/online-degree-guides\/[a-z0-9-]+-eligibility$/.test(href)),true);
check(await page.locator('.uv-adm-degrees a').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),true);
check(await page.locator('.uv-adm-sources a').evaluateAll(els=>els.length>=3&&els.every(el=>el.href.startsWith('https://')&&el.target==='_blank')),true);
check(await page.locator('.uv-adm-steps > li').count(),3);check(await page.locator('.uv-adm-steps > li ol li').count()>=9,true);
// W9: no intake dates or deadlines on the hub.
check(/\b(deadline|last date)\b[^.]*\b(20\d\d|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(await page.locator('main').innerText()),false);
check(await page.locator('script[type="application/ld+json"]').evaluateAll(els=>els.some(el=>el.textContent.includes('"FAQPage"'))),true);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
await page.setViewportSize({width:390,height:844});
// Eligibility guide before the correction is published: the hand-written fact, no dated card.
await page.goto(base+'/online-degree-guides/mca-eligibility',{waitUntil:'load'});
const smuCard=()=>page.locator('#guide-overview .uv-read-card').filter({has:page.getByRole('heading',{name:'Sikkim Manipal University'})});
const hasRecord=async()=>(await smuCard().locator('.uv-read-card-source').count())>0;
const before=await hasRecord();check(await page.locator('#guide-related a[href="/online-degree-guides/admissions"]').count(),1);
// W10: publish the prepared correction (as the CMS loader writes it), then the guide shows it by category.
original=(await db.query('select data, updated_at from course where id=$1',['mca-smu'])).rows[0];
if(before){console.log('NOTE mca-smu already has a published eligibility record; checking it as is.');}
else{
 const eligibility=`Indian applicants: ${prepared.domestic}\n\nNRI / foreign applicants: ${prepared.international}`;
 const data={...original.data,eligibility,eligibilityReview:{status:'NEEDS_REVIEW',checkedAt:prepared.checkedAt,sourceUrl:prepared.sourceUrl,notes:prepared.notes},sourceUrls:[...new Set([...(original.data.sourceUrls||[]),prepared.sourceUrl])]};
 await db.query('update course set data=$2, updated_at=now() where id=$1',['mca-smu',data]);
 await page.goto(base+'/online-degree-guides/mca-eligibility',{waitUntil:'load'});
}
const card=smuCard();check(await hasRecord(),true);
check(await card.locator('p strong').allTextContents(),['Indian applicants:','NRI / foreign applicants:']);
check(await card.locator('.uv-read-card-source a').getAttribute('href'),prepared.sourceUrl);
check(await card.locator('.uv-read-card-source a').evaluate(el=>el.getBoundingClientRect().height>=44),true);
check(await page.locator('#guide-overview .uv-read-caption').innerText().then(t=>t.includes('takes precedence')),true);
check(await page.locator('#guide-sources a').evaluateAll((els,url)=>els.some(el=>el.getAttribute('href')===url),prepared.sourceUrl),true);
check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
check(errors,[]);console.log(`PASS ${checks} admissions hub and eligibility-guide checks; local record restored, no proposals saved.`);
}finally{
 if(original)await db.query('update course set data=$2, updated_at=$3 where id=$1',['mca-smu',original.data,original.updated_at]).catch(error=>console.error('RESTORE FAILED',error.message));
 await browser.close();await db.end().catch(()=>{});
}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

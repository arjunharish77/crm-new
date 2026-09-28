/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser runner. */
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
async function main() {
 const browser = await chromium.launch({executablePath:process.env.CRM_CHROMIUM_PATH,headless:true});
 try {
  const context = await browser.newContext({storageState:process.env.CRM_AUDIT_AUTH_STATE,viewport:{width:390,height:800}});
  const page = await context.newPage(); const results=[];
  const out='ui-audit-2026-09/ai-report-final';fs.mkdirSync(out,{recursive:true});
  async function query(definition) {const r=await context.request.post('http://localhost:3000/api/reports/query',{data:definition});assert.equal(r.status(),200);return r.json()}
  const prior=JSON.parse(fs.readFileSync('ui-audit-2026-09/ai-report-extended-fixed/results.json','utf8'));
  for(const name of ['filtered','dates','empty']) {
   const definition=prior.find(r=>r.name===name).definition;
   const all=await query({root:definition.root,fields:definition.fields,limit:1000});
   const expected=all.rows.filter(row=>name==='filtered'?Number(row['lead.score'])>=10:name==='dates'?Date.parse(row['lead.createdAt'])>=Date.parse('2026-01-01'):row['lead.name']==='__AI_REPORT_NO_MATCH_20260912__');
   if(definition.orderBy)expected.sort((a,b)=>name==='filtered'?Number(b['lead.score'])-Number(a['lead.score']):Date.parse(b['lead.createdAt'])-Date.parse(a['lead.createdAt']));
   const actual=await query(definition);assert.equal(actual.meta.totalRows,expected.length);const limited=expected.slice(0,definition.limit||200);assert.equal(actual.rows.length,limited.length);
   const validRows=new Set(expected.map(row=>JSON.stringify(row)));assert.ok(actual.rows.every(row=>validRows.has(JSON.stringify(row))));
   if(name!=='empty'){const key=name==='filtered'?'lead.score':'lead.createdAt';assert.deepEqual(actual.rows.map(row=>row[key]),limited.map(row=>row[key]));}
   results.push({name:name+'-independent-filter-sort-check',status:'passed',matched:actual.meta.totalRows,returned:actual.rows.length});
  }
  const writes=[];
  await page.route('**/api/**',r=>{const key=new URL(r.request().url()).pathname;if(r.request().method()!=='GET'&&!['/api/ai/nl-report','/api/reports/query'].includes(key)){writes.push(key);return r.abort()}return r.continue()});
  await page.goto('http://localhost:3000/dashboard/reports');await page.getByRole('heading',{name:'Reports & Analytics'}).waitFor();await page.waitForTimeout(1500);
  await page.getByLabel('Report section',{exact:true}).selectOption('builder');await page.getByLabel('Row Limit',{exact:true}).fill('17');
  await page.getByText('Build with AI',{exact:true}).click();await page.getByLabel('Describe your report for AI',{exact:true}).fill('Show up to 5 leads created on or after 2026-01-01. Include name and created date, newest first.');
  const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/nl-report',{timeout:65000});await page.getByRole('button',{name:'Ask AI',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),200);const generated=await response.json();assert.ok(generated.preview.rows.length>0);await page.waitForTimeout(500);
  const manual=await query(generated.definition);assert.deepEqual(manual,generated.preview);assert.equal(await page.getByLabel('Row Limit',{exact:true}).inputValue(),'5');
  const requestPromise=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/reports/query'&&r.method()==='POST');await page.getByRole('button',{name:'Run Preview',exact:true}).click();const payload=(await requestPromise).postDataJSON();assert.equal(payload.savedViewId,null);assert.deepEqual(payload.orderBy,generated.definition.orderBy);assert.equal(payload.limit,5);
  await page.getByRole('tab',{name:'Preview',exact:true}).click();await page.waitForTimeout(500);await page.screenshot({path:out+'/preview-390.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  results.push({name:'live-ai-builder-date-preview',status:'passed',returned:generated.preview.rows.length});assert.deepEqual(writes,[]);results.push({name:'no-report-saves',status:'passed'});
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

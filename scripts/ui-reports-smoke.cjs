/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser runner. */
const {chromium}=require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
async function main(){
 const b=await chromium.launch({headless:true,executablePath:process.env.CRM_CHROMIUM_PATH});
 const output=path.resolve('ui-audit-2026-09/phase-f-reports');fs.mkdirSync(output,{recursive:true});const results=[];
 try{
 const c=await b.newContext({storageState:process.env.CRM_AUDIT_AUTH_STATE,viewport:{width:390,height:720}});const p=await c.newPage();p.setDefaultTimeout(15000);
 let failCatalog=true,failSaved=true;const writes=[];
 const report={id:'fixture-report',name:'LongReportName'.repeat(12),module:'LEADS',createdAt:'2026-09-11T00:00:00Z',config:{queryDefinition:{root:'lead',fields:[{object:'lead',field:'name',label:'Lead name'}],filters:[]}}};
 await p.route('**/api/reports/**',r=>{const key=new URL(r.request().url()).pathname;if(r.request().method()!=='GET'){writes.push(key);return r.fulfill({status:200,contentType:'application/json',body:'{}'})}let data={total:0,byStage:[],bySource:[]},status=200;if(key==='/api/reports/query'){data={objects:{lead:['name','email','createdAt']}};if(failCatalog)status=503}if(key==='/api/reports/custom'){data=[report];if(failSaved)status=503}return r.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?data:{message:'Fixture unavailable'})})});
 await p.goto('http://localhost:3000/dashboard/reports');await p.getByRole('heading',{name:'Reports & Analytics'}).waitFor();await p.waitForTimeout(2000);
 async function section(value){await p.setViewportSize({width:390,height:720});await p.getByLabel('Report section',{exact:true}).selectOption(value)}
 async function fit(name){for(const width of [320,768,1280]){await p.setViewportSize({width,height:720});await p.waitForTimeout(250);const failures=await p.evaluate(()=>{const bad=[];if(document.documentElement.scrollWidth>innerWidth+1)bad.push('document overflow');for(const el of document.querySelectorAll('main input, main button, main select, main [role="combobox"]')){if(!el.getClientRects().length||el.closest('table,[role="tablist"]'))continue;const r=el.getBoundingClientRect();if(r.x < -1 || r.right>innerWidth+1)bad.push(el.outerHTML.slice(0,150))}return bad});assert.deepEqual(failures,[],name+' '+width);await p.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});results.push({name,width,status:'passed',source:'fixture'})}}
 await section('saved');await p.getByText('Saved reports could not be loaded.').waitFor();failSaved=false;await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByText(report.name,{exact:true}).waitFor();await fit('saved-library');
 // Edit must work even before the builder has ever mounted.
 await p.getByRole('button',{name:'Edit',exact:true}).click();await p.getByText('Report fields could not be loaded.').waitFor();failCatalog=false;await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByLabel('Report Name',{exact:true}).waitFor();assert.equal(await p.getByLabel('Report Name',{exact:true}).inputValue(),report.name);results.push({name:'first-visit-edit-and-independent-retries',status:'passed'});
 await p.getByLabel('Report Name',{exact:true}).fill('Unsaved report draft');await fit('builder-setup');
 await p.getByRole('tab',{name:'Columns',exact:true}).click();await p.getByRole('button',{name:'Add Column',exact:true}).click();await fit('builder-columns');
 await p.getByRole('tab',{name:'Filters & Sort',exact:true}).click();await p.getByRole('button',{name:'Add Filter',exact:true}).click();await fit('builder-filters');
 await section('saved');await section('builder');await p.getByRole('tab',{name:'Setup',exact:true}).click();assert.equal(await p.getByLabel('Report Name',{exact:true}).inputValue(),'Unsaved report draft');await p.getByRole('tab',{name:'Columns',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Remove column',exact:true}).count(),2);results.push({name:'draft-and-column-retention',status:'passed'});
 assert.deepEqual(writes,['/api/reports/custom/fixture-report/open']);results.push({name:'only-intercepted-open-usage-write',status:'passed',writes});
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,output}));
 }finally{await b.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser runner. */
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
async function main() {
 const browser=await chromium.launch({executablePath:process.env.CRM_CHROMIUM_PATH,headless:true});
 const output='ui-audit-2026-09/ai-workflows'; fs.mkdirSync(output,{recursive:true}); const results=[];
 try {
  const context=await browser.newContext({storageState:process.env.CRM_AUDIT_AUTH_STATE,viewport:{width:390,height:800}});
  const page=await context.newPage(); page.setDefaultTimeout(15000);
  const workflows=[['review_qualification','Qualification review'],['plan_reengagement','Follow-up plan'],['prepare_objection_coaching','Objection preparation'],['prepare_handoff','Rep handoff brief']];
  const records={};
  for(const [type,path] of [['LEAD','leads'],['OPPORTUNITY','opportunities']]) {const response=await context.request.get('http://localhost:3000/api/'+path+'?limit=1');assert.equal(response.status(),200);const data=await response.json();records[type]=(Array.isArray(data)?data:data.data||data[path]||[])[0]?.id;assert.ok(records[type]);}
  await page.goto('http://localhost:3000/dashboard/leads/'+records.LEAD);await page.waitForTimeout(1500);
  await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('button',{name:'AI Assistant',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:/AI Assistant/});
  for(const type of ['LEAD','OPPORTUNITY']) for(const [key,label] of workflows) {
   let response;
   if(type==='LEAD') {
    await sheet.getByRole('combobox',{name:'Workflow',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();
    const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/assist',{timeout:65000});
    await sheet.getByRole('button',{name:'Generate workflow',exact:true}).click();assert.ok(await sheet.getByRole('button',{name:'Summarize',exact:true}).isDisabled());response=await pending;
   } else response=await context.request.post('http://localhost:3000/api/ai/assist',{data:{action:key,entityType:type,entityId:records[type]},timeout:65000});
   const data=await response.json();assert.equal(response.status(),200,JSON.stringify({type,key,error:data.message||data.error}));assert.ok(data.text?.trim().length>30);
   results.push({type,workflow:key,status:'passed',textLength:data.text.length,words:data.text.trim().split(/\s+/).length,source:type==='LEAD'?'live browser and Groq':'live API and Groq'});
   fs.writeFileSync(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
   if(type==='LEAD'&&key==='prepare_handoff') {
    await sheet.getByRole('button',{name:'Copy AI result',exact:true}).waitFor();
    for(const width of [320,1280]) {await page.setViewportSize({width,height:800});await page.waitForTimeout(250);const box=await sheet.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+'/workflow-'+width+'.png'});results.push({name:'workflow-layout',width,status:'passed'});}
   }
   await page.waitForTimeout(10000);
  }
  fs.writeFileSync(output+'/results.json',JSON.stringify(results,null,2));console.log('Workflow generation complete; no sends, owner changes or task creation.');
 } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

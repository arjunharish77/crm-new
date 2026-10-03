/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser runner. */
// Read-only fixtures and unsaved drafts. No external requests or configuration mutations.
const {chromium}=require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CRM_CHROMIUM_PATH || undefined});
 const output=process.env.CRM_UI_OUTPUT || path.resolve('ui-audit-2026-09/phase-e-integrations-interactions');fs.mkdirSync(output,{recursive:true});const results=[];
 try{
  const c=await browser.newContext({storageState:process.env.CRM_AUDIT_AUTH_STATE,viewport:{width:390,height:720}});const p=await c.newPage();p.setDefaultTimeout(15000);let mutations=0;let failTelephony=true;let failMarketplace=true;const failedSections=new Set(['/api/integrations/inbound/settings','/api/communications/providers','/api/settings/integrations/external','/api/settings/integrations/health']);
  const app={id:'fixture-app',installId:'fixture-install',name:'LongMarketplaceAppName'.repeat(7),description:'Read-only UI fixture',category:'CUSTOM',installStatus:'INSTALLED',publishStatus:'DRAFT',requestedPermissions:{leads:'read'}};
  await p.route('**/api/**',r=>{
   const url=new URL(r.request().url());const key=url.pathname;
   if(!['/api/integrations/','/api/settings/integrations/','/api/communications/','/api/marketplace/'].some(prefix=>key.startsWith(prefix)))return r.continue();
   if(r.request().method()!=='GET'){mutations++;return r.abort()}
   let data=[];let status=200;
   if(key==='/api/integrations/telephony'){data={config:{}};if(failTelephony)status=503}
   if(key==='/api/integrations/inbound/settings')data={currentSecret:'fixture-secret',previousSecret:null};
   if(key==='/api/settings/integrations/health')data={checks:[],checkedAt:'2026-09-11T00:00:00Z'};
   if(key==='/api/marketplace/apps'){data=[app];if(failMarketplace)status=503}
   if(key.endsWith('/sync-config'))data={syncDirection:'BIDIRECTIONAL',conflictResolution:'CRM_WINS',enabledModules:['leads'],notifyOnFailure:true};
   if(failedSections.has(key))status=503;
   return r.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?data:{message:'Fixture unavailable'})});
  });
  async function fit(name,scope){for(const width of [320,1280]){
   await p.setViewportSize({width,height:720});await p.waitForTimeout(200);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' document overflow');
   const controls=await scope.locator('input:visible,button:visible,select:visible,textarea:visible').evaluateAll(es=>es.filter(e=>!e.closest('table')).map(e=>({label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,60),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
   assert.ok(controls.every(e=>e.left>=0&&e.right<=width+1),name+' clipped controls: '+JSON.stringify(controls.filter(e=>e.left<0||e.right>width+1)));
   const dialog=p.getByRole('dialog');if(await dialog.count()){const bounds=await dialog.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=721,name+' dialog bounds');const titles=await dialog.getByRole('heading').evaluateAll(es=>es.map(e=>({client:e.clientWidth,scroll:e.scrollWidth})));assert.ok(titles.every(e=>e.scroll<=e.client+1),name+' clipped title');}
   await p.screenshot({path:path.join(output,name+'-'+width+'.png')});results.push({scenario:name,width,fixture:true,result:'passed'});
  }}
  await p.goto((process.env.CRM_UI_BASE_URL || 'http://localhost:3000')+'/dashboard/settings/integrations');
  const section=p.getByRole('combobox',{name:'Integration section',exact:true});const chooseSection=async key=>{await p.setViewportSize({width:390,height:720});await section.selectOption(key)};await section.waitFor();await p.waitForTimeout(2000);
  await chooseSection('3');const error=p.getByRole('alert').filter({hasText:'Unable to load telephony.'});await error.waitFor();assert.equal(await p.getByRole('combobox',{name:'Telephony section',exact:true}).count(),0);failTelephony=false;await error.getByRole('button',{name:'Retry',exact:true}).click();await p.getByRole('combobox',{name:'Telephony section',exact:true}).waitFor();results.push({scenario:'Telephony failure blocks editing until Retry',fixture:true,result:'passed'});
  for(const [sectionKey,endpoint,message] of [['1','/api/integrations/inbound/settings','Unable to load inbound capture.'],['4','/api/communications/providers','Unable to load messaging.'],['5','/api/settings/integrations/external','Unable to load external integrations.'],['6','/api/settings/integrations/health','Unable to load connector health.']]){await chooseSection(sectionKey);const error=p.getByRole('alert').filter({hasText:message});await error.waitFor();failedSections.delete(endpoint);await error.getByRole('button',{name:'Retry',exact:true}).click();await error.waitFor({state:'detached'});results.push({scenario:message+' Retry recovers',fixture:true,result:'passed'});}
  for(const key of ['0','1','2','3','4','5','6']){await chooseSection(key);await p.waitForTimeout(300);await fit('integration-section-'+key,p.locator('[data-slot="settings-content"]'));}
  await chooseSection('3');const telephony=p.getByRole('combobox',{name:'Telephony section',exact:true});
  for(const option of await telephony.locator('option').evaluateAll(es=>es.map(e=>e.value))){await telephony.selectOption(option);await fit('telephony-'+option,p.locator('[data-slot="settings-content"]'));}
  await telephony.selectOption('virtual');const draft=p.getByLabel('Default Agent Number',{exact:true});await draft.fill('5551234567');await chooseSection('4');await chooseSection('3');assert.equal(await draft.inputValue(),'5551234567');results.push({scenario:'Integration section switches preserve telephony draft',fixture:true,result:'passed'});
  await chooseSection('0');await p.getByRole('button',{name:'Add Webhook',exact:true}).click();let dialog=p.getByRole('dialog');await dialog.getByLabel('Webhook Name',{exact:true}).fill('Unsaved webhook');await fit('webhook-dialog',dialog);await p.keyboard.press('Escape');
  await p.goto((process.env.CRM_UI_BASE_URL || 'http://localhost:3000')+'/dashboard/settings/integrations/marketplace');const marketplaceError=p.getByRole('alert').filter({hasText:'Unable to load marketplace data.'});await marketplaceError.waitFor();failMarketplace=false;await marketplaceError.getByRole('button',{name:'Retry',exact:true}).click();await p.getByText(app.name,{exact:true}).waitFor();results.push({scenario:'Marketplace failure and Retry',fixture:true,result:'passed'});
  await fit('marketplace-collapsed',p.locator('[data-slot="settings-content"]'));await p.getByText('App actions',{exact:true}).click();await fit('marketplace-actions',p.locator('[data-slot="settings-content"]'));
  await p.getByRole('button',{name:'Register App',exact:true}).click();dialog=p.getByRole('dialog');await dialog.getByLabel('Name',{exact:true}).fill('Unsaved app');await fit('marketplace-register',dialog);await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'Sync',exact:true}).click();dialog=p.getByRole('dialog');await dialog.getByRole('button',{name:'Add Mapping',exact:true}).click();await fit('marketplace-sync',dialog);await p.keyboard.press('Escape');
  assert.equal(mutations,0,'No configuration mutations allowed');fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('PASS '+results.length+' integration checks');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

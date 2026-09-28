/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium}=require(process.env.CRM_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs');const assert=require('node:assert/strict');
async function main(){const browser=await chromium.launch({executablePath:process.env.CRM_CHROMIUM_PATH,headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 let fail=true;const rules=[];
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let data=[];
  if(path==='/api/auth/me')data={id:'fixture',tenantId:'fixture',name:'Fixture admin',isTenantAdmin:true,role:{name:'Tenant Admin',permissions:{modules:{admin:'full'}}}};
  if(path==='/api/settings/duplicate-rules'){
   if(route.request().method()==='POST'){if(fail)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'This rule changed. Reload before saving.'})});const input=JSON.parse(route.request().postData());data={...input,id:'11111111-1111-4111-8111-111111111111',version:1};rules.push(data);}else data=rules;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://localhost:3000/dashboard/settings/duplicate-rules');await page.getByLabel('Name',{exact:true}).waitFor();
 await page.getByLabel('Name',{exact:true}).fill('Email rule');await page.getByLabel('email',{exact:true}).check();await page.getByRole('button',{name:'Save rule',exact:true}).click();await page.getByRole('alert').filter({hasText:'This rule changed'}).waitFor();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Email rule');results.push('Failed save retains draft');
 fail=false;await page.getByRole('button',{name:'Save rule',exact:true}).click();await page.getByRole('status').filter({hasText:'Rule saved.'}).waitFor();results.push('Save succeeds after retry');
 const out='ui-audit-2026-09/release-readiness';fs.mkdirSync(out,{recursive:true});
 for(const width of [320,768,1280])for(const dark of [false,true]){await page.setViewportSize({width,height:900});await page.evaluate(d=>{document.documentElement.classList.toggle('dark',d);document.documentElement.style.fontSize='32px';},dark);await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow ${width}`);results.push(`No overflow at ${width}px, ${dark?'dark':'light'}, 200% text`);await page.screenshot({path:`${out}/duplicate-rules-${width}-${dark?'dark':'light'}.png`,fullPage:true});}
 await page.evaluate(()=>document.documentElement.style.fontSize='');await page.getByRole('button',{name:'New rule',exact:true}).click();await page.getByLabel('Module',{exact:true}).selectOption('Opportunity');await page.getByLabel('leadId',{exact:true}).check();await page.getByLabel('opportunityTypeId',{exact:true}).check();await page.getByLabel('When a duplicate matches').selectOption('WARN');results.push('Opportunity composite warning rule selectable');
 assert.deepEqual(errors,[]);results.push('No browser exceptions');fs.writeFileSync(out+'/ui-results.json',JSON.stringify({checks:results.length,results},null,2));console.log(JSON.stringify({status:'passed',checks:results.length}));
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});

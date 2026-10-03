/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser runner. */
// Intercepts user updates: no real accounts are changed.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CRM_CHROMIUM_PATH || undefined});
 const output=process.env.CRM_UI_OUTPUT || path.resolve('ui-audit-2026-09/phase-e-user-bulk');
 fs.mkdirSync(output,{recursive:true});
 const results=[];
 try {
  const c=await browser.newContext({storageState:process.env.CRM_AUDIT_AUTH_STATE,viewport:{width:1280,height:720}});
  const p=await c.newPage();p.setDefaultTimeout(15000);
  const users=[1,2,3].map(n=>({id:'ui-fixture-user-'+n,name:'UI fixture user '+n,email:'ui-fixture-'+n+'@example.test',status:'ACTIVE',createdAt:'2026-01-01T00:00:00Z'}));
  let fail=true;const writes=[];
  await p.route('**/api/users',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(users)}));
  await p.route('**/api/users/**',async r=>{
   if(r.request().method()!=='PATCH') return r.fulfill({status:501,contentType:'application/json',body:JSON.stringify({message:'Fixture: bulk manager assignment is unavailable'})});
   const id=new URL(r.request().url()).pathname.split('/').at(-1);
   const user=users.find(u=>u.id===id);assert.ok(user,'Only fixture users may be updated');
   assert.deepEqual(r.request().postDataJSON(),{status:'INACTIVE'});writes.push(id);
   await new Promise(resolve=>setTimeout(resolve,400));
   if(fail && id==='ui-fixture-user-2') return r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Fixture: user cannot be changed'})});
   user.status='INACTIVE';return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)});
  });
  await p.goto((process.env.CRM_UI_BASE_URL || 'http://localhost:3000')+'/dashboard/settings/access/users');
  await p.getByText('UI fixture user 1',{exact:true}).waitFor();await p.waitForTimeout(2000);
  await p.getByRole('checkbox',{name:'Select all rows on this page',exact:true}).check();
  assert.equal(await p.getByRole('checkbox',{name:'Select row',exact:true}).count(),3);
  assert.equal(await p.getByRole('button',{name:'Delete',exact:true}).count(),0);
  for(const width of [320,1280]){
   await p.setViewportSize({width,height:720});await p.waitForTimeout(300);
   const button=p.getByRole('button',{name:'Deactivate',exact:true});const rect=await button.boundingBox();
   assert.ok(rect && rect.x>=0 && rect.x+rect.width<=width && rect.y+rect.height<=720);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await p.screenshot({path:path.join(output,'selection-'+width+'.png')});
   results.push({scenario:'Named bulk action and toolbar containment',width,fixture:true,result:'passed'});
  }
  p.once('dialog',d=>d.dismiss());await p.getByRole('button',{name:'Deactivate',exact:true}).click();assert.equal(writes.length,0);
  results.push({scenario:'Cancel confirmation sends no updates',fixture:true,result:'passed'});
  p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Deactivate',exact:true}).click();
  await p.getByRole('button',{name:'Deactivating…',exact:true}).waitFor();
  assert.equal(await p.getByRole('button',{name:'Deactivating…',exact:true}).isDisabled(),true);
  await p.getByText('2 of 3 users deactivated. 1 failed and remain selected for retry.',{exact:true}).waitFor();
  assert.deepEqual(writes,[...users.map(u=>u.id)]);
  const checked=await p.getByRole('checkbox',{name:'Select row',exact:true}).evaluateAll(els=>els.map(el=>el.getAttribute('data-state')));
  assert.deepEqual(checked,['unchecked','checked','unchecked']);
  results.push({scenario:'Select all updates every ID; partial failure keeps only failed users selected',fixture:true,result:'passed'});
  fail=false;p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Deactivate',exact:true}).click();
  await p.getByText('1 users deactivated',{exact:true}).waitFor();
  assert.deepEqual(writes,['ui-fixture-user-1','ui-fixture-user-2','ui-fixture-user-3','ui-fixture-user-2']);
  assert.equal(await p.getByRole('button',{name:'Deactivate',exact:true}).count(),0);
  await p.reload();await p.getByText('UI fixture user 1',{exact:true}).waitFor();
  assert.equal(await p.getByText('INACTIVE',{exact:true}).count(),3);
  results.push({scenario:'Retry sends only failed ID; refreshed data reflects successful responses',fixture:true,result:'passed'});
  await p.getByRole('checkbox',{name:'Select row',exact:true}).first().check();
  await p.getByRole('button',{name:'Manager',exact:true}).click();
  const dialog=p.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await p.getByRole('option',{name:/UI fixture user 2/}).click();
  await dialog.getByRole('button',{name:'Assign Manager',exact:true}).click();
  await p.getByText('Fixture: bulk manager assignment is unavailable',{exact:true}).waitFor();
  assert.equal(await dialog.isVisible(),true);
  assert.match(await dialog.getByRole('combobox').innerText(),/UI fixture user 2/);
  assert.equal(await p.getByText('Manager assigned successfully (Mock)',{exact:true}).count(),0);
  results.push({scenario:'Failed manager request preserves dialog and draft without fake success',fixture:true,result:'passed'});
  await p.keyboard.press('Escape');
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('PASS '+results.length+' user bulk checks');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

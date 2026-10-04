// Isolated real component, locally fulfilled document and blocked/mocked API. No DB or account changes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('esbuild');const {chromium}=require(process.env.UV_PLAYWRIGHT_MODULE||'playwright');
let checks=0;function check(a,b){assert.deepEqual(a,b);checks++;}
(async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {SetupForm} from './src/components/setup-form';createRoot(document.getElementById('root')).render(<section className="admin-shell"><div className="container"><div className="card admin-card"><h1>Create CMS admin</h1><SetupForm/></div></div></section>);`,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},plugins:[{name:'isolated-next-link',setup(builder){builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",resolveDir:path.resolve(__dirname,'..'),loader:'js'}));}}],bundle:true,write:false,platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch({headless:true,...(process.env.UV_CHROMIUM_PATH?{executablePath:process.env.UV_CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage();
 await page.route('**/*',r=>r.request().method()==='GET'?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>'}):r.abort());
 await page.goto('http://localhost/__isolated_setup');await page.addStyleTag({content:fs.readFileSync(path.resolve(__dirname,'../src/styles/globals.css'),'utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByLabel('Name',{exact:true}).fill('UI fixture');await page.getByLabel('Email',{exact:true}).fill('setup-ui@example.invalid');await page.getByLabel('Password',{exact:true}).fill('fake-password-only');await page.getByLabel('Setup token',{exact:true}).fill('fake-token-only');
 await page.getByRole('button',{name:'Show password',exact:true}).click();check(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');await page.getByRole('button',{name:'Hide password',exact:true}).click();
 await page.getByRole('button',{name:'Create admin',exact:true}).click();await page.getByRole('alert').waitFor();check((await page.getByRole('alert').innerText()).includes('Try signing in first'),true);
 check(await page.getByLabel('Password',{exact:true}).inputValue(),'fake-password-only');check(await page.getByLabel('Setup token',{exact:true}).inputValue(),'fake-token-only');check(await page.getByRole('button',{name:'Create admin',exact:true}).isEnabled(),true);
 await page.route('**/api/admin/setup',r=>r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Mock rejected token'})}));await page.getByRole('button',{name:'Create admin',exact:true}).click();await page.getByText('Mock rejected token',{exact:true}).waitFor();checks++;
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.route('**/api/admin/setup',r=>{const payload=r.request().postDataJSON();check(Object.hasOwn(payload,'setupToken'),false);check(r.request().headers()['x-cms-setup-token'],'fake-token-only');return r.fulfill({contentType:'application/json',body:'{}'});});
 await page.getByRole('button',{name:'Create admin',exact:true}).click();await page.getByRole('status').waitFor();check(await page.getByRole('button',{name:'Create admin',exact:true}).isDisabled(),true);check(await page.getByRole('link',{name:'Go to sign in',exact:true}).getAttribute('href'),'/admin/login');
 await page.setViewportSize({width:390,height:844});if(process.env.UV_SCREENSHOT_PATH)await page.screenshot({path:process.env.UV_SCREENSHOT_PATH});
 console.log(`PASS ${checks} isolated setup UI checks; no live app, database or account mutation.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

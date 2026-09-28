/** Local-only platform provisioning checks; creates and removes isolated test tenants. */
import { createRequire } from 'module';import { randomUUID } from 'crypto';import assert from 'node:assert/strict';
import { getPool } from '../src/lib/db/pool';
import { createTenantWithAdmin,getTenantFeatureFlags } from '../src/lib/repositories/auth-admin-postgres';
import { getTenantModuleEntitlements } from '../src/lib/server/module-entitlements';
const require=createRequire(import.meta.url);const d=require('./db-utils.js');
async function main(){
 for(const url of [d.directDatabaseUrl(),d.appDatabaseUrl()])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local database required');
 const pool=getPool();const q=(sql:string,args:unknown[]=[])=>pool.query(sql,args);const ids:string[]=[];let checks=0;const check=(v:unknown)=>{assert.ok(v);checks++;};
 const marker='Provisioning smoke '+randomUUID();const input={name:marker,adminName:'Isolated test admin',adminEmail:randomUUID()+'@example.invalid',adminPassword:randomUUID()+'Aa1!',modules:{OPPORTUNITIES:false,AI_COPILOT:false,PAYOUTS:false},features:{apiAccessEnabled:true,salesGroupsEnabled:false}};
 try{
 const actor=(await q('select id from "User" where email=$1',['admintest@test.com'])).rows[0];assert.ok(actor);
 const result=await createTenantWithAdmin(input,actor);ids.push(result.tenantId);
 const catalog=(await q('select "key","isCore" from "PlatformModule"')).rows;
 const entitlements=await getTenantModuleEntitlements(result.tenantId);check(entitlements.length===catalog.length);check(entitlements.length===28);check(entitlements.filter(e=>e.isCore).every(e=>e.status==='ENABLED'));
 for(const key of ['OPPORTUNITIES','AI_COPILOT','PAYOUTS'])check(entitlements.find(e=>e.key===key)?.status==='DISABLED');
 const flags=await getTenantFeatureFlags(result.tenantId);check(flags.opportunityEnabled===false);check(flags.payoutsEnabled===false);check(flags.apiAccessEnabled===true);check(flags.salesGroupsEnabled===false);
 check(Number((await q('select count(*) from "TenantModuleAuditLog" where "tenantId"=$1 and "performedBy"=$2',[result.tenantId,actor.id])).rows[0].count)===catalog.length);
 check((await q('select id from "User" where id=$1 and "tenantId"=$2',[result.userId,result.tenantId])).rowCount===1);
 await assert.rejects(()=>createTenantWithAdmin({...input,adminEmail:randomUUID()+'@example.invalid',modules:{LEADS:false}},actor),/CORE_MODULE_CANNOT_BE_DISABLED/);checks++;
 const rollbackName=marker+' rollback';await assert.rejects(()=>createTenantWithAdmin({...input,name:rollbackName,adminEmail:randomUUID()+'@example.invalid'},{id:randomUUID()}),/foreign key/);checks++;
 check((await q('select id from "Tenant" where name=$1',[rollbackName])).rowCount===0);
 console.log(JSON.stringify({status:'passed',checks,catalogModules:catalog.length,coreModules:catalog.filter(e=>e.isCore).length}));
 }finally{
 const tables=(await q(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)).rows.map(r=>r.table_name as string);
 for(let pass=0;pass<8;pass++)for(const table of tables)await q(`delete from "${table.replaceAll('"','""')}" where "tenantId"=any($1::text[])`,[ids]).catch(()=>undefined);
 await q('delete from "Tenant" where id=any($1::text[])',[ids]);await pool.end();
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

import { describe,it,expect,vi,beforeEach } from 'vitest';
import { tenantProvisioningSchema,resolveTenantProvisioning,effectiveTenantFeatures } from '@/lib/tenant-provisioning';
const catalog=[{key:'LEADS',name:'Leads',category:'CORE',isCore:true},{key:'OPPORTUNITIES',name:'Opportunities',category:'SALES',isCore:false},{key:'AI_COPILOT',name:'AI',category:'AI',isCore:false},{key:'PAYOUTS',name:'Payouts',category:'PARTNER',isCore:false}];
const input={name:'Tenant',adminName:'Admin',adminEmail:'admin@example.invalid',adminPassword:'Test-only-pass'};
describe('tenant provisioning selection',()=>{
 it('persists every catalog module and matches legacy flags to selected modules',()=>{const result=resolveTenantProvisioning(catalog,{...input,modules:{OPPORTUNITIES:false,AI_COPILOT:false,PAYOUTS:false},features:{apiAccessEnabled:true}});expect(result.modules).toHaveLength(4);expect(result.modules.find(m=>m.moduleKey==='AI_COPILOT')?.status).toBe('DISABLED');expect(result.features).toMatchObject({opportunityEnabled:false,payoutsEnabled:false,apiAccessEnabled:true});});
 it('preserves old caller defaults and the legacy Opportunities switch',()=>{const result=resolveTenantProvisioning(catalog,{...input,opportunityEnabled:false});expect(result.features.apiAccessEnabled).toBe(false);expect(result.modules.find(m=>m.moduleKey==='OPPORTUNITIES')?.status).toBe('DISABLED');});
 it('rejects unknown modules and disabled core modules before provisioning',()=>{expect(()=>resolveTenantProvisioning(catalog,{...input,modules:{UNKNOWN:true}})).toThrow('UNKNOWN_MODULE_SELECTION');expect(()=>resolveTenantProvisioning(catalog,{...input,modules:{LEADS:false}})).toThrow('CORE_MODULE_CANNOT_BE_DISABLED');expect(()=>resolveTenantProvisioning([],input)).toThrow('MODULE_CATALOG_UNAVAILABLE');});
 it('rejects malformed switches and unknown feature flags',()=>{expect(tenantProvisioningSchema.safeParse({...input,modules:{LEADS:'false'}}).success).toBe(false);expect(tenantProvisioningSchema.safeParse({...input,features:{unknown:true}}).success).toBe(false);});
 it('disabled and suspended catalog modules override true feature flags',()=>{expect(effectiveTenantFeatures({opportunityEnabled:true,payoutsEnabled:true},{OPPORTUNITIES:'DISABLED',PAYOUTS:'SUSPENDED'})).toEqual({opportunityEnabled:false,payoutsEnabled:false});expect(effectiveTenantFeatures({opportunityEnabled:true},{OPPORTUNITIES:'TRIAL'}).opportunityEnabled).toBe(true);});
});
const db=vi.hoisted(()=>({query:vi.fn(),queryOne:vi.fn(),execute:vi.fn()}));
const tx=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/lib/db/query',()=>db);
vi.mock('@/lib/db/transaction',()=>({withTransaction:async(_:unknown,fn:(tx:unknown)=>Promise<unknown>)=>fn(tx)}));
vi.mock('bcryptjs',()=>({default:{hash:vi.fn().mockResolvedValue('test-hash')}}));
describe('atomic tenant provisioning repository',()=>{
 beforeEach(()=>{vi.clearAllMocks();db.query.mockResolvedValue(catalog);db.queryOne.mockImplementation(async(_sql:string,args:unknown[])=>({id:args[0]}));});
 it('writes selected entitlements, feature flags and audit rows in the same transaction as tenant/admin',async()=>{const {createTenantWithAdmin}=await import('@/lib/repositories/auth-admin-postgres');await createTenantWithAdmin({...input,modules:{AI_COPILOT:false,OPPORTUNITIES:false}},{id:'platform-admin'});const calls=db.queryOne.mock.calls;expect(calls.every(c=>c[2]===tx)).toBe(true);expect(calls.filter(c=>c[0].startsWith('insert into "TenantModuleEntitlement"'))).toHaveLength(4);expect(calls.filter(c=>c[0].startsWith('insert into "TenantModuleAuditLog"'))).toHaveLength(4);expect(calls.find(c=>c[0].startsWith('insert into "TenantFeature"'))?.[1]).toContain(false);});
 it('does not insert any tenant data for an invalid catalog selection',async()=>{const {createTenantWithAdmin}=await import('@/lib/repositories/auth-admin-postgres');await expect(createTenantWithAdmin({...input,modules:{LEADS:false}})).rejects.toThrow('CORE_MODULE_CANNOT_BE_DISABLED');expect(db.queryOne).not.toHaveBeenCalled();});
});

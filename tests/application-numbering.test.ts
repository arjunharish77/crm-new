import { describe,it,expect } from 'vitest';
import { applicationRuleSchema, defaultApplicationRule, formatApplicationNumber } from '../src/lib/application-numbering';
import { canUseApplications } from '../src/lib/application-access';
describe('application numbering',()=>{
 it('uses timezone at the financial year boundary',()=>{const rule={...defaultApplicationRule,prefix:'{FY}-{YYYY}-'};expect(formatApplicationNumber(rule,'1',new Date('2026-03-31T18:29:59Z'))).toBe('2025-26-2026-000001');expect(formatApplicationNumber(rule,'2',new Date('2026-03-31T18:30:00Z'))).toBe('2026-27-2026-000002');});
 it('keeps bigint precision and does not truncate sequence digits',()=>{expect(formatApplicationNumber({...defaultApplicationRule,prefix:'',suffix:'-X',padding:1},'9007199254740993',new Date())).toBe('9007199254740993-X');});
 it.each(['{BAD}','{YYYY','a b','<script>','{FY}}'])('rejects invalid template %s',prefix=>{expect(applicationRuleSchema.safeParse({prefix}).success).toBe(false);});
 it.each(['0','-1','1.1','1e3'])('rejects invalid sequence %s',n=>expect(()=>formatApplicationNumber(defaultApplicationRule,n,new Date())).toThrow());
 it('validates timezone, padding and financial year month',()=>{for(const input of [{timezone:'invalid'},{padding:0},{padding:13},{financialYearStartMonth:0},{financialYearStartMonth:13}])expect(applicationRuleSchema.safeParse(input).success).toBe(false);});
});
describe('application permissions',()=>{
 it('denies missing tenant and partner actors even with admin grants',()=>{expect(canUseApplications({isTenantAdmin:true},'read')).toBe(false);expect(canUseApplications({tenantId:'t',isPartner:true,isTenantAdmin:true},'read')).toBe(false);expect(canUseApplications({tenantId:'t',role:{permissions:{isPartnerRole:true,modules:{applications:'full'}}}},'read')).toBe(false);});
 it('requires explicit grants for regular users',()=>{const user={tenantId:'t',role:{permissions:{modules:{applications:{read:true}}}}};expect(canUseApplications(user,'read')).toBe(true);expect(canUseApplications(user,'create')).toBe(false);expect(canUseApplications(user,'manage')).toBe(false);expect(canUseApplications({tenantId:'t'},'read')).toBe(false);});
 it('allows tenant administrators',()=>expect(canUseApplications({tenantId:'t',isTenantAdmin:true},'manage')).toBe(true));
});
